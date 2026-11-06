import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '@/lib/mongodb';
import { requireBusinessAdmin } from '@/lib/auth';
import { apiError } from '@/lib/http';
import { defaultWidgetConfig } from '@/lib/website-widget';

const schema = z.object({
  name: z.string().min(1).max(80), logoUrl: z.string().max(1000).optional().default(''),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/), position: z.enum(['right','left']),
  welcomeMessage: z.string().max(500), greeting: z.string().max(120),
  offlineMessage: z.string().max(500), allowedDomains: z.array(z.string().min(1).max(253)).max(50),
  openingHours: z.string().max(500), availability: z.enum(['online','offline','auto']),
  prechat: z.boolean(), fields: z.array(z.object({name:z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),label:z.string().min(1).max(80),required:z.boolean()})).max(10),
  privacyNotice: z.string().max(1000), consentRequired: z.boolean()
});
export async function GET() {
  try {
    const s=await requireBusinessAdmin();const db=await getDb();const tenantId=new ObjectId(s.tenantId);
    let widget=await db.collection('websiteWidgets').findOne({tenantId});
    let result=widget;
    if(!result){const id=new ObjectId().toString();const config=defaultWidgetConfig;await db.collection('websiteWidgets').insertOne({tenantId,widgetId:id,config,createdAt:new Date(),updatedAt:new Date()});result={_id:new ObjectId(),tenantId,widgetId:id,config};}
    return NextResponse.json({widget:{widgetId:result.widgetId,config:result.config},installUrl:process.env.NEXT_PUBLIC_APP_URL||''});
  }catch(e){return apiError(e);}
}
export async function PUT(req:NextRequest) {
  try {const s=await requireBusinessAdmin();const data=schema.parse(await req.json());const db=await getDb();const tenantId=new ObjectId(s.tenantId);
    let widget=await db.collection('websiteWidgets').findOne({tenantId});if(!widget){widget={_id:new ObjectId(),tenantId,widgetId:new ObjectId().toString()};}
    await db.collection('websiteWidgets').updateOne({tenantId},{$set:{tenantId,widgetId:widget.widgetId,config:data,updatedAt:new Date()}},{upsert:true});
    return NextResponse.json({widget:{widgetId:widget.widgetId,config:data}});
  }catch(e){return apiError(e);}
}
