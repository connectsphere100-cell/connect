import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { requireSession } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { apiError } from '@/lib/http';
import { validateDefinition, type WorkflowDefinition } from '@/lib/workflows';

export async function GET() { try { const s = await requireSession(), tenantId = new ObjectId(s.tenantId), db = await getDb(); const rows = await db.collection('workflows').find({ tenantId }).sort({ updatedAt: -1 }).toArray(); const runs = await db.collection('workflowExecutions').aggregate([{ $match: { tenantId } }, { $sort: { createdAt: -1 } }, { $group: { _id: '$workflowId', latest: { $first: '$$ROOT' } } }]).toArray(); const last = new Map(runs.map((r: any) => [r._id.toString(), r.latest])); return NextResponse.json({ workflows: rows.map((w: any) => ({ ...w, _id: w._id.toString(), tenantId: undefined, lastExecution: last.get(w._id.toString()) })) }); } catch (e) { return apiError(e); } }

export async function POST(req: NextRequest) { try { const s = await requireSession(), db = await getDb(), tenantId = new ObjectId(s.tenantId), body = await req.json(), error = validateDefinition(body); if (error) return NextResponse.json({ error }, { status: 400 }); const now = new Date(), status = body.status === 'published' ? 'published' : 'draft'; const definition = body as WorkflowDefinition; const result = await db.collection('workflows').insertOne({ tenantId, name: definition.name.trim(), description: definition.description || '', nodes: definition.nodes, entryNodeId: definition.entryNodeId, status, version: 1, createdBy: new ObjectId(s.userId), createdAt: now, updatedAt: now, publishedAt: status === 'published' ? now : null }); return NextResponse.json({ id: result.insertedId.toString(), status, version: 1 }, { status: 201 }); } catch (e) { return apiError(e); } }
