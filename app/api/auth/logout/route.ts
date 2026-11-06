import {NextResponse} from 'next/server';import {cookies} from 'next/headers';export async function POST(){cookies().delete('zs_session');return NextResponse.json({ok:true});}
