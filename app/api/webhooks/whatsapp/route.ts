import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { decryptSecret, parseWhatsAppWebhook, verifyWhatsAppSignature } from '@/lib/messaging/whatsapp';
import { ingestMessage } from '@/lib/messaging/engine';

export const runtime = 'nodejs';
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('hub.mode'); const token = req.nextUrl.searchParams.get('hub.verify_token'); const challenge = req.nextUrl.searchParams.get('hub.challenge');
  if (mode !== 'subscribe' || !token || !challenge) return new NextResponse('Forbidden', { status: 403 });
  try { const db = await getDb(); const channels = await db.collection('channels').find({ type: 'whatsapp', 'credentials.verifyTokenEncrypted': { $exists: true } }).toArray(); for (const ch of channels) if (decryptSecret((ch.credentials as any).verifyTokenEncrypted) === token) return new NextResponse(challenge, { status: 200 }); } catch {}
  return new NextResponse('Forbidden', { status: 403 });
}
export async function POST(req: NextRequest) {
  const raw = Buffer.from(await req.arrayBuffer()); let payload: any;
  try { payload = JSON.parse(raw.toString('utf8')); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const envelopes = parseWhatsAppWebhook(payload); if (!envelopes.length) return NextResponse.json({ received: true });
  const db = await getDb();
  for (const envelope of envelopes) {
    const channel: any = await db.collection('channels').findOne({ type: 'whatsapp', phoneNumberId: envelope.channelId }); if (!channel?.credentials?.appSecretEncrypted) return NextResponse.json({ error: 'Unknown or unverified WhatsApp channel' }, { status: 401 });
    if (!verifyWhatsAppSignature(raw, req.headers.get('x-hub-signature-256'), decryptSecret(channel.credentials.appSecretEncrypted))) return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }
  for (const envelope of envelopes) {
    const channel: any = await db.collection('channels').findOne({ type: 'whatsapp', phoneNumberId: envelope.channelId }); if (!channel) continue;
    const tenantId = channel.tenantId as ObjectId;
    let claimed = false;
    try { await db.collection('webhookEvents').insertOne({ tenantId, channel: 'whatsapp', channelId: channel._id, eventId: envelope.eventId, status: 'processing', receivedAt: new Date(), type: envelope.type, raw: envelope.raw }); claimed = true; }
    catch (e) { if ((e as any).code !== 11000) throw e; const prior = await db.collection('webhookEvents').findOneAndUpdate({ tenantId, channel: 'whatsapp', eventId: envelope.eventId, status: { $ne: 'processed' } }, { $set: { status: 'processing', receivedAt: new Date() } }, { returnDocument: 'after' }); claimed = !!prior; }
    if (!claimed) continue;
    let deferredStatus = false;
    for (const message of envelope.messages) {
      if (message.direction === 'system') {
        const status = message.status; const update = await db.collection('messages').updateOne({ tenantId, channelId: channel._id, providerMessageId: message.providerMessageId }, { $set: { status, statusUpdatedAt: envelope.occurredAt, providerStatus: message.metadata } });
        if (!update.matchedCount) { await db.collection('webhookEvents').updateOne({ tenantId, channel: 'whatsapp', eventId: envelope.eventId }, { $set: { status: 'received', pendingStatus: { providerMessageId: message.providerMessageId, status, metadata: message.metadata, occurredAt: envelope.occurredAt } } }); deferredStatus = true; continue; }
        continue;
      }
      const providerContactId = String(message.metadata?.providerContactId || 'unknown'); const contact = await db.collection('contacts').findOneAndUpdate({ tenantId, whatsappId: providerContactId }, { $setOnInsert: { tenantId, name: message.metadata?.profileName || providerContactId, whatsappId: providerContactId, phone: providerContactId, createdAt: new Date() }, $set: { updatedAt: new Date() } }, { upsert: true, returnDocument: 'after' });
      await ingestMessage(db, { tenantId, channel: 'whatsapp', channelId: channel._id, providerMessageId: message.providerMessageId, idempotencyKey: `whatsapp:${message.providerMessageId}`, contactId: contact?._id, contactName: contact?.name || providerContactId, message, eventId: envelope.eventId });
    }
    if (!deferredStatus) await db.collection('webhookEvents').updateOne({ tenantId, channel: 'whatsapp', eventId: envelope.eventId }, { $set: { status: 'processed', processedAt: new Date() }, $unset: { pendingStatus: '' } });
  }
  return NextResponse.json({ received: true });
}
