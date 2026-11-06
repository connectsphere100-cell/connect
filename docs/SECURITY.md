# Security status

Implemented controls include signed HTTP-only same-site session cookies, session expiry, membership checks in `requireSession`, super-admin role checks against the user record, tenant filters in the reviewed reporting/billing/campaign routes, Zod request schemas on new mutation endpoints, webhook HMAC verification with timing-safe comparison, event deduplication, and job bearer-token checks.

## Open findings / production blockers

- No systematic login/register/API rate limiter or password reset/email verification flow.
- CSRF/origin checks are not consistently enforced for cookie-authenticated state changes.
- Existing generic admin route and older API routes require a full authorization and tenant-isolation review; this phase did not audit every route.
- Webhook verification differs by provider; billing HMAC is a normalized generic contract, not a payment vendor's verified protocol.
- Provider credentials are not comprehensively encrypted with a managed secret vault/key rotation process.
- Upload size/type scanning, quotas, malware checks, and SSRF protections need full review.
- No completed XSS, NoSQL injection, SSRF, session revocation, sensitive logging, or dependency audit has been run for the whole application.
- Campaign opt-out tokens can be signed by an external sender but automatic signed-link generation is not yet wired into rendered messages.

Do not treat this document as a security certification. Run a route-by-route review and external security assessment before production use.
