# Delivery roadmap

## Phase 1 — Foundation (included in this ZIP)
- Next.js app and Vercel deployment structure
- MongoDB Atlas client
- Tenant creation and owner membership
- Cookie session authentication
- Dashboard, inbox, contacts, channels and team placeholder
- Tenant-scoped API queries for implemented resources

## Phase 2 — Identity and security
- Email verification and password reset
- Rate limiting and CSRF/origin validation
- Roles, granular permissions and team invitations
- Audit log coverage and encrypted secrets vault
- Tenant isolation test suite

## Phase 3 — Live channel integrations
- Meta app setup, OAuth, webhook verification/signature checks
- WhatsApp Cloud API adapter
- Messenger and Instagram adapters
- Email adapters for Gmail API and Microsoft Graph
- Website chat widget, visitor identity and secure embed token
- Provider delivery receipts, retries, deduplication and attachments

## Phase 4 — Realtime and background jobs
- Ably/Pusher tenant-scoped events
- Inngest event processing, retry policies and scheduled work
- Durable outbox and webhook dead-letter handling

## Phase 5 — CRM and support
- Contact identity resolution, notes, tags and custom fields
- Assignment, teams, departments, ticket lifecycle and SLA

## Phase 6 — AI and automation
- Knowledge ingestion and retrieval
- AI agent configuration, handoff and usage controls
- Workflow builder and event-driven actions

## Phase 7 — SaaS operations
- Plans, subscriptions, billing provider integration
- Usage metering, analytics and super-admin operations

## Phase 8 — Production readiness
- Unit, integration and browser E2E tests
- Load and security testing
- Backup/restore verification
- Incident response, monitoring and deployment runbooks
