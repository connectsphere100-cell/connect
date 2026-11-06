import { ObjectId } from 'mongodb';
import type { Db } from 'mongodb';

export const defaultPlanLimits = {
  teamMembers: 5, connectedChannels: 2, monthlyConversations: 1000, aiUsage: 1000,
  knowledgeBaseStorage: 100_000_000, automationWorkflows: 3, campaigns: 2, fileStorage: 1_000_000_000,
};

export async function currentSubscription(db: Db, tenantId: ObjectId) {
  const now = new Date();
  const subscription = await db.collection('subscriptions').findOne({ tenantId });
  if (!subscription) return { status: 'trialing', plan: 'free', limits: defaultPlanLimits, trialEndsAt: null, periodEnd: null };
  if (subscription.status === 'active' && subscription.periodEnd && new Date(subscription.periodEnd) < now) {
    await db.collection('subscriptions').updateOne({ _id: subscription._id, tenantId, status: 'active' }, { $set: { status: 'grace', graceEndsAt: new Date(now.getTime() + 7 * 86400000), updatedAt: now } });
    subscription.status = 'grace'; subscription.graceEndsAt = new Date(now.getTime() + 7 * 86400000);
  }
  if ((subscription.status === 'grace' && subscription.graceEndsAt && new Date(subscription.graceEndsAt) < now) || (subscription.status === 'trialing' && subscription.trialEndsAt && new Date(subscription.trialEndsAt) < now)) {
    await db.collection('subscriptions').updateOne({ _id: subscription._id, tenantId }, { $set: { status: 'expired', updatedAt: now } });
    subscription.status = 'expired';
  }
  const plan = await db.collection('plans').findOne({ slug: subscription.plan, status: 'active' });
  return { ...subscription, limits: plan?.limits || defaultPlanLimits };
}

export async function usageSnapshot(db: Db, tenantId: ObjectId) {
  const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  const [members, channels, conversations, ai, knowledge, workflows, campaigns, files] = await Promise.all([
    db.collection('memberships').countDocuments({ tenantId, status: 'active' }),
    db.collection('channels').countDocuments({ tenantId, connectionStatus: 'connected' }),
    db.collection('conversations').countDocuments({ tenantId, createdAt: { $gte: start } }),
    db.collection('aiUsage').aggregate([{ $match: { tenantId, period: { $gte: start } } }, { $group: { _id: null, total: { $sum: '$messages' } } }]).next(),
    db.collection('aiKnowledge').aggregate([{ $match: { tenantId } }, { $group: { _id: null, total: { $sum: '$size' } } }]).next(),
    db.collection('workflows').countDocuments({ tenantId, enabled: true }),
    db.collection('campaigns').countDocuments({ tenantId, createdAt: { $gte: start } }),
    db.collection('uploads').aggregate([{ $match: { tenantId } }, { $group: { _id: null, total: { $sum: '$size' } } }]).next(),
  ]);
  return { teamMembers: members, connectedChannels: channels, monthlyConversations: conversations, aiUsage: ai?.total || 0, knowledgeBaseStorage: knowledge?.total || 0, automationWorkflows: workflows, campaigns, fileStorage: files?.total || 0, periodStart: start };
}

export async function enforceLimit(db: Db, tenantId: ObjectId, key: keyof typeof defaultPlanLimits, increment = 1) {
  const subscription = await currentSubscription(db, tenantId);
  if (['expired', 'canceled'].includes(String(subscription.status))) throw new Error('SUBSCRIPTION_INACTIVE');
  const usage = await usageSnapshot(db, tenantId);
  const limit = Number(subscription.limits?.[key] ?? defaultPlanLimits[key]);
  if (limit !== -1 && Number(usage[key] || 0) + increment > limit) throw new Error(`PLAN_LIMIT:${key}:${limit}`);
  return { subscription, usage, limit };
}
