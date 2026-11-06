# ZenStack360 Connect

A multi-tenant omnichannel customer communications workspace built with Next.js, TypeScript and MongoDB Atlas. Designed for local development and Vercel deployment.

## Requirements
- Node.js 20.9+
- npm
- MongoDB Atlas cluster (or local MongoDB for development)

## Run locally

```bash
cp .env.example .env.local
```

Set `MONGODB_URI`, `MONGODB_DB_NAME`, and `AUTH_SECRET` in `.env.local`. Generate a secret with:

```bash
openssl rand -base64 48
```

Then:

```bash
npm install
npm run dev
```

Open http://localhost:3000 and create a workspace. The first registrant creates a tenant and becomes its owner.

### Seed local admin accounts

To create a workspace admin and a platform superadmin in your **local development database**, add these values to `.env.local`. Use passwords of at least 10 characters and change the example values before running:

```dotenv
SEED_ADMIN_EMAIL=admin@localhost.test
SEED_ADMIN_PASSWORD=change-this-admin-password
SEED_ADMIN_NAME=Local Admin
SEED_ADMIN_WORKSPACE=Local Admin Workspace
SEED_SUPER_ADMIN_EMAIL=superadmin@localhost.test
SEED_SUPER_ADMIN_PASSWORD=change-this-superadmin-password
SEED_SUPER_ADMIN_NAME=Local Superadmin
```

Then run:

```bash
npm run seed:local
npm run dev
```

Sign in at `http://localhost:3000/login` with either email and its configured password. The admin account has an active `admin` membership in the seeded workspace. The superadmin has the platform `super_admin` role. Running the command again updates those accounts' names and password hashes and ensures the workspace membership exists. It refuses to run with `NODE_ENV=production`; make sure `MONGODB_URI` points to a local development database before seeding.

## Deploy to Vercel
1. Push this folder to a new GitHub repository.
2. Import the repository into Vercel as a Next.js project.
3. Add `MONGODB_URI`, `MONGODB_DB_NAME`, `AUTH_SECRET`, and `NEXT_PUBLIC_APP_URL` to Vercel Environment Variables.
4. Use a MongoDB Atlas database user with only the required database privileges. Configure Atlas Network Access for the Vercel deployment using a secure networking approach appropriate to your plan; do not expose broad database access unnecessarily.
5. Deploy. Test `/api/health` and create a separate test workspace.
6. Configure provider credentials only after each channel adapter and webhook validation has been implemented and tested.

## API overview
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/health`
- `GET /api/dashboard`
- `GET|POST /api/contacts`
- `GET|POST /api/conversations`
- `GET|POST /api/conversations/:id/messages`
- `GET|POST /api/channels`

## Website live chat

Workspace admins can configure an embeddable website widget at `/widget`. It can be installed on any site with the generated `/widget.js` script. Visitor conversations appear in the existing unified inbox. See [the installation guide](docs/website-live-chat.md) and the standalone `/widget-demo` page.

## AI customer support

Business admins can create AI agents under **AI agents**, add tenant knowledge under **Knowledge base**, and take over a conversation from the inbox. Configure `OPENAI_API_KEY` before indexing or answering. Knowledge is chunked and embedded with `text-embedding-3-small`; PDF, DOCX and TXT uploads, website URLs, FAQs, and manual text entries are supported. Original uploads are not currently retained in ImageKit.

Create a MongoDB Atlas Vector Search index named `ai_knowledge_vector` on `aiKnowledgeChunks` with this definition:

```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 1536, "similarity": "cosine" },
    { "type": "filter", "path": "tenantId" },
    { "type": "filter", "path": "agentIds" }
  ]
}
```

The runtime has a tenant and agent scoped lexical fallback if that index is not available. For safe production retrieval, configure the Atlas index. Monthly token/cost usage is recorded per tenant and agent; cost estimates are approximate. Handoffs are recorded in `aiHandoffs` and conversation takeover state is stored on the conversation.

## Current MVP boundary
The project is a runnable functional foundation, not a completed production omnichannel platform. Inbox records and messages persist in MongoDB. WhatsApp Cloud API and Meta Messenger/Instagram OAuth and messaging paths are implemented. Gmail and Outlook mailbox connections, inbox synchronization, email threading, attachments, queued sending, and Outlook notifications are implemented; provider app review, consent, deployment callbacks and recurring sync jobs still need configuration. Gmail synchronization uses history polling; Gmail Pub/Sub push is not configured by this app.

### Billing, campaigns and analytics status

Phase 11 foundations are present: configurable MongoDB plan records, trial/subscription state, usage snapshots, tenant-scoped billing reads, an HMAC-verified idempotent normalized billing webhook, campaign audience consent checks, WhatsApp approved-template checks, opt-out recording, a protected campaign queue worker, and tenant/platform aggregation reports. Paid payment processing is **not complete**: no payment provider adapter or checkout/renewal integration is included. Campaign recipients are queued through existing conversation/outbox paths; channel-specific template variable rendering, consent acquisition UX, delivery receipt reconciliation, and signed opt-out link generation still need implementation. Do not enable bulk campaigns for production until those items and provider policies are verified.

Business analytics are available at `/areas/analytics` and `/api/analytics`; records lacking source data are returned as zero/null rather than invented values. The reporting API includes conversation, resolution, assignment, response-time, channel, ticket, AI, campaign, and platform counts. Some requested dimensions (such as satisfaction and AI resolution) depend on corresponding events being written by the product flows.

Phase 12 is **not complete**. See [production checklist](docs/PRODUCTION_CHECKLIST.md) and [security notes](docs/SECURITY.md) for outstanding audit items. The production build was run locally; provider-connected, Atlas, Vercel preview/production, full unit/integration/API/database/tenant-isolation/auth/webhook/provider/E2E tests, load testing, and backup restoration were not run in this environment.

The `.env.example` file lists the baseline deployment settings. Billing additionally needs `BILLING_PROVIDER` and `BILLING_WEBHOOK_SECRET`; campaign opt-out signing uses `CAMPAIGN_OPTOUT_SECRET`. Secrets must be set in Vercel project environment variables and never committed. The `/api/jobs/campaigns` and `/api/jobs/messages` routes need a recurring scheduler with `INNGEST_SIGNING_KEY`; no scheduler is provisioned by this repository.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/LOCAL_SETUP.md](docs/LOCAL_SETUP.md), [docs/VERCEL_DEPLOYMENT.md](docs/VERCEL_DEPLOYMENT.md), [docs/CHANNEL_INTEGRATIONS.md](docs/CHANNEL_INTEGRATIONS.md), [docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md), [docs/SECURITY.md](docs/SECURITY.md), [docs/BACKUP_RECOVERY.md](docs/BACKUP_RECOVERY.md), [docs/TESTING.md](docs/TESTING.md), [docs/PRODUCTION_CHECKLIST.md](docs/PRODUCTION_CHECKLIST.md), and [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md).
