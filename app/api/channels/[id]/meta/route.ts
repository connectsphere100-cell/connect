import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '@/lib/mongodb';
import { requireBusinessAdmin } from '@/lib/auth';
import { apiError } from '@/lib/http';
import { encryptSecret } from '@/lib/messaging/whatsapp';
import { decryptSecret } from '@/lib/messaging/whatsapp';
const schema = z.object({ accountId: z.string().min(1), accountName: z.string().min(1), accessToken: z.string().min(20), appSecret: z.string().min(8) });
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const s = await requireBusinessAdmin(); if (!ObjectId.isValid(params.id)) return NextResponse.json({ error: 'Invalid channel id' }, { status: 400 });
    const body = schema.parse(await req.json()); const db = await getDb(); const tenantId = new ObjectId(s.tenantId); const _id = new ObjectId(params.id);
    const channel: any = await db.collection('channels').findOne({ _id, tenantId, type: { $in: ['messenger','instagram'] } }); if (!channel) return NextResponse.json({ error: 'Meta channel not found' }, { status: 404 });
    const token = body.accessToken;
    const response = await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v22.0'}/${encodeURIComponent(body.accountId)}?fields=id,name,username,instagram_business_account&access_token=${encodeURIComponent(token)}`);
    const data: any = await response.json(); if (!response.ok || String(data.id) !== body.accountId) return NextResponse.json({ error: data?.error?.message || 'Meta account validation failed' }, { status: 422 });
    if (channel.type === 'instagram' && !data.id) return NextResponse.json({ error: 'Select an eligible Instagram professional account linked to a Facebook Page' }, { status: 422 });
    await db.collection('channels').updateOne({ _id, tenantId }, { $set: { accountId: body.accountId, accountName: body.accountName, credentials: { accessTokenEncrypted: encryptSecret(token), appSecretEncrypted: encryptSecret(body.appSecret) }, connectionStatus: 'connected', status: 'connected', permissionsValidatedAt: new Date(), lastConnectionTestAt: new Date(), updatedAt: new Date() }, $unset: { lastConnectionError: '' } });
    return NextResponse.json({ ok: true, accountId: body.accountId, accountName: body.accountName, status: 'connected' });
  } catch (error) { return apiError(error); }
}
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try { const s = await requireBusinessAdmin(); if (!ObjectId.isValid(params.id)) return NextResponse.json({ error: 'Invalid channel id' }, { status: 400 }); const db = await getDb(); const r = await db.collection('channels').updateOne({ _id: new ObjectId(params.id), tenantId: new ObjectId(s.tenantId), type: { $in: ['messenger','instagram'] } }, { $unset: { credentials: '', accountId: '', accountName: '' }, $set: { connectionStatus: 'disconnected', status: 'disconnected', disconnectedAt: new Date(), updatedAt: new Date() } }); return NextResponse.json({ ok: r.modifiedCount === 1 }); } catch (error) { return apiError(error); }
}
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
 try { const s=await requireBusinessAdmin(); if(!ObjectId.isValid(params.id))return NextResponse.json({error:'Invalid channel id'},{status:400}); const db=await getDb(); const tenantId=new ObjectId(s.tenantId); const _id=new ObjectId(params.id); const ch:any=await db.collection('channels').findOne({_id,tenantId,type:{$in:['messenger','instagram']}}); if(!ch?.credentials?.accessTokenEncrypted)return NextResponse.json({error:'Connect an account first'},{status:409}); const token=decryptSecret(ch.credentials.accessTokenEncrypted); const target=ch.type==='messenger'?ch.pageId:ch.accountId; const res=await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION||'v22.0'}/${encodeURIComponent(target)}?fields=id,name,username&access_token=${encodeURIComponent(token)}`); const data:any=await res.json(); if(!res.ok){const message=data?.error?.message||'Meta connection check failed';await db.collection('channels').updateOne({_id,tenantId},{$set:{connectionStatus:'error',status:'error',lastConnectionError:message.slice(0,300),lastConnectionTestAt:new Date()}});return NextResponse.json({error:message,status:'error'},{status:502});} await db.collection('channels').updateOne({_id,tenantId},{$set:{connectionStatus:'connected',status:'connected',lastConnectionError:null,lastConnectionTestAt:new Date(),accountName:data.username||data.name||ch.accountName}});return NextResponse.json({ok:true,status:'connected',accountName:data.username||data.name||ch.accountName}); }catch(e){return apiError(e)}
}
