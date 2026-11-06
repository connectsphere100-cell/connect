import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '@/lib/mongodb';
import { requireBusinessAdmin } from '@/lib/auth';
import { apiError } from '@/lib/http';
import { encryptSecret, syncWhatsAppTemplates, testWhatsAppConnection } from '@/lib/messaging/whatsapp';

const configSchema = z.object({ phoneNumberId: z.string().min(1), whatsappBusinessAccountId: z.string().min(1), accessToken: z.string().min(20), appSecret: z.string().min(8).optional(), verifyToken: z.string().min(8).optional() });
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const s = await requireBusinessAdmin(); if (!ObjectId.isValid(params.id)) return NextResponse.json({ error: 'Invalid channel id' }, { status: 400 });
    const data = configSchema.parse(await req.json()); const db = await getDb(); const tenantId = new ObjectId(s.tenantId); const _id = new ObjectId(params.id);
    const channel = await db.collection('channels').findOne({ _id, tenantId, type: 'whatsapp' }); if (!channel) return NextResponse.json({ error: 'WhatsApp channel not found' }, { status: 404 });
    const credentials = { phoneNumberId: data.phoneNumberId, whatsappBusinessAccountId: data.whatsappBusinessAccountId, accessTokenEncrypted: encryptSecret(data.accessToken), ...(data.appSecret ? { appSecretEncrypted: encryptSecret(data.appSecret) } : channel.credentials?.appSecretEncrypted ? { appSecretEncrypted: channel.credentials.appSecretEncrypted } : {}), ...(data.verifyToken ? { verifyTokenEncrypted: encryptSecret(data.verifyToken) } : channel.credentials?.verifyTokenEncrypted ? { verifyTokenEncrypted: channel.credentials.verifyTokenEncrypted } : {}) };
    await db.collection('channels').updateOne({ _id, tenantId }, { $set: { credentials, phoneNumberId: data.phoneNumberId, whatsappBusinessAccountId: data.whatsappBusinessAccountId, connectionStatus: 'configured', status: 'configured', updatedAt: new Date() }, $unset: { lastConnectionError: '' } });
    return NextResponse.json({ ok: true, status: 'configured', message: 'Credentials saved securely. Use Test connection to verify with Meta.' });
  } catch (e) { return apiError(e); }
}
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const s = await requireBusinessAdmin(); if (!ObjectId.isValid(params.id)) return NextResponse.json({ error: 'Invalid channel id' }, { status: 400 });
    const db = await getDb(); const tenantId = new ObjectId(s.tenantId); const _id = new ObjectId(params.id); const ch: any = await db.collection('channels').findOne({ _id, tenantId, type: 'whatsapp' });
    if (!ch?.credentials?.accessTokenEncrypted) return NextResponse.json({ error: 'Configure WhatsApp credentials first' }, { status: 409 });
    try { const result = await testWhatsAppConnection({ ...ch.credentials, phoneNumberId: ch.phoneNumberId }); await db.collection('channels').updateOne({ _id, tenantId }, { $set: { connectionStatus: 'connected', status: 'connected', lastConnectionTestAt: new Date(), lastConnectionError: null } }); return NextResponse.json({ ok: true, status: 'connected', ...result }); }
    catch (error) { const message = error instanceof Error ? error.message : 'Meta connection failed'; await db.collection('channels').updateOne({ _id, tenantId }, { $set: { connectionStatus: 'error', status: 'error', lastConnectionTestAt: new Date(), lastConnectionError: message.slice(0, 300) } }); return NextResponse.json({ ok: false, status: 'error', error: message }, { status: 502 }); }
  } catch (e) { return apiError(e); }
}
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try { const s = await requireBusinessAdmin(); if (!ObjectId.isValid(params.id)) return NextResponse.json({ error: 'Invalid channel id' }, { status: 400 }); const db = await getDb(); const r = await db.collection('channels').updateOne({ _id: new ObjectId(params.id), tenantId: new ObjectId(s.tenantId), type: 'whatsapp' }, { $unset: { credentials: '', phoneNumberId: '', whatsappBusinessAccountId: '' }, $set: { connectionStatus: 'disconnected', status: 'disconnected', disconnectedAt: new Date(), updatedAt: new Date() } }); return NextResponse.json({ ok: r.modifiedCount === 1, status: 'disconnected' }); } catch (e) { return apiError(e); }
}
export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  try { const s = await requireBusinessAdmin(); if (!ObjectId.isValid(params.id)) return NextResponse.json({ error: 'Invalid channel id' }, { status: 400 }); const db = await getDb(); const tenantId = new ObjectId(s.tenantId); const _id = new ObjectId(params.id); const ch: any = await db.collection('channels').findOne({ _id, tenantId, type: 'whatsapp' }); if (!ch?.credentials?.accessTokenEncrypted) return NextResponse.json({ error: 'Configure WhatsApp credentials first' }, { status: 409 }); const templates = await syncWhatsAppTemplates({ ...ch.credentials, phoneNumberId: ch.phoneNumberId, whatsappBusinessAccountId: ch.whatsappBusinessAccountId }); await db.collection('whatsappTemplates').bulkWrite(templates.map((t: any) => ({ updateOne: { filter: { tenantId, channelId: _id, providerTemplateId: t.providerTemplateId }, update: { $set: { ...t, syncedAt: new Date() } }, upsert: true } }))); return NextResponse.json({ templates }); } catch (e) { return apiError(e); }
}
