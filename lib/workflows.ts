import { ObjectId, type Db } from 'mongodb';
import { enqueueOutbound } from '@/lib/messaging/engine';

export const workflowKinds = ['trigger','condition','action','delay'] as const;
export type WorkflowNode = { id: string; kind: typeof workflowKinds[number]; type: string; label?: string; config?: Record<string, any>; next?: string | null; yes?: string | null; no?: string | null };
export type WorkflowDefinition = { name: string; description?: string; nodes: WorkflowNode[]; entryNodeId: string; status?: 'draft'|'published'|'paused'; version?: number };
export const triggers = ['new_conversation','incoming_message','new_contact','new_lead','conversation_assigned','conversation_closed','ticket_created','ticket_status_changed','customer_tag_added','scheduled','website_chat_started'];
export const conditions = ['channel','message_content','contact_attribute','conversation_status','assigned_agent','tag','business_hours','customer_type'];
export const actions = ['assign_agent','assign_team','add_tag','remove_tag','send_message','send_email','create_ticket','update_ticket','create_lead','update_contact','notify_team','start_ai_agent','escalate_conversation'];

export function validateDefinition(input: any): string | null {
  if (!input || typeof input.name !== 'string' || !input.name.trim() || !Array.isArray(input.nodes) || input.nodes.length < 2 || input.nodes.length > 50) return 'Add a name and between 2 and 50 nodes.';
  const ids = new Set<string>();
  for (const n of input.nodes) {
    if (!n || typeof n.id !== 'string' || ids.has(n.id) || !workflowKinds.includes(n.kind) || typeof n.type !== 'string') return 'Each node needs a unique id, type, and valid kind.';
    ids.add(n.id);
    if (n.kind === 'trigger' && !triggers.includes(n.type)) return 'Choose a supported trigger.';
    if (n.kind === 'condition' && !conditions.includes(n.type)) return 'Choose a supported condition.';
    if (n.kind === 'action' && !actions.includes(n.type)) return 'Choose a supported action.';
    for (const target of [n.next,n.yes,n.no]) if (target && !input.nodes.some((x: WorkflowNode) => x.id === target)) return 'A node connection points to a missing node.';
  }
  if (!ids.has(input.entryNodeId) || input.nodes.find((n: WorkflowNode) => n.id === input.entryNodeId)?.kind !== 'trigger') return 'The entry node must be a trigger.';
  return null;
}

export async function queueWorkflow(db: Db, tenantId: ObjectId, workflowId: ObjectId, event: Record<string, any>, idempotencyKey: string) {
  const workflow = await db.collection('workflows').findOne({ _id: workflowId, tenantId, status: 'published' });
  if (!workflow) return { queued: false, reason: 'not_published' };
  const executionId = new ObjectId();
  try {
    await db.collection('workflowExecutions').insertOne({ _id: executionId, tenantId, workflowId, workflowVersion: workflow.version || 1, idempotencyKey, status: 'queued', event, logs: [], createdAt: new Date(), updatedAt: new Date() });
  } catch (e: any) { if (e?.code === 11000) return { queued: false, reason: 'duplicate' }; throw e; }
  try {
    const { inngest } = await import('@/lib/inngest');
    await inngest.send({ name: 'workflow/execute', id: executionId.toString(), data: { tenantId: tenantId.toString(), workflowId: workflowId.toString(), executionId: executionId.toString() } });
    return { queued: true, executionId: executionId.toString() };
  } catch (e) {
    await db.collection('workflowExecutions').updateOne({ _id: executionId, tenantId }, { $set: { status: 'failed', error: 'Could not queue execution', updatedAt: new Date() }, $push: { logs: { $each: [{ at: new Date(), message: 'Queue unavailable' }] } } } as any);
    throw e;
  }
}

