# API documentation

All authenticated APIs use the `zs_session` HTTP-only cookie. Tenant APIs derive tenant identity from the verified session.

## Reporting
- `GET /api/dashboard` — tenant dashboard counts and recent conversations.
- `GET /api/analytics` — tenant reports; super-admin only with `?scope=platform`.

## Billing
- `GET /api/billing` — plan list, current subscription/usage and invoice history.
- `POST /api/billing` — `start_trial` or `cancel` for tenant admins; `activate`, `upgrade`, and `downgrade` report unavailable until provider integration. Super admins may submit `{action:"save_plan", plan:{...}}` with all eight limits.
- `POST /api/webhooks/billing` — HMAC SHA-256 hex signature in `x-billing-signature`; provider sends a normalized event with unique `id`, `type`, tenant and subscription fields. Configure a provider-specific adapter before connecting a real vendor.

## Campaigns
- `GET /api/campaigns` — tenant campaign records and recipient status aggregates.
- `POST /api/campaigns` — create campaign with channel ID, audience tags/contact IDs, message, and optional ISO schedule. Contacts need `consent:true` or channel-specific consent. WhatsApp requires a synced approved template.
- `POST /api/campaigns/opt-out` — signed tenant/contact/channel request; requires `CAMPAIGN_OPTOUT_SECRET`.
- `POST /api/jobs/campaigns` — scheduler only; requires `Authorization: Bearer <INNGEST_SIGNING_KEY>`.

## Existing APIs

Authentication is at `/api/auth/*`; contacts, conversations, messages, channels, tickets, leads, AI, workflows and webhooks are implemented under their corresponding `/api` routes. Validate request fields and provider requirements against route schemas. Provider-specific campaign payload mapping and payment-provider integration are not complete.
