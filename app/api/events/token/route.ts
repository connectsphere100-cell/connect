import {NextResponse} from 'next/server';import {requireSession} from '@/lib/auth';import {apiError} from '@/lib/http';
export async function GET(){try{await requireSession();return NextResponse.json({error:'Realtime token provider is not installed'},{status:503});}catch(error){return apiError(error);}}
