import { MongoClient, Db } from 'mongodb';

const uri = process.env.MONGODB_URI;

type MongoGlobal = typeof globalThis & { _mongoClientPromise?: Promise<MongoClient> };
const globalForMongo = globalThis as MongoGlobal;
const options = { maxPoolSize: 10, minPoolSize: 0, maxIdleTimeMS: 10000, serverSelectionTimeoutMS: 10000 };
function getClientPromise() {
  if (!uri) throw new Error('Missing MONGODB_URI environment variable');
  return globalForMongo._mongoClientPromise ?? new MongoClient(uri, options).connect();
}


export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  if (process.env.NODE_ENV !== 'production') globalForMongo._mongoClientPromise = Promise.resolve(client);
  return client.db(process.env.MONGODB_DB_NAME || 'zenstack360_connect');
}

export async function ensureIndexes() {
  const db = await getDb();
  await Promise.all([
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    db.collection('tenants').createIndex({ slug: 1 }, { unique: true }),
    db.collection('memberships').createIndex({ tenantId: 1, userId: 1 }, { unique: true }),
    db.collection('contacts').createIndex({ tenantId: 1, email: 1 }),
    db.collection('conversations').createIndex({ tenantId: 1, updatedAt: -1 }),
    db.collection('messages').createIndex({ tenantId: 1, conversationId: 1, createdAt: 1 }),
    db.collection('channels').createIndex({ tenantId: 1, type: 1 }),
    db.collection('webhookEvents').createIndex({ tenantId: 1, channel: 1, eventId: 1 }, { unique: true, sparse: true }),
    db.collection('messages').createIndex({ tenantId: 1, idempotencyKey: 1 }, { unique: true, sparse: true }),
    db.collection('messages').createIndex({ tenantId: 1, channel: 1, providerMessageId: 1 }, { unique: true, sparse: true }),
    db.collection('contacts').createIndex({ tenantId: 1, whatsappId: 1 }, { unique: true, sparse: true }),
    db.collection('messageOutbox').createIndex({ status: 1, nextAttemptAt: 1 }),
    db.collection('messageOutbox').createIndex({ tenantId: 1, messageId: 1 }, { unique: true }),
    db.collection('conversations').createIndex({ tenantId: 1, status: 1, priority: 1, updatedAt: -1 }),
    db.collection('conversations').createIndex({ tenantId: 1, tags: 1 }),
    db.collection('conversations').createIndex({ tenantId: 1, channel: 1, providerContactId: 1 }),
    db.collection('conversations').createIndex({ tenantId: 1, channelId: 1, providerThreadId: 1 })
    ,db.collection('identities').createIndex({ tenantId: 1, contactId: 1 })
    ,db.collection('identities').createIndex({ tenantId: 1, channel: 1, value: 1 }, { unique: true })
    ,db.collection('identityAudit').createIndex({ tenantId: 1, createdAt: -1 })
    ,db.collection('leads').createIndex({ tenantId: 1, stage: 1, updatedAt: -1 })
    ,db.collection('tickets').createIndex({ tenantId: 1, number: 1 }, { unique: true })
    ,db.collection('tickets').createIndex({ tenantId: 1, status: 1, priority: 1, updatedAt: -1 })
    ,db.collection('ticketCounters').createIndex({ tenantId: 1 }, { unique: true })
    ,db.collection('aiAgents').createIndex({ tenantId: 1, enabled: 1 })
    ,db.collection('aiKnowledge').createIndex({ tenantId: 1, status: 1 })
    ,db.collection('aiKnowledgeChunks').createIndex({ tenantId: 1, documentId: 1 })
    ,db.collection('aiUsage').createIndex({ tenantId: 1, agentId: 1, period: 1 }, { unique: true })
    ,db.collection('aiHandoffs').createIndex({ tenantId: 1, conversationId: 1, status: 1 })
    ,db.collection('workflows').createIndex({ tenantId: 1, updatedAt: -1 })
    ,db.collection('workflowExecutions').createIndex({ tenantId: 1, workflowId: 1, createdAt: -1 })
    ,db.collection('workflowExecutions').createIndex({ tenantId: 1, idempotencyKey: 1 }, { unique: true })
    ,db.collection('workflowOutbox').createIndex({ tenantId: 1, workflowExecutionId: 1, nodeId: 1 }, { unique: true })
    ,db.collection('workflowNotifications').createIndex({ tenantId: 1, createdAt: -1 })
    ,db.collection('subscriptions').createIndex({ tenantId: 1 }, { unique: true })
    ,db.collection('billingEvents').createIndex({ provider: 1, eventId: 1 }, { unique: true })
    ,db.collection('invoices').createIndex({ tenantId: 1, createdAt: -1 })
    ,db.collection('campaigns').createIndex({ tenantId: 1, status: 1, scheduledAt: 1 })
    ,db.collection('campaignRecipients').createIndex({ tenantId: 1, campaignId: 1, contactId: 1 }, { unique: true })
    ,db.collection('campaignRecipients').createIndex({ status: 1, nextAttemptAt: 1 })
  ]);
}
