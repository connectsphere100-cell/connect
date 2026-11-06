import { NextResponse } from 'next/server';
export function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  const status = message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : 400;
  return NextResponse.json({ error: status === 400 ? message : status === 401 ? 'Authentication required' : 'Access denied' }, { status });
}
export function serialize<T extends { _id?: unknown }>(doc: T) { return { ...doc, _id: doc._id?.toString() }; }
