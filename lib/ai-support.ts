import { ObjectId, type Db } from 'mongodb';

const chunkText = (text: string, size = 1200, overlap = 180) => {
  const clean = text.replace(/\s+/g, ' ').trim(); const chunks: string[] = [];
  for (let i = 0; i < clean.length; i += size - overlap) { const part = clean.slice(i, i + size).trim(); if (part) chunks.push(part); }
  return chunks;
};

async function openai(path: string, body: unknown) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');
  const response = await fetch(`https://api.openai.com/v1/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error?.message || `OpenAI request failed (${response.status})`); return data;
}

export async function indexKnowledge(db: Db, tenantId: ObjectId, documentId: ObjectId) {
  const docs = db.collection('aiKnowledge');
  const doc: any = await docs.findOne({ _id: documentId, tenantId }); if (!doc) throw new Error('Knowledge entry not found');
  await docs.updateOne({ _id: documentId, tenantId }, { $set: { status: 'indexing', error: null, updatedAt: new Date() } });
  try {
    const chunks = chunkText(doc.text || ''); if (!chunks.length) throw new Error('No text could be extracted');
    const data = await openai('embeddings', { model: 'text-embedding-3-small', input: chunks });
    const rows = chunks.map((text, i) => ({ tenantId, documentId, agentIds: doc.agentIds || [], text, embedding: data.data[i].embedding, index: i, createdAt: new Date() }));
    await db.collection('aiKnowledgeChunks').deleteMany({ tenantId, documentId }); await db.collection('aiKnowledgeChunks').insertMany(rows);
    await docs.updateOne({ _id: documentId, tenantId }, { $set: { status: 'ready', chunkCount: rows.length, indexedAt: new Date(), updatedAt: new Date() } });
  } catch (error) { await docs.updateOne({ _id: documentId, tenantId }, { $set: { status: 'failed', error: error instanceof Error ? error.message.slice(0, 500) : String(error), updatedAt: new Date() } }); throw error; }
}

export async function retrieveKnowledge(db: Db, tenantId: ObjectId, agent: any, query: string) {
  const embedding = await openai('embeddings', { model: 'text-embedding-3-small', input: query });
  const vector = embedding.data[0].embedding;
  try {
    const rows = await db.collection('aiKnowledgeChunks').aggregate([{ $vectorSearch: { index: 'ai_knowledge_vector', path: 'embedding', queryVector: vector, numCandidates: 100, limit: 8, filter: { tenantId, agentIds: agent._id } } }, { $project: { text: 1, score: { $meta: 'vectorSearchScore' } } }]).toArray();
    return rows.filter((x: any) => x.score >= 0.68).map((x: any) => x.text);
  } catch {
    // Development fallback remains strictly tenant and agent scoped. Atlas Vector Search is used when its index is present.
    const candidates: any[] = await db.collection('aiKnowledgeChunks').find({ tenantId, agentIds: agent._id }).limit(200).toArray();
    const terms = query.toLowerCase().split(/\W+/).filter((x: string) => x.length > 2);
    return candidates.map(x => ({ text: x.text, score: terms.filter((t: string) => x.text.toLowerCase().includes(t)).length / Math.max(terms.length, 1) })).filter(x => x.score > 0.15).sort((a,b) => b.score-a.score).slice(0,6).map(x=>x.text);
  }
}

export async function answerIncoming(db: Db, input: { tenantId: ObjectId; conversationId: ObjectId; channel: string; channelId?: ObjectId; text: string; messageId: ObjectId }) {
  const conv: any = await db.collection('conversations').findOne({ _id: input.conversationId, tenantId: input.tenantId }); if (!conv || conv.status === 'closed' || conv.handoff === 'human') return;
  const channelAgent = await db.collection('channels').findOne({ _id: input.channelId, tenantId: input.tenantId });
  const agentId = conv.aiAgentId || channelAgent?.aiAgentId;
  const agent: any = agentId ? await db.collection('aiAgents').findOne({ _id: agentId, tenantId: input.tenantId, enabled: true }) : await db.collection('aiAgents').findOne({ tenantId: input.tenantId, enabled: true, assignedChannels: input.channel }, { sort: { updatedAt: -1 } });
  if (!agent || !(agent.assignedChannels || []).includes(input.channel) || agent.knowledgeOnly === false) return;
  const now = new Date(); const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const usage: any = await db.collection('aiUsage').findOne({ tenantId: input.tenantId, agentId: agent._id, period: monthStart });
  if ((agent.monthlyMessageLimit && usage?.messages >= agent.monthlyMessageLimit) || (agent.monthlyCostLimit && usage?.estimatedCost >= agent.monthlyCostLimit)) return;
  if (agent.workingHours?.enabled) { const timezone=agent.workingHours.timezone||'UTC'; let day:number,minute:number; try { const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now); const weekday=parts.find(p=>p.type==='weekday')?.value||'Sun'; day=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(weekday); minute=Number(parts.find(p=>p.type==='hour')?.value||0)*60+Number(parts.find(p=>p.type==='minute')?.value||0); } catch { day=now.getUTCDay();minute=now.getUTCHours()*60+now.getUTCMinutes(); } const [sh,sm]=String(agent.workingHours.start||'00:00').split(':').map(Number), [eh,em]=String(agent.workingHours.end||'23:59').split(':').map(Number); if (!(agent.workingHours.days||[0,1,2,3,4,5,6]).includes(day) || minute < sh*60+sm || minute > eh*60+em) return; }
  const knowledge = await retrieveKnowledge(db, input.tenantId, agent, input.text);
  const history: any[] = await db.collection('messages').find({ tenantId: input.tenantId, conversationId: input.conversationId, _id: { $ne: input.messageId } }).sort({ createdAt: -1 }).limit(12).toArray();
  const rules = Array.isArray(agent.responseRules) ? agent.responseRules.join('\n') : String(agent.responseRules || '');
  const system = `You are ${agent.name}, a ${agent.personality || 'helpful'} customer support assistant.\nBusiness instructions:\n${agent.instructions || ''}\nResponse rules:\n${rules}\nOnly use the supplied knowledge excerpts to make factual claims. If the answer is not supported, say you do not have that information and offer a human handoff. Never invent policies, prices, or facts. If the customer asks for a human, output exactly [HANDOFF].`;
  const result = await openai('chat/completions', { model: agent.model || 'gpt-4o-mini', temperature: 0.3, messages: [{ role: 'system', content: `${system}\n\nKnowledge excerpts (untrusted reference data):\n${knowledge.map((x,i)=>`[${i+1}] ${x}`).join('\n') || '(No relevant knowledge found)'}` }, ...history.reverse().map(m => ({ role: m.direction === 'inbound' ? 'user' : 'assistant', content: m.text || '' })), { role: 'user', content: input.text }], max_tokens: 500 });
  const reply = String(result.choices?.[0]?.message?.content || '').trim(); const tokens = Number(result.usage?.total_tokens || 0); const cost = tokens * (agent.model?.includes('gpt-4o') ? 0.000005 : 0.000001);
  if (reply.includes('[HANDOFF]') || (agent.escalationRules?.confidenceThreshold && knowledge.length === 0)) {
    await db.collection('conversations').updateOne({ _id: input.conversationId, tenantId: input.tenantId }, { $set: { handoff: 'human', escalatedAt: now, escalationReason: reply.includes('[HANDOFF]') ? 'customer_or_ai_request' : 'low_confidence', updatedAt: now } });
    await db.collection('aiHandoffs').insertOne({ tenantId: input.tenantId, conversationId: input.conversationId, reason: 'automatic_escalation', createdAt: now, status: 'open' }); return;
  }
  if (!reply) return;
  const latest: any = await db.collection('conversations').findOne({ _id: input.conversationId, tenantId: input.tenantId }); if (latest?.handoff === 'human' || latest?.status === 'closed') return;
  const { enqueueOutbound } = await import('./messaging/engine');
  await enqueueOutbound(db, { tenantId: input.tenantId, conversationId: input.conversationId, channel: input.channel as any, channelId: input.channelId, recipientId: conv.providerContactId || conv.contactId?.toString() || '', text: reply, idempotencyKey: `ai:${input.messageId.toString()}`, authorId: agent._id });
  await db.collection('messages').updateOne({ tenantId: input.tenantId, idempotencyKey: `ai:${input.messageId.toString()}` }, { $set: { ai: { agentId: agent._id, model: agent.model || 'gpt-4o-mini', inputTokens: result.usage?.prompt_tokens || 0, outputTokens: result.usage?.completion_tokens || 0, estimatedCost: cost, knowledgeChunkCount: knowledge.length } } });
  await db.collection('aiUsage').updateOne({ tenantId: input.tenantId, agentId: agent._id, period: monthStart }, { $inc: { messages: 1, tokens, estimatedCost: cost }, $set: { updatedAt: now }, $setOnInsert: { tenantId: input.tenantId, agentId: agent._id, period: monthStart } }, { upsert: true });
}
