import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest';
import { getDb } from '@/lib/mongodb';
import { executeWorkflow } from '@/lib/workflows';
import { processOutboxItem } from '@/lib/messaging/engine';

const execute = inngest.createFunction({ id: 'execute-workflow', retries: 3, concurrency: { limit: 20 }, triggers: [{ event: 'workflow/execute' }] }, async ({ event, step }) => {
  const data = event.data as { tenantId: string; workflowId: string; executionId: string };
  try { return await step.run('execute-tenant-workflow', async () => executeWorkflow(await getDb(), data)); }
  catch (error) {
    const db = await getDb();
    const { ObjectId } = await import('mongodb');
    if (ObjectId.isValid(data.tenantId) && ObjectId.isValid(data.executionId)) await db.collection('workflowExecutions').updateOne({ _id: new ObjectId(data.executionId), tenantId: new ObjectId(data.tenantId) }, { $set: { status: 'failed', error: error instanceof Error ? error.message : 'Workflow execution failed', completedAt: new Date(), updatedAt: new Date() } });
    throw error;
  }
});

const dispatchMessages = inngest.createFunction({ id: 'dispatch-workflow-messages', retries: 3, concurrency: { limit: 10 }, triggers: [{ event: 'workflow/dispatch-messages' }] }, async ({ step }) => step.run('process-pending-message-outbox', async () => {
  const db = await getDb();
  const items = await db.collection('messageOutbox').find({ status: { $in: ['pending','retry'] }, nextAttemptAt: { $lte: new Date() } }).sort({ createdAt: 1 }).limit(100).toArray();
  const results = [];
  for (const item of items) results.push(await processOutboxItem(db, item));
  return { processed: results.length, results };
}));

export const { GET, POST, PUT } = serve({ client: inngest, functions: [execute, dispatchMessages] });
