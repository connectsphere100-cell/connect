import type { CommunicationChannel, MessagingProviderAdapter } from './types';
import { whatsappAdapter } from './whatsapp';
import { metaAdapter } from './meta';

const textOnly = { sendText: true, sendAttachments: false, supportedAttachmentKinds: [] as ('image'|'video'|'audio'|'document')[], editMessage: false, deleteMessage: false, deliveryReceipts: false, replyReferences: false };
const adapters = new Map<CommunicationChannel, MessagingProviderAdapter>();
export function registerMessagingAdapter(adapter: MessagingProviderAdapter) { adapters.set(adapter.channel, adapter); }
export function getMessagingAdapter(channel: CommunicationChannel) { return adapters.get(channel); }
export function providerCapabilities(channel: CommunicationChannel) { return adapters.get(channel)?.capabilities ?? textOnly; }

// Explicit stubs keep unsupported provider delivery from being mistaken for a successful send.
for (const channel of ['whatsapp', 'instagram', 'messenger', 'website', 'email'] as const) {
  registerMessagingAdapter({ channel, capabilities: textOnly, async send() { throw new Error(`No ${channel} messaging adapter is configured`); } });
}
registerMessagingAdapter(whatsappAdapter);
registerMessagingAdapter(metaAdapter('messenger'));
registerMessagingAdapter(metaAdapter('instagram'));
