# Website live chat

## Install

1. Open **Website chat** from the dashboard and configure your branding, greeting, privacy notice, availability and allowed domains.
2. Save, then copy the installation snippet.
3. Paste it before `</body>` on any website, including static HTML, ecommerce storefronts or custom applications. No Next.js code is required on the host site.
4. Send a test message. It appears in the unified Inbox under the **website** channel. Replies from the Inbox are delivered to the open widget on its next poll (within about four seconds).

The generated snippet looks like:

```html
<script src="https://YOUR_DOMAIN/widget.js" data-widget-id="PUBLIC_WIDGET_ID" async></script>
```

## Visitor experience and security

The visitor ID is stored in local storage for continuity. The widget exchanges it for a signed visitor token that expires after 15 minutes; it obtains a fresh token on the next page load. Tokens are scoped to one widget, visitor and tenant. Conversation reads and writes check all three identities. Configure allowed domains before production use. Domain matching includes subdomains; entries may be hostnames or URLs. An empty list permits any origin. The API limits each visitor and source IP to 12 messages per minute.

The API accepts text messages and visitor typing events, displays agent replies, and records optional pre-chat identity, custom fields and consent. The browser widget renders branding, greetings, opening-hours text, privacy notice, online/offline display, mobile layout, pre-chat fields, required consent and unread reply counts. The Inbox supports replying to website conversations; visitor replies refresh in the thread automatically.

## Demo

Visit `/widget-demo` on the deployment. Replace the demo widget ID with a configured widget ID when testing a real tenant. The endpoint `/widget.js` serves the standalone script.

## Current boundaries

Opening hours are displayed as configured text; automatic schedule evaluation and agent presence are not connected. File attachments and AI/agent handover controls are not yet implemented. Replies use short polling rather than a realtime transport. The built-in rate limiter uses MongoDB counters; for high-volume deployments, expire old counters with a TTL index or move the limiter to a shared cache.
