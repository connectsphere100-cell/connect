import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Attachment, CommunicationChannel, MessagingProviderAdapter, SendMessageInput, WebhookEnvelope } from './types';
import { decryptSecret } from './whatsapp';

const version = process.env.META_GRAPH_VERSION || 'v22.0';
const root = `https://graph.facebook.com/${version}`;
type MetaChannel = Record<string, any> & { accountId: string; credentials: { accessTokenEncrypted: string; appSecretEncrypted: string } };
async function request(path: string, token: string, init?: RequestInit) {
  const r = await fetch(`${root}/${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) } });
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data?.error?.message || `Meta Graph API returned ${r.status}`) as Error & { status?: number }; e.status = r.status; throw e; }
  return data;
}
export function verifyMetaSignature(raw: Buffer, signature: string | null, secret: string) {
  if (!signature?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(raw).digest();
  const actual = Buffer.from(signature.slice(7), 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function normalize(m: any, sender: any): any {
  const common = { providerMessageId: m.mid, direction: 'inbound' as const, occurredAt: m.timestamp ? new Date(Number(m.timestamp)) : new Date(), status: 'delivered' as const, metadata: { providerContactId: sender?.id, contactName: sender?.name || sender?.username, messageType: 'message' } };
  const attachments: Attachment[] = (m.attachments?.data || []).flatMap((a: any) => {
    const type = a.type; const kind = type === 'image' ? 'image' : type === 'video' ? 'video' : type === 'audio' ? 'audio' : type === 'file' ? 'document' : null;
    return kind && a.payload?.url ? [{ url: a.payload.url, name: a.name || `${type}`, mimeType: a.mime_type || 'application/octet-stream', size: 0, kind }] : [];
  });
  return { ...common, text: m.text || '', attachments, metadata: { ...common.metadata, ...(m.reply_to?.mid ? { replyTo: m.reply_to.mid } : {}) } };
}
export function parseMetaWebhook(channel: CommunicationChannel, payload: any): WebhookEnvelope[] {
  const result: WebhookEnvelope[] = [];
  for (const entry of payload?.entry || []) {
    for (const event of entry.messaging || []) {
      const id = event.message?.mid || event.delivery?.mids?.join(',') || event.read?.mid || `${entry.id}:${event.timestamp}`;
      if (event.message?.is_echo) continue;
      if (event.message) result.push({ eventId: `message:${id}`, type: 'message', occurredAt: new Date(Number(event.timestamp) || Date.now()), channelId: String(entry.id), messages: [normalize(event.message, event.sender)], raw: { recipient: event.recipient?.id } });
      else if (event.delivery?.mids?.length || event.read?.watermark) {
        const status = event.read ? 'read' : 'delivered';
        for (const mid of event.delivery?.mids || []) result.push({ eventId: `status:${mid}:${status}:${event.timestamp}`, type: `status.${status}`, occurredAt: new Date(Number(event.timestamp) || Date.now()), channelId: String(entry.id), messages: [{ providerMessageId: mid, direction: 'system', status, metadata: { recipientId: event.sender?.id } }] });
      }
    }
  }
  return result;
}
async function send(channelType: CommunicationChannel, input: SendMessageInput, channel: MetaChannel) {
  const token = decryptSecret(channel.credentials.accessTokenEncrypted); const attachment = input.attachments?.[0];
  if ((input.attachments?.length || 0) > 1) throw new Error(`${channelType} supports one attachment per message`);
  if (attachment && !['image','video','audio','document'].includes(attachment.kind)) throw new Error(`${channelType} does not support this attachment type`);
  const message: any = attachment ? { attachment: { type: attachment.kind === 'document' ? 'file' : attachment.kind, payload: { url: attachment.url, is_reusable: true } } } : { text: input.text };
  if (!attachment && !input.text?.trim()) throw new Error('A text message is required');
  if (input.replyToProviderMessageId) message.reply_to = { mid: input.replyToProviderMessageId };
  const endpointId=channelType==='messenger'?String(channel.pageId||channel.accountId):String(channel.accountId);
  const response = await request(`${encodeURIComponent(endpointId)}/messages`, token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipient: { id: input.recipientId }, message, messaging_type: 'RESPONSE' }) });
  if (!response.message_id) throw new Error('Meta accepted no message ID');
  return { providerMessageId: response.message_id, acceptedAt: new Date(), raw: response };
}
export function metaAdapter(channel: 'messenger'|'instagram'): MessagingProviderAdapter {
  return { channel, capabilities: { sendText: true, sendAttachments: true, supportedAttachmentKinds: ['image','video','audio','document'], editMessage: false, deleteMessage: false, deliveryReceipts: true, replyReferences: true }, async send(input, config) { return send(channel, input, config as MetaChannel); }, async parseWebhook(payload): Promise<WebhookEnvelope> { const envelopes = parseMetaWebhook(channel, payload); return envelopes[0] || { eventId: `empty:${Date.now()}`, type: 'empty', occurredAt: new Date(), messages: [] }; } };
}
