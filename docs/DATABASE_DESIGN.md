# Database design

MongoDB stores tenant and provider records. Tenant-owned collections should include a `tenantId` ObjectId and every access path must filter by it.

Core collections include `users`, `tenants`, `memberships`, `contacts`, `identities`, `channels`, `conversations`, `messages`, `tickets`, `workflows`, and AI collections. `messageOutbox` persists outbound retries.

Billing uses `plans`, `subscriptions` (unique tenant), `billingEvents` (unique provider/event ID), and `invoices`. Campaigns use `campaigns`, `campaignRecipients` (unique tenant/campaign/contact), and `consentRecords`. Usage is aggregated from message, AI, member, channel, workflow, knowledge, upload, and campaign records.

`ensureIndexes` in `lib/mongodb.ts` declares query and uniqueness indexes. Deployments must execute this initializer as part of application setup; verify index creation against existing production data before rollout. Collection validation and a complete data-retention policy are not yet defined.
