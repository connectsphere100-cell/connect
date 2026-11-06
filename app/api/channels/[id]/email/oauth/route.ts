import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { createHmac, randomBytes } from 'node:crypto';
import { requireBusinessAdmin } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { apiError } from '@/lib/http';
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) { try {
  const s = await requireBusinessAdmin(); if (!ObjectId.isValid(params.id)) return NextResponse.json({ error: 'Invalid channel id' }, { status: 400 }); const db = await getDb(), tenantId = new ObjectId(s.tenantId), channelId = new ObjectId(params.id);
  const channel: any = await db.collection('channels').findOne({ _id: channelId, tenantId, type: 'email' }); if (!channel) return NextResponse.json({ error: 'Email channel not found' }, { status: 404 }); const provider = channel.provider;
  if (!['gmail','outlook'].includes(provider)) return NextResponse.json({ error: 'Set provider to gmail or outlook when creating the email channel' }, { status: 409 });
  const clientId = provider === 'gmail' ? process.env.GOOGLE_CLIENT_ID : process.env.MICROSOFT_CLIENT_ID; if (!clientId) return NextResponse.json({ error: 'Provider OAuth credentials are not configured' }, { status: 503 });
  const state = randomBytes(32).toString('hex'), secret = process.env.AUTH_SECRET!; const sig = createHmac('sha256', secret).update(`${state}:${s.tenantId}:${params.id}:${s.userId}`).digest('hex'); await db.collection('emailOAuthStates').insertOne({ state, sig, tenantId, channelId, userId: new ObjectId(s.userId), provider, expiresAt: new Date(Date.now() + 10 * 60_000) });
  const redirect = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/channels/${params.id}/email/oauth/callback`; const url = provider === 'gmail' ? new URL('https://accounts.google.com/o/oauth2/v2/auth') : new URL(`https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID || 'common'}/oauth2/v2.0/authorize`); url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: provider === 'gmail' ? 'openid email profile https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send' : 'openid profile email offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send', state, access_type: 'offline', prompt: 'consent' }).toString(); return NextResponse.json({ url: url.toString() });
} catch (e) { return apiError(e); } }
