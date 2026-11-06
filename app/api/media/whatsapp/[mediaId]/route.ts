import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { requireSession } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { decryptSecret, downloadWhatsAppMedia } from '@/lib/messaging/whatsapp';
import { apiError } from '@/lib/http';
export const runtime='nodejs';
export async function GET(_req:NextRequest,{params}:{params:{mediaId:string}}){try{const s=await requireSession();const tenantId=new ObjectId(s.tenantId);const db=await getDb();const message=await db.collection('messages').findOne({tenantId,'attachments.fileId':params.mediaId,channel:'whatsapp'});if(!message)return NextResponse.json({error:'Media not found'},{status:404});const ch:any=await db.collection('channels').findOne({_id:message.channelId,tenantId,type:'whatsapp'});if(!ch?.credentials?.accessTokenEncrypted)return NextResponse.json({error:'WhatsApp channel is disconnected'},{status:410});const media=await downloadWhatsAppMedia(params.mediaId,{...ch.credentials,phoneNumberId:ch.phoneNumberId});return new NextResponse(new Uint8Array(media.bytes),{headers:{'Content-Type':media.mimeType,'Cache-Control':'private, max-age=300','Content-Length':String(media.bytes.length)}});}catch(e){return apiError(e);}}
