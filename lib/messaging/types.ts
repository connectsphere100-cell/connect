export const communicationChannels = ['whatsapp', 'instagram', 'messenger', 'website', 'email'] as const;
export type CommunicationChannel = typeof communicationChannels[number];
export type MessageDirection = 'inbound' | 'outbound' | 'note' | 'system';
export type Attachment = { url: string; fileId?: string; name: string; mimeType: string; size: number; kind: 'image' | 'video' | 'audio' | 'document' };
export type NormalizedMessage = { providerMessageId?: string; direction: MessageDirection; text?: string; attachments?: Attachment[]; replyToProviderMessageId?: string; occurredAt?: Date; status?: 'queued' | 'sent' | 'delivered' | 'read' | 'failed'; metadata?: Record<string, unknown> };
export type SendMessageInput = { recipientId: string; text?: string; attachments?: Attachment[]; replyToProviderMessageId?: string; idempotencyKey: string };
export type SendMessageResult = { providerMessageId: string; acceptedAt: Date; raw?: unknown };
export type WebhookEnvelope = { eventId: string; type: string; occurredAt: Date; messages: NormalizedMessage[]; channelId?: string; raw?: unknown };
export interface MessagingProviderAdapter {
  readonly channel: CommunicationChannel;
  readonly capabilities: { sendText: boolean; sendAttachments: boolean; supportedAttachmentKinds: Attachment['kind'][]; editMessage: boolean; deleteMessage: boolean; deliveryReceipts: boolean; replyReferences: boolean };
  send(input: SendMessageInput, channel: Record<string, unknown>): Promise<SendMessageResult>;
  parseWebhook?(payload: unknown, headers: Headers): Promise<WebhookEnvelope>;
  edit?(providerMessageId: string, text: string, channel: Record<string, unknown>): Promise<void>;
  delete?(providerMessageId: string, channel: Record<string, unknown>): Promise<void>;
}
