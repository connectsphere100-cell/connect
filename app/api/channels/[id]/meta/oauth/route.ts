import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { requireBusinessAdmin } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { encryptSecret } from '@/lib/messaging/whatsapp';
import { apiError } from '@/lib/http';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try { const s = await requireBusinessAdmin(); if (!ObjectId.isValid(params.id)) return NextResponse.json({ error: 'Invalid channel id' }, { status: 400 }); if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) return NextResponse.json({ error: 'Set META_APP_ID and META_APP_SECRET first' }, { status: 503 });
    const db = await getDb(); const tenantId = new ObjectId(s.tenantId); const channel = await db.collection('channels').findOne({ _id: new ObjectId(params.id), tenantId, type: { $in: ['messenger','instagram'] } }); if (!channel) return NextResponse.json({ error: 'Meta channel not found' }, { status: 404 });
    const nonce = randomBytes(24).toString('hex'); const state = `${tenantId}.${params.id}.${channel.type}.${nonce}`; const sig = createHmac('sha256', process.env.AUTH_SECRET!).update(state).digest('hex');
    await db.collection('metaOAuthStates').insertOne({ state, sig, tenantId, channelId: channel._id, type: channel.type, userId: new ObjectId(s.userId), expiresAt: new Date(Date.now() + 10 * 60_000), createdAt: new Date() });
    const redirect = `${process.env.NEXT_PUBLIC_APP_URL || _req.nextUrl.origin}/api/channels/${params.id}/meta/oauth/callback`;
    const scope = channel.type === 'messenger' ? 'pages_show_list,pages_messaging,pages_manage_metadata,pages_read_engagement' : 'instagram_basic,instagram_manage_messages,pages_show_list,pages_manage_metadata,pages_read_engagement';
    const url = new URL(`https://www.facebook.com/${process.env.META_GRAPH_VERSION || 'v22.0'}/dialog/oauth`); url.searchParams.set('client_id', process.env.META_APP_ID); url.searchParams.set('redirect_uri', redirect); url.searchParams.set('state', state); url.searchParams.set('scope', scope); url.searchParams.set('response_type', 'code');
    return NextResponse.redirect(url);
  } catch (e) { return apiError(e); }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try { const s = await requireBusinessAdmin(); const body = await req.json(); const db = await getDb(); const row: any = await db.collection('metaOAuthStates').findOne({ state: body.state, channelId: new ObjectId(params.id), userId: new ObjectId(s.userId), tenantId: new ObjectId(s.tenantId), expiresAt: { $gt: new Date() } });
    if (!row || !process.env.AUTH_SECRET) return NextResponse.json({ error: 'OAuth state expired or invalid' }, { status: 400 }); const expected = createHmac('sha256', process.env.AUTH_SECRET).update(row.state).digest(); const actual = Buffer.from(row.sig, 'hex'); if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return NextResponse.json({ error: 'OAuth state signature invalid' }, { status: 400 });
    const channel: any = await db.collection('channels').findOne({ _id: row.channelId, tenantId: row.tenantId, type: row.type }); if (!channel) return NextResponse.json({ error: 'Channel no longer exists' }, { status: 404 });
    const redirect = `${process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin}/api/channels/${params.id}/meta/oauth/callback`;
    const exchange = await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v22.0'}/oauth/access_token?client_id=${encodeURIComponent(process.env.META_APP_ID!)}&client_secret=${encodeURIComponent(process.env.META_APP_SECRET!)}&redirect_uri=${encodeURIComponent(redirect)}&code=${encodeURIComponent(body.code)}`); const exchanged: any = await exchange.json(); if (!exchange.ok || !exchanged.access_token) return NextResponse.json({ error: exchanged?.error?.message || 'Meta token exchange failed' }, { status: 502 });
    const userToken = exchanged.access_token; const pagesResponse = await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v22.0'}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(userToken)}`); const pages: any = await pagesResponse.json(); if (!pagesResponse.ok) return NextResponse.json({ error: pages?.error?.message || 'Could not list eligible Facebook Pages' }, { status: 502 });
    const selected = (pages.data || []).flatMap((p: any) => row.type === 'instagram' ? p.instagram_business_account ? [{ id: p.instagram_business_account.id, name: p.instagram_business_account.username || p.name, token: p.access_token, pageId: p.id, pageName: p.name }] : [] : [{ id: p.id, name: p.name, token: p.access_token, pageId: p.id, pageName: p.name }]);
    await db.collection('metaOAuthStates').updateOne({ _id: row._id }, { $set: { accounts: selected } });
    const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const html = `<!doctype html><html><body><h2>Select an account to connect</h2><div id="accounts"></div><script>const accounts=${JSON.stringify(selected.map(({ token, ...x }: any) => x))};const state=${JSON.stringify(row.state)};const root=document.getElementById('accounts');accounts.forEach(a=>{const b=document.createElement('button');b.textContent=a.name+' ('+a.id+')';b.onclick=async()=>{const r=await fetch(${JSON.stringify(`${origin}/api/channels/${params.id}/meta/oauth/complete`)},{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({state,accountId:a.id})});const d=await r.json();if(!r.ok){alert(d.error||'Could not connect account');return}window.location.href=${JSON.stringify(`${origin}/channels?meta=connected`)};};root.appendChild(b)});</script></body></html>`;
    return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  } catch (e) { return apiError(e); }
}
