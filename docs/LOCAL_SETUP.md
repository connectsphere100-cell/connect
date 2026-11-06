# Local setup

1. Install Node.js 20.9+ and npm.
2. Copy `.env.example` to `.env.local` and set `MONGODB_URI`, `MONGODB_DB_NAME`, and a random `AUTH_SECRET` of at least 32 characters.
3. Run `npm install`, then `npm run dev` and open `http://localhost:3000`.
4. Register a workspace or use the local-only seed script described in README.

MongoDB must be reachable from the machine. External channel features require their provider app credentials and callback URLs. Scheduled outbox processing requires `INNGEST_SIGNING_KEY` and an external scheduler. Billing requires a provider adapter which is not included yet.