export async function dispatchWorkflowEvent(db: Db, tenantId: ObjectId, eventName: string, event: Record<string, any>, idempotencyKey: string) {
  const workflows: any[] = await db.collection('workflows').find({ tenantId, status: 'published' }).toArray();
  const queued: string[] = [];
  for (const workflow of workflows) {
    const trigger = workflow.nodes.find((n: WorkflowNode) => n.kind === 'trigger' && n.type === eventName);
    if (!trigger) continue;
    const result = await queueWorkflow(db, tenantId, workflow._id, { ...event, triggerType: eventName }, `${idempotencyKey}:${workflow._id}`);
    if (result.queued && result.executionId) queued.push(result.executionId);
  }
  return queued;
}

function pathValue(obj: any, path: string) { return path.split('.').reduce((v, k) => v?.[k], obj); }
function matchesCondition(node: WorkflowNode, ctx: any) {
  const c = node.config || {}, value = c.value ?? '';
  let actual: any;
  if (node.type === 'channel') actual = ctx.conversation?.channel || ctx.channel;
  else if (node.type === 'message_content') actual = ctx.message?.text || '';
  else if (node.type === 'contact_attribute') actual = pathValue(ctx.contact, c.attribute || '');
  else if (node.type === 'conversation_status') actual = ctx.conversation?.status;
  else if (node.type === 'assigned_agent') actual = ctx.conversation?.assignedTo;
  else if (node.type === 'tag') actual = ctx.conversation?.tags || ctx.contact?.tags || [];
  else if (node.type === 'business_hours') { const h = new Date().getUTCHours(); actual = h >= 9 && h < 17 && new Date().getUTCDay() > 0 && new Date().getUTCDay() < 6; return actual === (c.open !== false); }
  else if (node.type === 'customer_type') actual = ctx.contact?.type || ctx.contact?.lifecycleStage;
  const op = c.operator || 'equals';
  if (Array.isArray(actual)) return actual.includes(value);
  if (op === 'contains') return String(actual || '').toLowerCase().includes(String(value).toLowerCase());
  if (op === 'not_equals') return String(actual ?? '') !== String(value);
  return String(actual ?? '').toLowerCase() === String(value).toLowerCase();
}

