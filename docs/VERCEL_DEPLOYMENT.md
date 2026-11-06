# Vercel deployment

1. Import the Git repository as a Next.js project in Vercel.
2. Configure `MONGODB_URI`, `MONGODB_DB_NAME`, `AUTH_SECRET` (unique, random, 32+ characters), and `NEXT_PUBLIC_APP_URL` for Preview and Production.
3. Configure provider secrets only in Vercel Environment Variables. Add callback/webhook URLs to each provider dashboard and obtain required permissions/review.
4. Configure `INNGEST_SIGNING_KEY` and a recurring scheduler for `/api/jobs/messages`, `/api/jobs/campaigns`, and any mailbox sync routes. The repository does not provision a cron service.
5. Deploy Preview and verify authentication, tenant isolation, Mongo connectivity and provider test events before promoting.
6. Use Atlas least-privilege credentials and network controls; arrange backups and test restoration.

This app has not been deployed to Vercel from this workspace. There is no evidence here of production Atlas connectivity, domain validation, background job operation or external service approval. Paid subscription checkout is blocked until a payment provider adapter is added.
