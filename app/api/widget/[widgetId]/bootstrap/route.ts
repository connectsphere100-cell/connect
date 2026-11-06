import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/mongodb';
import { defaultWidgetConfig, validOrigin, visitorToken } from '@/lib/website-widget';
type Ctx={params:{widgetId:string}};
export async function POST(req:NextRequest,{params}:Ctx){
  const origin=req.headers.get('origin');const db=await getDb();
  const widget=await db.collection('websiteWidgets').findOne({widgetId:params.widgetId});
  if(!widget)return NextResponse.json({error:'Widget not found'},{status:404});
  const config={...defaultWidgetConfig,...widget.config};
  if(config.allowedDomains?.length&&!validOrigin(origin,config.allowedDomains))return NextResponse.json({error:'Origin not allowed'},{status:403,headers:{'Vary':'Origin','Cache-Control':'no-store'}});
  const body=await req.json().catch(()=>({}));const visitorId=typeof body.visitorId==='string'&&/^[a-zA-Z0-9_-]{12,80}$/.test(body.visitorId)?body.visitorId:randomUUID();
  const token=await visitorToken(widget.widgetId,visitorId,widget.tenantId.toString());
  return NextResponse.json({token,visitorId,config},{headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':origin||'null','Access-Control-Allow-Credentials':'true','Vary':'Origin'}});
}
export async function OPTIONS(req:NextRequest){return new NextResponse(null,{status:204,headers:{'Access-Control-Allow-Origin':req.headers.get('origin')||'null','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Vary':'Origin'}});}
