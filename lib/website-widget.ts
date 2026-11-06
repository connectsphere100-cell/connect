import { jwtVerify, SignJWT } from 'jose';
import { ObjectId } from 'mongodb';

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error('AUTH_SECRET must be at least 32 characters');
  return new TextEncoder().encode(value);
}

export type WidgetConfig = {
  name: string; logoUrl: string; brandColor: string; position: 'right' | 'left';
  welcomeMessage: string; greeting: string; offlineMessage: string;
  allowedDomains: string[]; openingHours: string; availability: 'online' | 'offline' | 'auto';
  prechat: boolean; fields: { name: string; label: string; required: boolean }[];
  privacyNotice: string; consentRequired: boolean;
};

export const defaultWidgetConfig: WidgetConfig = {
  name: 'Support', logoUrl: '', brandColor: '#6d5dfc', position: 'right',
  welcomeMessage: 'Hi there! How can we help?', greeting: 'Chat with us',
  offlineMessage: 'We are away right now. Leave a message and we will get back to you.',
  allowedDomains: [], openingHours: '', availability: 'auto', prechat: false,
  fields: [], privacyNotice: '', consentRequired: false
};

export function validOrigin(origin: string | null, domains: string[]) {
  if (!origin) return false;
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return domains.some((entry) => {
      const domain = entry.toLowerCase().replace(/^https?:\/\//, '').split('/')[0].replace(/^\*\./, '');
      return hostname === domain || hostname.endsWith('.' + domain);
    });
  } catch { return false; }
}

export async function visitorToken(widgetId: string, visitorId: string, tenantId: string) {
  return new SignJWT({ scope: 'website-visitor', widgetId, visitorId, tenantId })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('15m').sign(secret());
}

export async function verifyVisitorToken(token: string) {
  const { payload } = await jwtVerify(token, secret());
  if (payload.scope !== 'website-visitor' || typeof payload.widgetId !== 'string' ||
      typeof payload.visitorId !== 'string' || typeof payload.tenantId !== 'string' ||
      !ObjectId.isValid(payload.tenantId)) throw new Error('INVALID_VISITOR_TOKEN');
  return payload as { widgetId: string; visitorId: string; tenantId: string };
}
