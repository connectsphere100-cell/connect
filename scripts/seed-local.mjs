import bcrypt from 'bcryptjs';
import { MongoClient } from 'mongodb';
import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to seed while NODE_ENV=production. Use a local development database only.');
}

const required = (key) => {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Set ${key} in .env.local or the environment before running this command.`);
  return value;
};

const uri = required('MONGODB_URI');
const adminEmail = required('SEED_ADMIN_EMAIL').toLowerCase();
const adminPassword = required('SEED_ADMIN_PASSWORD');
const superAdminEmail = required('SEED_SUPER_ADMIN_EMAIL').toLowerCase();
const superAdminPassword = required('SEED_SUPER_ADMIN_PASSWORD');
const adminName = process.env.SEED_ADMIN_NAME?.trim() || 'Local Admin';
const superAdminName = process.env.SEED_SUPER_ADMIN_NAME?.trim() || 'Local Superadmin';
const workspaceName = process.env.SEED_ADMIN_WORKSPACE?.trim() || 'Local Admin Workspace';

for (const [label, email, password] of [
  ['admin', adminEmail, adminPassword],
  ['superadmin', superAdminEmail, superAdminPassword],
]) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`SEED_${label.toUpperCase()}_EMAIL must be a valid email.`);
  if (password.length < 10 || password.length > 100) throw new Error(`${label} password must be between 10 and 100 characters.`);
}
if (adminEmail === superAdminEmail) throw new Error('Admin and superadmin accounts must use different email addresses.');

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB_NAME || 'zenstack360_connect');
  const users = db.collection('users');
  const tenants = db.collection('tenants');
  const memberships = db.collection('memberships');
  await users.createIndex({ email: 1 }, { unique: true });
  await tenants.createIndex({ slug: 1 }, { unique: true });
  await memberships.createIndex({ tenantId: 1, userId: 1 }, { unique: true });

  async function upsertUser(email, name, password, fields = {}) {
    const existing = await users.findOne({ email });
    const now = new Date();
    const values = { name, passwordHash: await bcrypt.hash(password, 12), ...fields };
    if (existing) {
      await users.updateOne({ _id: existing._id }, { $set: values });
      return existing;
    }
    const result = await users.insertOne({ email, ...values, createdAt: now });
    return { _id: result.insertedId, email, name };
  }

  const admin = await upsertUser(adminEmail, adminName, adminPassword);
  let tenant = await tenants.findOne({ slug: 'local-admin-workspace' });
  if (!tenant) {
    const result = await tenants.insertOne({ name: workspaceName, slug: 'local-admin-workspace', plan: 'free', status: 'active', createdAt: new Date() });
    tenant = { _id: result.insertedId };
  } else if (tenant.name !== workspaceName) {
    await tenants.updateOne({ _id: tenant._id }, { $set: { name: workspaceName } });
  }
  await memberships.updateOne(
    { tenantId: tenant._id, userId: admin._id },
    { $set: { role: 'admin', status: 'active' }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true },
  );

  await upsertUser(superAdminEmail, superAdminName, superAdminPassword, { role: 'super_admin' });
  console.log(`Seeded local admin: ${adminEmail} (workspace: ${workspaceName})`);
  console.log(`Seeded local superadmin: ${superAdminEmail}`);
} finally {
  await client.close();
}