async function performAction(db: Db, tenantId: ObjectId, node: WorkflowNode, ctx: any, executionId: string) {
  const c = node.config || {}, convId = ctx.conversation?._id, contactId = ctx.contact?._id, now = new Date();
  const conversation = convId ? await db.collection('conversations').findOne({ _id: new ObjectId(convId), tenantId }) : null;
  const contact = contactId ? await db.collection('contacts').findOne({ _id: new ObjectId(contactId), tenantId }) : null;
  if (convId && !conversation) throw new Error('Conversation is outside this workspace or no longer exists');
  if (contactId && !contact) throw new Error('Contact is outside this workspace or no longer exists');
  if (node.type === 'assign_agent') {
    if (!c.agentId || !await db.collection('memberships').findOne({ tenantId, userId: new ObjectId(c.agentId), status: 'active' })) throw new Error('Select an active workspace member');
    await db.collection('conversations').updateOne({ _id: conversation!._id, tenantId }, { $set: { assignedTo: c.agentId, updatedAt: now } });
  } else if (node.type === 'assign_team') {
    if (!ObjectId.isValid(c.teamId || '') || !await db.collection('teams').findOne({ _id: new ObjectId(c.teamId), tenantId })) throw new Error('Select a team in this workspace');
    await db.collection('conversations').updateOne({ _id: conversation!._id, tenantId }, { $set: { teamId: new ObjectId(c.teamId), updatedAt: now } });
  } else if (node.type === 'add_tag' || node.type === 'remove_tag') {
    if (!c.tag) throw new Error('Add a tag name');
    await db.collection('conversations').updateOne({ _id: conversation!._id, tenantId }, node.type === 'add_tag' ? { $addToSet: { tags: c.tag }, $set: { updatedAt: now } } : { $pull: { tags: c.tag }, $set: { updatedAt: now } });
  } else if (node.type === 'create_ticket') {
    const count = await db.collection('tickets').countDocuments({ tenantId });
    await db.collection('tickets').insertOne({ tenantId, subject: c.subject || `Follow up: ${conversation?.contactName || contact?.name || 'Customer'}`, description: c.description || '', status: 'open', priority: 'normal', number: `WF-${String(count + 1).padStart(6, '0')}`, contactId: contact?._id || null, conversationId: conversation?._id || null, createdAt: now, updatedAt: now });
  } else if (node.type === 'update_ticket') {
    if (!ObjectId.isValid(c.ticketId || '')) throw new Error('Select a ticket ID');
    await db.collection('tickets').updateOne({ _id: new ObjectId(c.ticketId), tenantId }, { $set: { status: c.status || 'open', updatedAt: now } });
  } else if (node.type === 'create_lead') {
    await db.collection('leads').insertOne({ tenantId, name: c.name || contact?.name || conversation?.contactName || 'Workflow lead', email: contact?.email || '', company: c.company || '', stage: 'new', source: 'workflow', contactId: contact?._id || null, createdAt: now, updatedAt: now });
  } else if (node.type === 'update_contact') {
    if (!contact) throw new Error('This action needs a contact');
    const field = ['name','email','company','lifecycleStage'].includes(c.field) ? c.field : 'lifecycleStage';
    await db.collection('contacts').updateOne({ _id: contact._id, tenantId }, { $set: { [field]: c.value || '', updatedAt: now } });
  } else if (node.type === 'notify_team') {
    await db.collection('workflowNotifications').insertOne({ tenantId, workflowExecutionId: executionId, teamId: c.teamId && ObjectId.isValid(c.teamId) ? new ObjectId(c.teamId) : null, message: c.message || `Workflow: ${ctx.workflowName}`, createdAt: now, readAt: null });
  } else if (node.type === 'start_ai_agent') {
    const agent = await db.collection('aiAgents').findOne({ _id: new ObjectId(c.agentId), tenantId, enabled: true });
    if (!agent) throw new Error('Select an enabled AI agent in this workspace');
    if (conversation) await db.collection('aiHandoffs').insertOne({ tenantId, conversationId: conversation._id, agentId: agent._id, status: 'queued', source: 'workflow', createdAt: now });
  } else if (node.type === 'escalate_conversation') {
    await db.collection('conversations').updateOne({ _id: conversation!._id, tenantId }, { $set: { priority: 'urgent', escalatedAt: now, updatedAt: now } });
  } else if (node.type === 'send_message' || node.type === 'send_email') {
    if (!conversation || !c.message) throw new Error('A conversation and message are required');
    if (!conversation.channelId) throw new Error('Conversation has no connected channel');
    const channel = await db.collection('channels').findOne({ _id: conversation.channelId, tenantId, type: conversation.channel, status: 'connected' });
    if (!channel) throw new Error('The conversation channel is not connected');
    if (conversation.channel === 'whatsapp' && !c.templateName) throw new Error('WhatsApp requires an approved template; provide its approved template name');
    const to = conversation.providerContactId || contact?.email;
    if (!to) throw new Error('Customer channel address is unavailable');
    await enqueueOutbound(db, { tenantId, conversationId: conversation._id, channel: conversation.channel, channelId: channel._id, recipientId: to, text: c.message, idempotencyKey: `workflow:${executionId}:${node.id}`, email: node.type === 'send_email' ? { subject: c.subject || 'Message from support', threadId: conversation.providerThreadId } : { templateName: c.templateName } });
    try { const { inngest } = await import('@/lib/inngest'); await inngest.send({ name: 'workflow/dispatch-messages', data: { tenantId: tenantId.toString() } }); } catch (error) { console.error('Workflow message dispatch event could not be sent', error); }
  } else throw new Error(`Action ${node.type} is not available`);
}

