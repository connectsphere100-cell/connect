# Production checklist

Current production status: **not ready / not verified**.

- [ ] Complete route-by-route auth, tenant isolation, CSRF, rate limit and input validation audit.
- [ ] Add password reset, account recovery, session revocation and rate limiting.
- [ ] Implement payment-provider adapter and test provider-specific signed webhooks, renewals and invoices.
- [ ] Finish campaign provider payloads, signed opt-out links, consent UX, delivery receipts and policy review.
- [ ] Configure and test recurring message/campaign/email jobs and realtime service.
- [ ] Run unit, integration, API, database, auth, tenant isolation, webhook, adapter and browser E2E suites.
- [ ] Test Atlas production networking, indexes, backup restore and least-privilege roles.
- [ ] Configure and verify Vercel Preview and Production environment variables, domain and callbacks.
- [ ] Verify WhatsApp/Meta, Google, Microsoft, OpenAI and ImageKit credentials, permissions and approvals as applicable.
- [ ] Add monitoring, error alerting, retention policies and incident response runbooks.

See `SECURITY.md`, `TESTING.md`, `VERCEL_DEPLOYMENT.md` and `CHANNEL_INTEGRATIONS.md` for detail.
