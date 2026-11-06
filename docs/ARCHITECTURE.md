# Architecture

ZenStack360 Connect is a Next.js modular monolith. App Router pages and server routes deploy as Vercel functions; MongoDB is the primary persistent store. The application uses tenant-scoped Mongo documents and checks active membership in authenticated routes.

## Implemented areas

- Email/password authentication with signed, HTTP-only JWT cookies and Mongo membership validation.
- WhatsApp Cloud API and Meta messaging/OAuth paths, Gmail and Microsoft Graph mailbox sync, website chat, persistent message timeline and outbound message outbox.
- AI knowledge and support foundations, workflow execution foundations, CRM, tickets and contacts.
- Subscription plan records, tenant subscription/trial state, usage snapshot, signed billing event endpoint, invoice history storage, campaign consent gating and recipient queue records.
- Tenant and platform analytics backed by Mongo counts and aggregation pipelines.

## Billing and campaigns

Plans are stored in `plans`; a tenant's current record is in `subscriptions`. `/api/webhooks/billing` verifies an HMAC signature and deduplicates provider event IDs. It consumes the documented normalized event shape in its route implementation. No payment vendor SDK is currently connected, so paid checkout, renewal initiation, refunds, and provider-specific signature schemes need a provider adapter.

Campaigns use `campaigns`, `campaignRecipients`, and `consentRecords`. The enqueue job is protected by `INNGEST_SIGNING_KEY` and runs on a scheduler. Campaigns require recorded per-channel consent. WhatsApp campaigns additionally require a synced approved template. Provider-specific campaign payload rendering, delivery receipts/reporting and opt-out link generation need completion before bulk sending is enabled in production.

## Deployment and runtime boundaries

MongoDB connections are cached in the warm runtime; configure Atlas network access and a least-privilege database account. `INNGEST_SIGNING_KEY` protects the existing message and campaign job routes, but Vercel Cron or an external scheduler must invoke them. Realtime is not a completed deployed service. Provider credentials and app approvals are external prerequisites.

## Known production hardening gaps

Password reset/email verification, systematic request rate limiting, CSRF/origin enforcement, robust secret encryption/key rotation, upload scanning and quotas, complete audit coverage, end-to-end tenant isolation tests, provider-specific billing verification, delivery receipt accounting, backup restore exercises, observability and deployment smoke tests remain required. A successful local build does not establish production readiness.