export async function executeWorkflow(db: Db, input: { tenantId: string; workflowId: string; executionId: string; test?: boolean }) {
  if (!ObjectId.isValid(input.tenantId) || !ObjectId.isValid(input.workflowId) || !ObjectId.isValid(input.executionId)) throw new Error('Invalid workflow execution identifiers');
  const tenantId = new ObjectId(input.tenantId), workflowId = new ObjectId(input.workflowId), executionId = new ObjectId(input.executionId);
  const execution: any = await db.collection('workflowExecutions').findOneAndUpdate({ _id: executionId, tenantId, workflowId, status: { $in: ['queued','running'] } }, { $set: { status: 'running', startedAt: new Date(), updatedAt: new Date() } }, { returnDocument: 'after' });
  if (!execution) return { skipped: true };
  const workflow: any = await db.collection('workflows').findOne({ _id: workflowId, tenantId, ...(input.test ? {} : { status: 'published' }) });
  if (!workflow || workflow.version !== execution.workflowVersion) throw new Error('Workflow version unavailable');
  const ctx: any = { ...(execution.event || {}), workflowName: workflow.name };
  if (ctx.conversationId && !ctx.conversation) {
    if (!ObjectId.isValid(ctx.conversationId)) throw new Error('Invalid conversation identifier');
    ctx.conversation = await db.collection('conversations').findOne({ _id: new ObjectId(ctx.conversationId), tenantId });
    if (!ctx.conversation) throw new Error('Conversation not found in this workspace');
    if (ctx.conversation.contactId) ctx.contact = await db.collection('contacts').findOne({ _id: ctx.conversation.contactId, tenantId });
    const latest = await db.collection('messages').find({ tenantId, conversationId: ctx.conversation._id }).sort({ createdAt: -1 }).limit(1).next();
    ctx.message = ctx.message || { text: latest?.text || '' };
  }
  if (ctx.contactId && !ctx.contact) {
    if (!ObjectId.isValid(ctx.contactId)) throw new Error('Invalid contact identifier');
    ctx.contact = await db.collection('contacts').findOne({ _id: new ObjectId(ctx.contactId), tenantId });
    if (!ctx.contact) throw new Error('Contact not found in this workspace');
  }
  const nodeMap = new Map(workflow.nodes.map((n: WorkflowNode) => [n.id,n]));
  let current: string | null = workflow.entryNodeId, count = 0;
  while (current && count < 100) {
    count++;
    const node = nodeMap.get(current) as WorkflowNode | undefined;
    if (!node) throw new Error('Workflow connection is invalid');
    if (count > 1 && node.kind === 'trigger') throw new Error('Loop protection stopped a workflow cycle');
    const at = new Date();
    try {
      if (node.kind === 'condition') current = matchesCondition(node, ctx) ? node.yes || node.next || null : node.no || null;
      else if (node.kind === 'delay') { const seconds = Math.max(0, Math.min(86400, Number(node.config?.seconds) || 0)); if (seconds) await new Promise(r => setTimeout(r, seconds * 1000)); current = node.next || null; }
      else { if (node.kind === 'action') await performAction(db, tenantId, node, ctx, executionId.toString()); current = node.next || null; }
      await db.collection('workflowExecutions').updateOne({ _id: executionId, tenantId }, { $push: { logs: { $each: [{ at, nodeId: node.id, node: node.label || node.type, status: 'completed' }] } }, $set: { updatedAt: new Date(), steps: count } } as any);
    } catch (error) {
      await db.collection('workflowExecutions').updateOne({ _id: executionId, tenantId }, { $push: { logs: { $each: [{ at, nodeId: node.id, node: node.label || node.type, status: 'failed', error: error instanceof Error ? error.message : 'Action failed' }] } }, $set: { status: 'failed', error: error instanceof Error ? error.message : 'Action failed', completedAt: new Date(), updatedAt: new Date() } } as any);
      throw error;
    }
  }
  if (count >= 100 && current) throw new Error('Execution step limit (100) exceeded');
  await db.collection('workflowExecutions').updateOne({ _id: executionId, tenantId }, { $set: { status: 'completed', completedAt: new Date(), updatedAt: new Date(), steps: count } });
  return { executionId: executionId.toString(), status: 'completed', steps: count };
}
