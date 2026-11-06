import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Attachment, MessagingProviderAdapter, SendMessageInput, WebhookEnvelope } from './types';

type WhatsAppChannel = Record<string, any> & { phoneNumberId: string; accessTokenEncrypted: string; appSecretEncrypted?: string };
const graphVersion = process.env.META_GRAPH_VERSION || 'v22.0';
const graph = `https://graph.facebook.com/${graphVersion}`;

export function encryptSecret(value: string) {
  const key = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!key || !/^[a-f\d]{64}$/i.test(key)) throw new Error('CREDENTIAL_ENCRYPTION_KEY must be a 32-byte hex key');
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ciphertext.toString('hex')}`;
}
export function decryptSecret(value: string) {
  const key = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!key || !/^[a-f\d]{64}$/i.test(key)) throw new Error('CREDENTIAL_ENCRYPTION_KEY must be a 32-byte hex key');
  const [version, iv, tag, body] = value.split(':'); if (version !== 'v1') throw new Error('Unsupported encrypted credential version');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), Buffer.from(iv, 'hex')); decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'hex')), decipher.final()]).toString('utf8');
}
export function verifyWhatsAppSignature(raw: Buffer, signature: string | null, secret: string) {
  if (!signature?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(raw).digest(); let actual: Buffer;
  try { actual = Buffer.from(signature.slice(7), 'hex'); } catch { return false; }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
async function graphRequest(path: string, token: string, init?: RequestInit) {
  const response = await fetch(`${graph}/${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) } });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data?.error?.message || `Meta Graph API returned ${response.status}`) as Error & { status?: number }; error.status = response.status; throw error; }
  return data;
}
export async function testWhatsAppConnection(channel: WhatsAppChannel) {
  const token = decryptSecret(channel.accessTokenEncrypted);
  const result = await graphRequest(`${encodeURIComponent(channel.phoneNumberId)}?fields=id,display_phone_number,verified_name,quality_rating`, token);
  if (String(result.id) !== String(channel.phoneNumberId)) throw new Error('Meta returned a different phone number ID');
  return { phoneNumber: result.display_phone_number, verifiedName: result.verified_name, qualityRating: result.quality_rating };
}
export async function syncWhatsAppTemplates(channel: WhatsAppChannel) {
  const result = await graphRequest(`${encodeURIComponent(channel.whatsappBusinessAccountId)}/message_templates?fields=id,name,status,category,language,components`, decryptSecret(channel.accessTokenEncrypted));
  return (result.data || []).map((t: any) => ({ providerTemplateId: t.id, name: t.name, status: t.status, category: t.category, language: t.language, components: t.components }));
}
export async function sendWhatsAppTemplate(recipientId: string, templateName: string, language: string, components: unknown[], channel: WhatsAppChannel) {
  const result = await graphRequest(`${encodeURIComponent(channel.phoneNumberId)}/messages`, decryptSecret(channel.accessTokenEncrypted), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: recipientId, type: 'template', template: { name: templateName, language: { code: language }, components } }) });
  const id = result?.messages?.[0]?.id; if (!id) throw new Error('Meta accepted no template message ID'); return { providerMessageId: id, acceptedAt: new Date() };
}
export async function downloadWhatsAppMedia(mediaId: string, channel: WhatsAppChannel) {
  const token = decryptSecret(channel.accessTokenEncrypted); const metadata = await graphRequest(encodeURIComponent(mediaId), token);
  if (!metadata.url) throw new Error('Meta did not return a media URL');
  const response = await fetch(metadata.url, { headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) throw new Error(`Meta media download failed (${response.status})`);
  return { bytes: Buffer.from(await response.arrayBuffer()), mimeType: response.headers.get('content-type') || metadata.mime_type || 'application/octet-stream', fileSize: Number(metadata.file_size || 0) };
}
export async function sendWhatsApp(input: SendMessageInput, channel: WhatsAppChannel) {
  const token = decryptSecret(channel.accessTokenEncrypted); const base: any = { messaging_product: 'whatsapp', recipient_type: 'individual', to: input.recipientId };
  let message: any;
  if (input.attachments?.length) {
    if (input.attachments.length !== 1) throw new Error('WhatsApp supports one media attachment per message');
    const a = input.attachments[0]; if (!['image','video','audio','document'].includes(a.kind)) throw new Error('Unsupported WhatsApp media type');
    if (!/^https:\/\//i.test(a.url)) throw new Error('WhatsApp media must be available at a public HTTPS URL');
    message = { type: a.kind, [a.kind]: { link: a.url, ...(a.kind === 'document' ? { filename: a.name } : {}), ...(input.text ? { caption: input.text } : {}) } };
  } else { if (!input.text?.trim()) throw new Error('A text message is required'); message = { type: 'text', text: { preview_url: false, body: input.text } }; }
  const result = await graphRequest(`${encodeURIComponent(channel.phoneNumberId)}/messages`, token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...base, ...message }) });
  const id = result?.messages?.[0]?.id; if (!id) throw new Error('Meta accepted no message ID');
  return { providerMessageId: id, acceptedAt: new Date(), raw: result };
}
function normalizeMessage(m: any, contact: any): any {
  const common = { providerMessageId: m.id, direction: 'inbound' as const, occurredAt: m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date(), status: 'delivered' as const, metadata: { providerContactId: m.from, profileName: contact?.profile?.name, type: m.type } };
  if (m.type === 'text') return { ...common, text: m.text?.body || '' };
  const media = m[m.type];
  if (['image','video','audio','document','sticker'].includes(m.type) && media) {
    const kind = m.type === 'sticker' ? 'image' : m.type as Attachment['kind'];
    return { ...common, text: media.caption || '', attachments: [{ url: `/api/media/whatsapp/${encodeURIComponent(media.id)}`, fileId: media.id, name: media.filename || `${m.type}.${(media.mime_type || '').split('/')[1] || 'bin'}`, mimeType: media.mime_type || 'application/octet-stream', size: 0, kind }] };
  }
  if (m.type === 'interactive') return { ...common, text: m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '' };
  if (m.type === 'button') return { ...common, text: m.button?.text || '' };
  return { ...common, text: `[Unsupported WhatsApp message: ${m.type || 'unknown'}]` };
}
export function parseWhatsAppWebhook(payload: any): WebhookEnvelope[] {
  const envelopes: WebhookEnvelope[] = [];
  for (const entry of payload?.entry || []) for (const change of entry.changes || []) {
    const value = change.value || {}; const channelId = value.metadata?.phone_number_id;
    for (const m of value.messages || []) {
      const contact = (value.contacts || []).find((c: any) => c.wa_id === m.from);
      envelopes.push({ eventId: `message:${m.id}`, type: `message.${m.type || 'unknown'}`, occurredAt: m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date(), channelId, messages: [normalizeMessage(m, contact)], raw: { entryId: entry.id } });
    }
    for (const s of value.statuses || []) envelopes.push({ eventId: `status:${s.id}:${s.status}:${s.timestamp}`, type: `status.${s.status}`, occurredAt: s.timestamp ? new Date(Number(s.timestamp) * 1000) : new Date(), channelId, messages: [{ providerMessageId: s.id, direction: 'system', status: s.status === 'failed' ? 'failed' : s.status, metadata: { recipientId: s.recipient_id, errors: s.errors } }], raw: { entryId: entry.id } });
    if (!value.messages?.length && !value.statuses?.length) envelopes.push({ eventId: `account:${entry.id}:${change.field}:${JSON.stringify(value).slice(0,128)}`, type: change.field || 'account.update', occurredAt: new Date(), channelId, messages: [], raw: value });
  }
  return envelopes;
}
export const whatsappAdapter: MessagingProviderAdapter = { channel: 'whatsapp', capabilities: { sendText: true, sendAttachments: true, supportedAttachmentKinds: ['image','video','audio','document'], editMessage: false, deleteMessage: false, deliveryReceipts: true, replyReferences: false }, async send(input, channel) { return sendWhatsApp(input, channel as WhatsAppChannel); } };
