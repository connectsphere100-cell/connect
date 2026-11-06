import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';

export async function POST(req: NextRequest) {
  const secret = process.env.BILLING_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'Billing webhook is not configured' }, { status: 503 });
  const raw = await req.text(), signature = req.headers.get('x-billing-signature') || '', expected = createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(signature), b = Buffer.from(expected); if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  try { const event = JSON.parse(raw), provider = process.env.BILLING_PROVIDER || 'custom'; if (!event.id || !event.type) return NextResponse.json({ error: 'Invalid event' }, { status: 400 }); const db = await getDb();
    try { await db.collection('billingEvents').insertOne({ provider, eventId: String(event.id), type: event.type, receivedAt: new Date(), payload: event }); } catch (e) { if ((e as { code?: number }).code === 11000) return NextResponse.json({ ok: true, duplicate: true }); throw e; }
    if (!ObjectId.isValid(event.tenantId)) return NextResponse.json({ error: 'Invalid tenant reference' }, { status: 400 }); const tenantId = new ObjectId(event.tenantId), now = new Date();
    if (event.type === 'subscription.active' || event.type === 'subscription.renewed') { await db.collection('subscriptions').updateOne({ tenantId }, { $set: { tenantId, plan: String(event.plan), status: 'active', monthlyPrice: Number(event.monthlyPrice), provider, providerCustomerId: String(event.customerId || ''), providerSubscriptionId: String(event.subscriptionId || ''), periodStart: new Date(event.periodStart), periodEnd: new Date(event.periodEnd), updatedAt: now }, $setOnInsert: { createdAt: now } }, { upsert: true }); if (event.invoice) await db.collection('invoices').updateOne({ provider, providerInvoiceId: String(event.invoice.id) }, { $setOnInsert: { tenantId, provider, providerInvoiceId: String(event.invoice.id), number: String(event.invoice.number || ''), amount: Number(event.invoice.amount || 0), currency: String(event.invoice.currency || 'USD'), status: String(event.invoice.status || 'paid'), hostedUrl: event.invoice.url || null, createdAt: now } }, { upsert: true }); }
    if (event.type === 'subscription.canceled') await db.collection('subscriptions').updateOne({ tenantId }, { $set: { status: 'canceled', canceledAt: now, updatedAt: now } }); await db.collection('billingEvents').updateOne({ provider, eventId: String(event.id) }, { $set: { processedAt: now, status: 'processed' } }); return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: 'Invalid or unprocessable billing event' }, { status: 400 }); }
}
