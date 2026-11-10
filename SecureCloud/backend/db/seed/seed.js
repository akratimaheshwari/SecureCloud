'use strict';
// Usage:  node db/seed/seed.js            -> insert missing defaults (safe to re-run)
//         node db/seed/seed.js --reset    -> delete the seeded users/policies first, then re-insert
require('dotenv').config();
const bcrypt = require('bcrypt');
const { connectDB, disconnectDB } = require('../db');

const User = require('../models/User');
const File = require('../models/File');
const DlpResult = require('../models/DlpResult');
const SharingLink = require('../models/SharingLink');
const SecurityPolicy = require('../models/SecurityPolicy');
const SecurityEvent = require('../models/SecurityEvent');
const AuditLog = require('../models/AuditLog');

// Credentials come from the environment, never from source code
const requireEnv = (key) => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing env var ${key} (see .env.example)`);
  return value;
};

// Policies are evaluated by ascending priority; the first match wins.
const DEFAULT_POLICIES = [
  {
    name: 'Block external share of highly confidential files',
    description: 'External sharing of HIGHLY_CONFIDENTIAL files is not allowed.',
    condition: { minClassification: 'HIGHLY_CONFIDENTIAL', recipientType: 'EXTERNAL' },
    action: 'BLOCK',
    priority: 10,
  },
  {
    name: 'Require approval for external share of confidential files',
    description: 'External sharing of CONFIDENTIAL files needs admin approval.',
    condition: { minClassification: 'CONFIDENTIAL', recipientType: 'EXTERNAL' },
    action: 'REQUIRE_APPROVAL',
    priority: 20,
  },
  {
    name: 'Warn on internal share of confidential files',
    description: 'Internal sharing of CONFIDENTIAL files is allowed but the user is warned.',
    condition: { minClassification: 'CONFIDENTIAL', recipientType: 'INTERNAL' },
    action: 'WARN',
    priority: 30,
  },
  {
    name: 'Allow all other shares',
    description: 'Default catch-all: anything not matched above is allowed.',
    condition: { recipientType: 'ANY' },
    action: 'ALLOW',
    priority: 100,
  },
];

async function seedUsers() {
  const rounds = parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12;
  const users = [
    {
      name: 'Admin',
      email: requireEnv('SEED_ADMIN_EMAIL'),
      password: requireEnv('SEED_ADMIN_PASSWORD'),
      role: 'admin',
    },
    {
      name: 'Demo User',
      email: requireEnv('SEED_USER_EMAIL'),
      password: requireEnv('SEED_USER_PASSWORD'),
      role: 'user',
    },
  ];

  for (const u of users) {
    const email = u.email.toLowerCase().trim();
    if (await User.exists({ email })) {
      console.log(`[seed] user exists, skipped: ${email}`);
      continue;
    }
    const passwordHash = await bcrypt.hash(u.password, rounds);
    await User.create({ name: u.name, email, passwordHash, role: u.role });
    console.log(`[seed] user created: ${email} (${u.role})`);
  }
  return users.map((u) => u.email.toLowerCase().trim());
}

async function seedPolicies() {
  for (const p of DEFAULT_POLICIES) {
    if (await SecurityPolicy.exists({ name: p.name })) {
      console.log(`[seed] policy exists, skipped: ${p.name}`);
      continue;
    }
    await SecurityPolicy.create(p);
    console.log(`[seed] policy created: ${p.name}`);
  }
}

(async () => {
  try {
    const reset = process.argv.includes('--reset');
    if (reset && process.env.NODE_ENV === 'production') {
      throw new Error('--reset is disabled when NODE_ENV=production');
    }

    await connectDB();

    // Build all indexes up front so unique constraints are enforced from the first insert
    await Promise.all(
      [User, File, DlpResult, SharingLink, SecurityPolicy, SecurityEvent, AuditLog].map((m) => m.init())
    );

    if (reset) {
      const emails = [
        requireEnv('SEED_ADMIN_EMAIL').toLowerCase().trim(),
        requireEnv('SEED_USER_EMAIL').toLowerCase().trim(),
      ];
      await User.deleteMany({ email: { $in: emails } });
      await SecurityPolicy.deleteMany({ name: { $in: DEFAULT_POLICIES.map((p) => p.name) } });
      console.log('[seed] previous seeded users and policies removed');
    }

    await seedUsers();
    await seedPolicies();
    console.log('[seed] done');
  } catch (err) {
    console.error('[seed] failed:', err.message);
    process.exitCode = 1;
  } finally {
    await disconnectDB();
  }
})();
