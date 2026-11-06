# Vercel deployment checklist

- [ ] Create a MongoDB Atlas project and database user.
- [ ] Configure Atlas network access securely for the deployment environment.
- [ ] Create a Vercel project from this repository.
- [ ] Add MONGODB_URI, MONGODB_DB_NAME, AUTH_SECRET and NEXT_PUBLIC_APP_URL.
- [ ] Deploy a preview and test registration/login, tenant data isolation and `/api/health`.
- [ ] Add production domain and production-only environment variables.
- [ ] Configure monitoring, backups and restore drills.
- [ ] Do not enable real customer channel connections until provider adapters and webhook security have passed tests.
