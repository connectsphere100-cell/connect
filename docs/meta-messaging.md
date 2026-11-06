# Meta Messenger and Instagram Messaging

This integration uses Meta Login OAuth and the official Graph API. Each channel belongs to one MongoDB tenant. OAuth state is tied to its tenant, user, and channel, account access tokens are encrypted with `CREDENTIAL_ENCRYPTION_KEY`, and webhook events are routed by the subscribed Page or Instagram professional account ID after `X-Hub-Signature-256` validation.

## Application configuration

1. Create a Meta app in Meta for Developers. Add Facebook Login, Messenger, and Instagram Graph API/Messaging products as needed. Configure the app domains and valid OAuth redirect URI as `https://YOUR_PUBLIC_HOST/api/channels/CHANNEL_ID/meta/oauth/callback` (and the same path on localhost during development).
2. Configure a public HTTPS application URL. For local development, expose localhost through a trusted HTTPS tunnel and set `NEXT_PUBLIC_APP_URL` to that origin.
3. Set `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_GRAPH_VERSION`, `NEXT_PUBLIC_APP_URL`, and a randomly generated 32-byte hex `CREDENTIAL_ENCRYPTION_KEY`. Keep secrets only in server environment configuration.
4. In the app, add a Messenger or Instagram channel and choose **Connect with Meta**. Sign in as an administrator who has access to the desired Page. Select the Page for Messenger or a linked Instagram professional account for Instagram.

## Permissions and eligibility

Messenger requests `pages_show_list`, `pages_messaging`, `pages_manage_metadata`, and `pages_read_engagement`. The user must have a Page task that allows messaging and app subscription. Instagram requests `instagram_basic`, `instagram_manage_messages`, `pages_show_list`, `pages_manage_metadata`, and `pages_read_engagement`. Instagram must be a professional Business or Creator account linked to a Facebook Page. The connected person must have the necessary Page and Instagram asset access.

For development, Meta app roles and test assets may be enough. For businesses outside app roles, submit the required permissions for Advanced Access/App Review and complete business verification when Meta requires it. OAuth granted scopes are not a substitute for app review or asset eligibility.

## Webhooks

Configure callback URL `https://YOUR_PUBLIC_HOST/api/webhooks/messenger` and/or `https://YOUR_PUBLIC_HOST/api/webhooks/instagram`, using the same `META_VERIFY_TOKEN` configured on the server. Subscribe the app to the Page/Instagram account and enable the `messages`, `messaging_postbacks`, `message_deliveries`, and `message_reads` events offered for the selected product. The integration validates webhook HMAC signatures using the Meta app secret and only accepts account IDs connected to a workspace.

## Testing

1. Use a Meta app role account, a test Facebook Page, and an eligible linked Instagram professional account.
2. Connect each from a separate workspace to verify account lists and credentials remain tenant scoped.
3. Confirm the channel shows connected, run **Test connection**, and subscribe the asset to the app’s webhook.
4. Send a text and supported image/video/audio/file attachment to the Page or Instagram account. Confirm the incoming message appears in the unified inbox with the correct channel identity; reply and verify delivery in the originating channel.
5. Check Meta’s webhook delivery logs and app dashboard for permission, subscription, and rate-limit errors. Invalid signatures and unlinked account IDs are rejected. Delivery/read status events are recorded when Meta supplies them; some event types or account configurations may not provide receipts.

Meta messaging is subject to its current messaging windows, recipient eligibility, rate limits, and platform policies. Unsupported content produces a channel-specific provider error; the application does not substitute simulated responses for Graph API results.
