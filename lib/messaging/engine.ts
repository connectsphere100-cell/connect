import { ObjectId, type Db } from 'mongodb';
import { createHash } from 'node:crypto';
import type { Attachment, CommunicationChannel, NormalizedMessage, SendMessageInput } from './types';
import { getMessagingAdapter } from './adapters';
import { sendEmail } from './email';
import { dispatchWorkflowEvent } from '@/lib/workflows';

export function eventKey(provider: string, eventId: string) { return createHash('sha256').update(`${provider}:${eventId}`).digest('hex'); }
export function classifyProviderError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const status = Number((error as { status?: number })?.status);
  return { code: status === 429 ? 'rate_limited' : status >= 500 ? 'provider_unavailable' : 'provider_error', message: message.slice(0, 500), retryable: status === 429 || status >= 500 || !status };
}

export async function ingestMessage(db: Db, input: { tenantId: ObjectId; channel: CommunicationChannel; channelId?: ObjectId; providerMessageId?: string; idempotencyKey: string; contactId?: ObjectId; contactName: string; message: NormalizedMessage; eventId?: string }) {
  const now = new Date();
  if (input.eventId) {
    const existing = await db.collection('webhookEvents').findOne({ tenantId: input.tenantId, channel: input.channel, eventId: input.eventId });
    if (existing?.status === 'processed') return { duplicate: true, conversationId: existing.conversationId ?? null, messageId: null };
    if (!existing) await db.collection('webhookEvents').insertOne({ tenantId: input.tenantId, channel: input.channel, channelId: input.channelId, eventId: input.eventId, eventKey: eventKey(input.channel, input.eventId), receivedAt: now, processedAt: null, status: 'processing' });
  }
  const providerThreadId = input.message.metadata?.threadId;
  const conversation = await db.collection('conversations').findOneAndUpdate(
    { tenantId: input.tenantId, channel: input.channel, ...(input.channelId ? { channelId: input.channelId } : {}), ...(input.channel === 'email' && providerThreadId ? { providerThreadId } : {}), ...(input.contactId ? { contactId: input.contactId } : { providerContactId: input.message.metadata?.providerContactId }) },
    { $setOnInsert: { tenantId: input.tenantId, contactId: input.contactId, contactName: input.contactName, providerContactId: input.message.metadata?.providerContactId, providerThreadId: input.channel === 'email' ? providerThreadId : undefined, channel: input.channel, channelId: input.channelId, status: 'open', priority: 'normal', assignedTo: null, tags: [], createdAt: now }, $set: { updatedAt: now, lastMessageAt: input.message.occurredAt ?? now } },
    { upsert: true, returnDocument: 'after' }
  );
  if (!conversation) throw new Error('Could not create or load conversation');
  const messageDoc = { tenantId: input.tenantId, conversationId: conversation._id, channel: input.channel, channelId: input.channelId, providerMessageId: input.providerMessageId ?? input.message.providerMessageId, idempotencyKey: input.idempotencyKey, direction: input.message.direction, text: input.message.text ?? '', attachments: input.message.attachments ?? [], replyToProviderMessageId: input.message.replyToProviderMessageId, status: input.message.status ?? 'delivered', createdAt: input.message.occurredAt ?? now, metadata: input.message.metadata };
  try { await db.collection('messages').insertOne(messageDoc); }
  catch (error) { if ((error as { code?: number }).code !== 11000) throw error; const prior = await db.collection('messages').findOne({ tenantId: input.tenantId, idempotencyKey: input.idempotencyKey }); return { duplicate: true, conversationId: conversation._id, messageId: prior?._id ?? null }; }
  const saved = await db.collection('messages').findOne({ tenantId: input.tenantId, idempotencyKey: input.idempotencyKey });
  try { await dispatchWorkflowEvent(db, input.tenantId, 'incoming_message', { conversationId: conversation._id.toString(), message: { text: input.message.text || '' }, channel: input.channel }, `message:${input.idempotencyKey}`); } catch (error) { console.error('Workflow event dispatch failed', error); }
  if (input.eventId) await db.collection('webhookEvents').updateOne({ tenantId: input.tenantId, eventId: input.eventId, channel: input.channel }, { $set: { status: 'processed', processedAt: new Date(), conversationId: conversation._id } });
  if (input.message.direction === 'inbound' && saved?._id && input.message.text?.trim()) {
    const { answerIncoming } = await import('../ai-support');
    try { await answerIncoming(db, { tenantId: input.tenantId, conversationId: conversation._id, channel: input.channel, channelId: input.channelId, text: input.message.text, messageId: saved._id }); }
    catch (error) { console.error('AI support response failed', error); }
  }
  return { duplicate: false, conversationId: conversation._id, messageId: saved?._id ?? null };
}

