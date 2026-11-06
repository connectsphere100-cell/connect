# Testing status

The repository currently defines `npm run test:whatsapp`, which runs the WhatsApp unit test file. `npm run build` runs Next.js compilation, linting/type validation, and static page generation.

Phase 12 requires unit, integration, API, database, tenant-isolation, authentication, webhook, provider-adapter and end-to-end tests. Those suites are not present as a complete set. No live MongoDB, provider, Vercel preview/production, browser E2E, load, or backup restore tests were run for the billing/campaign/reporting changes. Run `npm run build` and `npm run test:whatsapp` locally; add isolated test database credentials before integration tests.
