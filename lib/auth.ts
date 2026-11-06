import { cookies } from 'next/headers';
import { jwtVerify, SignJWT } from 'jose';
import { ObjectId } from 'mongodb';
import { getDb } from './mongodb';

function getSecret() { const value = process.env.AUTH_SECRET; if (!value || value.length < 32) throw new Error('AUTH_SECRET must be at least 32 characters'); return new TextEncoder().encode(value); }
export type Session = { userId: string; tenantId: string; email: string; name: string; role: string };

export async function createSession(session: Session) {
  const token = await new SignJWT(session).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(getSecret());
  cookies().set('zs_session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7 });
}
export async function getSession(): Promise<Session | null> {
  const token = cookies().get('zs_session')?.value;
  if (!token) return null;
  try { const { payload } = await jwtVerify(token, getSecret()); return payload as unknown as Session; } catch { return null; }
}
export async function requireSession() {
  const session = await getSession();
  if (!session || !ObjectId.isValid(session.userId)) throw new Error('UNAUTHORIZED');
  if (session.role === 'super_admin') return session;
  if (!ObjectId.isValid(session.tenantId)) throw new Error('UNAUTHORIZED');
  const db = await getDb();
  const membership = await db.collection('memberships').findOne({ userId: new ObjectId(session.userId), tenantId: new ObjectId(session.tenantId), status: 'active' });
  if (!membership) throw new Error('FORBIDDEN');
  return session;
}
export async function requireBusinessAdmin() {
  const session = await requireSession();
  if (!['owner','admin'].includes(session.role)) throw new Error('FORBIDDEN');
  return session;
}
export async function requireSuperAdmin() {
  const session = await getSession();
  if (!session || session.role !== 'super_admin' || !ObjectId.isValid(session.userId)) throw new Error('FORBIDDEN');
  const db = await getDb();
  const user = await db.collection('users').findOne({ _id: new ObjectId(session.userId), status: { $ne: 'disabled' } });
  if (!user || user.role !== 'super_admin') throw new Error('FORBIDDEN');
  return session;
}