export async function enqueueOutbound(db: Db, input: { tenantId: ObjectId; conversationId: ObjectId; channel: CommunicationChannel; channelId?: ObjectId; recipientId: string; text?: string; attachments?: Attachment[]; replyToProviderMessageId?: string; idempotencyKey: string; authorId?: ObjectId; email?: Record<string, unknown> }) {
  const now = new Date();
  try {
    const inserted = await db.collection('messages').insertOne({ tenantId: input.tenantId, conversationId: input.conversationId, channel: input.channel, channelId: input.channelId, direction: 'outbound', text: input.text ?? '', attachments: input.attachments ?? [], replyToProviderMessageId: input.replyToProviderMessageId, idempotencyKey: input.idempotencyKey, status: 'queued', createdAt: now, authorId: input.authorId });
    await db.collection('messageOutbox').insertOne({ tenantId: input.tenantId, messageId: inserted.insertedId, conversationId: input.conversationId, channel: input.channel, channelId: input.channelId, recipientId: input.recipientId, payload: { text: input.text, attachments: input.attachments, replyToProviderMessageId: input.replyToProviderMessageId, ...(input.email || {}) }, status: 'pending', attempts: 0, nextAttemptAt: now, createdAt: now, updatedAt: now });
    await db.collection('conversations').updateOne({ _id: input.conversationId, tenantId: input.tenantId }, { $set: { updatedAt: now, lastMessageAt: now } });
    return { message: { ...inserted, _id: inserted.insertedId, tenantId: input.tenantId, conversationId: input.conversationId, channel: input.channel, direction: 'outbound', text: input.text ?? '', attachments: input.attachments ?? [], status: 'queued', createdAt: now }, duplicate: false };
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    return { message: await db.collection('messages').findOne({ tenantId: input.tenantId, idempotencyKey: input.idempotencyKey }), duplicate: true };
  }
}

export async function processOutboxItem(db: Db, item: Record<string, any>) {
  const now = new Date();
  const lock = await db.collection('messageOutbox').findOneAndUpdate({ _id: item._id, tenantId: item.tenantId, status: { $in: ['pending', 'retry'] }, nextAttemptAt: { $lte: now } }, { $set: { status: 'processing', updatedAt: now }, $inc: { attempts: 1 } }, { returnDocument: 'after' });
  if (!lock) return { skipped: true };
  const channel = await db.collection('channels').findOne({ _id: lock.channelId, tenantId: lock.tenantId, type: lock.channel });
  const conversation = await db.collection('conversations').findOne({ _id: lock.conversationId, tenantId: lock.tenantId });
  if (!channel || !conversation || !conversation.providerContactId) {
    const failure = { code: 'configuration_missing', message: 'Channel or provider recipient is not configured', retryable: false };
    await db.collection('messageOutbox').updateOne({ _id: lock._id, tenantId: lock.tenantId }, { $set: { status: 'failed', lastError: failure, updatedAt: now } });
    await db.collection('messages').updateOne({ _id: lock.messageId, tenantId: lock.tenantId }, { $set: { status: 'failed', error: failure } });
    return { failed: true, error: failure };
  }
  if (lock.channel === 'whatsapp' && lock.payload?.attachments?.length) {
    const lastInbound = await db.collection('messages').find({ tenantId: lock.tenantId, conversationId: lock.conversationId, direction: 'inbound' }).sort({ createdAt: -1 }).limit(1).next();
    if (!lastInbound || Date.now() - new Date(lastInbound.createdAt).getTime() > 24 * 60 * 60 * 1000) {
      const failure = { code: 'whatsapp_window_closed', message: 'Outside WhatsApp customer service window: send an approved template instead', retryable: false };
      await db.collection('messageOutbox').updateOne({ _id: lock._id, tenantId: lock.tenantId }, { $set: { status: 'failed', lastError: failure, updatedAt: now } });
      await db.collection('messages').updateOne({ _id: lock.messageId, tenantId: lock.tenantId }, { $set: { status: 'failed', error: failure } });
      return { failed: true, error: failure };
    }
  }
  try {
    if (lock.channel === 'email') {
      const result = await sendEmail(db, channel, lock.recipientId, lock.payload || {});
      await db.collection('messages').updateOne({ _id: lock.messageId, tenantId: lock.tenantId }, { $set: { status: 'sent', providerMessageId: result.id, sentAt: new Date(), metadata: { emailSubject: lock.payload?.subject, providerThreadId: lock.payload?.threadId, providerMessageId: result.id } } });
      await db.collection('messageOutbox').updateOne({ _id: lock._id, tenantId: lock.tenantId }, { $set: { status: 'sent', providerMessageId: result.id, updatedAt: new Date() } });
      return { sent: true };
    }
    const adapter = getMessagingAdapter(lock.channel as CommunicationChannel);
    if (!adapter) throw new Error(`No ${lock.channel} messaging adapter is registered`);
    const result = await adapter.send({ ...(lock.payload as SendMessageInput), recipientId: lock.recipientId, idempotencyKey: String(lock.messageId) }, channel as Record<string, unknown>);
    await db.collection('messages').updateOne({ _id: lock.messageId, tenantId: lock.tenantId }, { $set: { status: 'sent', providerMessageId: result.providerMessageId, sentAt: result.acceptedAt, error: null } });
    await db.collection('messageOutbox').updateOne({ _id: lock._id, tenantId: lock.tenantId }, { $set: { status: 'sent', providerMessageId: result.providerMessageId, updatedAt: new Date() } });
    return { sent: true };
  } catch (error) {
    const classification = classifyProviderError(error); const attempts = Number(lock.attempts || 1); const terminal = !classification.retryable || attempts >= 8;
    await db.collection('messageOutbox').updateOne({ _id: lock._id, tenantId: lock.tenantId }, { $set: { status: terminal ? 'failed' : 'retry', lastError: classification, updatedAt: now, nextAttemptAt: new Date(Date.now() + Math.min(3600000, 1000 * 2 ** attempts)) } });
    await db.collection('messages').updateOne({ _id: lock.messageId, tenantId: lock.tenantId }, { $set: { status: terminal ? 'failed' : 'queued', error: classification } });
    return { failed: terminal, retry: !terminal, error: classification };
  }
}
