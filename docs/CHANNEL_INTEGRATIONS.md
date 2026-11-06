# Channel integrations

| Channel | Current implementation | External requirements |
| --- | --- | --- |
| WhatsApp | Cloud API send/webhook, template sync and approved-template send path | Meta business/app setup, phone number, token, webhook verification, template approval, production review |
| Instagram | Meta OAuth and messaging/webhook foundation | Professional account, linked Page, Meta app review and scopes |
| Messenger | Meta OAuth and messaging/webhook foundation | Page, Meta app review and messaging permission |
| Email | Gmail/Outlook OAuth, sync and queued send | Google/Microsoft app registration, consent and verified callbacks |
| Website | Widget bootstrap, visitor message endpoint | Website installation and production origin configuration |

The campaign system is not a standalone provider sender. It requires eligible contacts, channel consent and an existing conversation/outbox path. Confirm current platform policy and applicable law before enabling bulk messaging. Credentials, approvals and callback/domain configuration are owned by the deployer.
