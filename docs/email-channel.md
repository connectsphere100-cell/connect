# Email channel setup

Each connected mailbox is a separate `email` channel, so a workspace can authorize multiple Gmail and Outlook accounts.

## Shared settings

Set `NEXT_PUBLIC_APP_URL` to the public HTTPS origin, `CREDENTIAL_ENCRYPTION_KEY` to a dedicated 32-byte hex key, and `JOBS_SECRET` to a long random secret. OAuth access and refresh tokens are encrypted with AES-256-GCM at rest. Keep the encryption key and OAuth client secrets outside source control. The OAuth callback is `/api/channels/{channelId}/email/oauth/callback`.

For binary email attachment import, configure the existing ImageKit settings (`IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, and `IMAGEKIT_URL_ENDPOINT`). Without them, imported messages retain attachment names and MIME types, but binaries are not copied into app storage.

## Google Cloud / Gmail

1. Create a Google Cloud project, enable the Gmail API, and configure the OAuth consent screen for the intended users.
2. Create an OAuth client of type **Web application** and add the callback URL above as an authorized redirect URI.
3. Put its client ID and secret in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
4. Request `openid`, `email`, `profile`, `gmail.modify`, and `gmail.send`. The consent screen must be published/verified as required for the audience; Gmail restricted scopes may require Google verification and a security assessment.
5. Use **Add Gmail mailbox** in Channels and complete consent. Gmail history IDs are used as sync checkpoints; expired history triggers a fresh inbox scan. Configure periodic `POST /api/jobs/email-sync` calls with `Authorization: Bearer $JOBS_SECRET`. Gmail push via Pub/Sub is not activated by this implementation; scheduled history polling is the recovery path.

## Microsoft Entra / Outlook

1. Register an Entra ID application and add the callback URL above as a **Web** redirect URI.
2. Add delegated `User.Read`, `Mail.ReadWrite`, `Mail.Send`, `offline_access`, `openid`, `profile`, and `email` permissions. Grant tenant consent if policy requires it. Create a client secret and set `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, and `MICROSOFT_TENANT_ID` (`common` supports organizational and personal accounts where allowed).
3. Set `MICROSOFT_NOTIFICATION_URL` to the public HTTPS `/api/webhooks/email` endpoint. Graph validates this endpoint with a `validationToken`; notification `clientState` is checked against the subscribed mailbox before triggering a delta sync.
4. Add Outlook mailbox in Channels and consent. The sync job also acts as recovery and should run frequently enough to renew Graph subscriptions before expiry.

## Operations and API

- `POST /api/channels` with `{ "type":"email", "name":"Support", "provider":"gmail"|"outlook" }` creates a mailbox connection.
- `POST /api/channels/{id}/email/oauth` starts OAuth; `DELETE /api/channels/{id}/email` disconnects and removes stored credentials.
- `POST /api/channels/{id}/email/sync` performs an authorized manual sync.
- `POST /api/jobs/email-sync` refreshes connected mailboxes and persists Gmail history / Graph delta checkpoints.
- Email replies are queued through the existing message outbox. Message metadata retains provider thread/message IDs, address headers, subject, HTML, and attachment descriptors.

Provider notifications and sync are at-least-once; provider message IDs and unique idempotency keys prevent duplicate inbox messages. Monitor failed job results and reconnect mailboxes when provider consent is revoked. Attachment metadata is imported; binary attachment download/storage is not yet wired into the shared media store.
