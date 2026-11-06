# WhatsApp Cloud API setup

This integration uses Meta's official WhatsApp Business Platform Cloud API. It does not use WhatsApp Web, QR sessions, or session scraping.

## Server configuration

Set `CREDENTIAL_ENCRYPTION_KEY` to a dedicated random 32-byte key encoded as 64 hexadecimal characters. Keep it in the server secret manager, back it up securely, and do not rotate it until stored credentials have been re-encrypted. `META_GRAPH_VERSION` can optionally pin the Graph API version (default `v22.0`). The old global `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` variables are not used; each business configures its own credentials.

## Meta Developer Console

1. Create a Meta app, add the WhatsApp product, and associate the intended WhatsApp Business Account (WABA) and business phone number.
2. Create a system user and issue a long-lived token with `whatsapp_business_messaging` and `whatsapp_business_management`. Assign the WABA and phone number assets to that user.
3. In Channels, add WhatsApp and enter the phone number ID, WABA ID, token, Meta app secret, and a random webhook verification token. Secrets are encrypted at rest and never returned by channel APIs.
4. In the WhatsApp product's Webhooks configuration use `https://YOUR_HOST/api/webhooks/whatsapp`, enter the same verification token, and subscribe to `messages`. Subscribe the app to the WABA and relevant account/template fields in Meta's app dashboard.
5. Test connection in Channels. Only a successful real Graph API check marks the channel connected.

The webhook endpoint validates `X-Hub-Signature-256` against the raw request body and the per-channel Meta app secret. Configure HTTPS and make this endpoint publicly reachable. Webhook deliveries are deduplicated by event ID and saved to MongoDB before success is returned.

## Permissions and provider requirements

- A Meta developer/test setup can use test assets and test recipients; production use requires a business-owned eligible WABA and registered phone number.
- Access to serve businesses beyond app-owned/test assets generally requires Business Verification, Advanced Access for the relevant permissions, and Meta App Review. Meta may also require business portfolio verification and phone number display-name approval.
- Outbound free-form messages are generally allowed only within the 24-hour customer service window following the user's message. Outside it, use an approved template.
- Templates must be created and approved by Meta before use. This app can synchronize templates and send an approved template by name/language; template component parameters are supplied by the caller.
- Meta controls supported media, size limits, quality/rate limits, regional availability, and policy enforcement. Sending currently uses public HTTPS media links; the receiving endpoint retrieves inbound media through Meta using the stored token.

## Supported behavior and limitations

Text, image, video, audio, and document inbound messages are normalized into the unified inbox. Interactive/button replies are represented as text. Delivery, read, and failure status webhooks update matching outbound messages. Outbound text and one media attachment per message use the outbox adapter. Template send and sync are available through the WhatsApp channel API routes. Template/account update events are persisted for audit; no claim is made that every Meta account event is rendered in the UI.

The application must be reachable from Meta and a valid app secret/token/WABA/phone number is required for live behavior. No live connection has been claimed or tested as part of implementation.
