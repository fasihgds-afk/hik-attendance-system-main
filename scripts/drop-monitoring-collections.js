/**
 * One-time cleanup: drop the MongoDB collections left behind by the
 * (now removed) Windows agent / live-monitoring feature.
 *
 * Collections targeted (Mongoose default pluralized names):
 *   - devices               (was models/Device.js)
 *   - suspiciouslogs        (was models/SuspiciousLog.js)
 *   - agentactivitylogs     (was models/AgentActivityLog.js)
 *   - attendancesyncrequests(was models/AttendanceSyncRequest.js)
 *
 * SAFETY: This script is DRY-RUN by default. It only reports what it would
 * drop. Pass --confirm to actually drop the collections.
 *
 * Usage:
 *   node --env-file=.env.local scripts/drop-monitoring-collections.js            # dry run
 *   node --env-file=.env.local scripts/drop-monitoring-collections.js --confirm  # really drop
 *
 * (Node 20.6+ for --env-file; otherwise this script also loads .env.local manually.)
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// Load MONGO_URI from .env.local if not already in the environment.
if (!process.env.MONGO_URI) {
  const envPath = resolve(process.cwd(), '.env.local');
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const m = line.match(/^MONGO_URI=(.+)$/);
      if (m) {
        process.env.MONGO_URI = m[1].trim().replace(/^["']|["']$/g, '');
        break;
      }
    }
  }
}

const uri = process.env.MONGO_URI;
const CONFIRM = process.argv.includes('--confirm');

// Collections created by the removed monitoring/agent feature.
const TARGET_COLLECTIONS = [
  'devices',
  'suspiciouslogs',
  'agentactivitylogs',
  'attendancesyncrequests',
];

async function main() {
  console.log('\n=== Drop Monitoring Collections ===\n');
  console.log(CONFIRM ? 'MODE: CONFIRM (collections WILL be dropped)' : 'MODE: DRY RUN (nothing will be dropped — pass --confirm to drop)');

  if (!uri) {
    console.error('\n❌ MONGO_URI not found. Set it in .env.local or the environment.');
    process.exit(1);
  }

  const mongoose = (await import('mongoose')).default;
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.log('\n✓ Connected to MongoDB');

  const db = mongoose.connection.db;
  const existing = (await db.listCollections().toArray()).map((c) => c.name);

  for (const name of TARGET_COLLECTIONS) {
    if (!existing.includes(name)) {
      console.log(`  • ${name}: not present (skip)`);
      continue;
    }
    const count = await db.collection(name).estimatedDocumentCount();
    if (CONFIRM) {
      await db.collection(name).drop();
      console.log(`  ✓ ${name}: DROPPED (~${count} docs)`);
    } else {
      console.log(`  • ${name}: would drop (~${count} docs)`);
    }
  }

  await mongoose.disconnect();
  console.log(`\n=== Done ===${CONFIRM ? '' : '\n(Run again with --confirm to actually drop the collections.)'}\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error('\n❌ Error:', e.message);
  process.exit(1);
});
