/**
 * MongoDB connection diagnostic script
 * Run: node --env-file=.env.local scripts/test-mongo-connection.js
 * (Node 20.6+ required for --env-file)
 * 
 * Or: set MONGO_URI=your_uri && node scripts/test-mongo-connection.js
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// Load .env.local manually if not set
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

async function test() {
  console.log('\n=== MongoDB Connection Diagnostic ===\n');

  if (!uri) {
    console.error('❌ MONGO_URI not found in .env.local');
    console.log('   Add: MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/dbname');
    process.exit(1);
  }

  // Mask password in output
  const masked = uri.replace(/:([^:@]+)@/, ':****@');
  console.log('Connection string (masked):', masked);
  console.log('');

  // Extract host for DNS test
  const match = uri.match(/@([^/]+)/);
  const host = match ? match[1] : 'unknown';
  console.log('Atlas host:', host);

  // Test 1: DNS resolution
  console.log('\n1. Testing DNS resolution...');
  try {
    const dns = await import('dns').then(m => m.promises);
    await dns.resolve4(host.split(':')[0]);
    console.log('   ✓ DNS resolves OK');
  } catch (e) {
    console.log('   ❌ DNS failed:', e.message);
  }

  // Test 2: Mongoose connection
  console.log('\n2. Testing Mongoose connection (15s timeout)...');
  const mongoose = (await import('mongoose')).default;

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
    console.log('   ✓ MongoDB connected successfully!');
    await mongoose.disconnect();
  } catch (e) {
    console.log('   ❌ Mongoose failed:', e.message);
    if (e.message.includes('timed out')) {
      console.log('\n   Common fixes:');
      console.log('   • MongoDB Atlas → Network Access → Add IP Address');
      console.log('   • Add 0.0.0.0/0 to allow all IPs (dev only)');
      console.log('   • Check if cluster is paused (free tier auto-pauses)');
      console.log('   • Try from mobile hotspot to rule out corporate firewall');
    }
  }

  console.log('\n=== Done ===\n');
  process.exit(0);
}

test().catch((e) => {
  console.error(e);
  process.exit(1);
});
