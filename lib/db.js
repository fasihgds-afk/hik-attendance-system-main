// next-app/lib/db.js
import mongoose from 'mongoose';
import dns from 'dns';

// Note: delay reading MONGO_URI until connectDB is called so builds or
// serverless prerendering that import this module without a runtime
// env don't fail at import time.

// Some Windows/ISP DNS resolvers refuse MongoDB SRV lookups (querySrv ECONNREFUSED).
// Prefer public resolvers so Atlas mongodb+srv:// URIs can resolve.
try {
  const current = dns.getServers();
  const preferred = ['8.8.8.8', '1.1.1.1', '8.8.4.4'];
  const merged = [...new Set([...preferred, ...current])];
  dns.setServers(merged);
} catch {
  // ignore — fall back to system DNS
}

let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function resetMongoCache() {
  cached.conn = null;
  cached.promise = null;
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close(false);
    }
  } catch {
    // ignore close errors during reset
  }
}

export async function connectDB() {
  const MONGODB_URI = process.env.MONGO_URI;
  if (!MONGODB_URI) {
    throw new Error('Please define MONGO_URI in .env.local');
  }

  // OPTIMIZATION: Fast connection check - use cached connection if ready
  // This avoids the slower mongoose.connection.readyState check on every call
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }
  
  // Connection is dead or doesn't exist, reset cache
  if (cached.conn && mongoose.connection.readyState !== 1) {
    await resetMongoCache();
  }

  if (!cached.promise) {
    // OPTIMIZED FOR VERCEL SERVERLESS:
    // - Smaller pool size (serverless functions are short-lived)
    // - Faster timeouts (fail fast on Vercel)
    // - Connection reuse across function invocations
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10,
      minPoolSize: 0, // Don't hold idle sockets that go stale after DNS/network blips
      serverSelectionTimeoutMS: 15000, // 15s - slow networks / Atlas cold start
      socketTimeoutMS: 45000,
      connectTimeoutMS: 15000, // 15s - slow networks / Atlas cold start
      retryWrites: true,
      retryReads: true,
      waitQueueTimeoutMS: 20000,
      family: 4, // Prefer IPv4 — avoids some Windows dual-stack DNS failures
    };

    cached.promise = mongoose
      .connect(MONGODB_URI, opts)
      .then((mongooseInstance) => {
        // Connection event handlers for better error handling (register once)
        if (!global.mongoListenersAttached) {
          global.mongoListenersAttached = true;
          mongooseInstance.connection.on('error', (err) => {
            console.error('MongoDB connection error:', err);
            cached.conn = null;
            cached.promise = null;
          });

          mongooseInstance.connection.on('disconnected', () => {
            console.warn('MongoDB disconnected. Reconnecting...');
            cached.conn = null;
            cached.promise = null;
          });
        }

        // Debug: see which host we're trying to hit (only log once per server start)
        if (!global.mongoLogged) {
          global.mongoLogged = true;
          console.log('MongoDB connected');
          
          // Ensure indexes are created on first connection (after connection is ready)
          if (!global.indexesEnsured) {
            global.indexesEnsured = true;
            // Wait a bit to ensure connection is fully ready, then create indexes
            setTimeout(() => {
              import('./db/ensureIndexes.js').then(({ ensureAllIndexes }) => {
                ensureAllIndexes().catch(err => {
                  console.warn('Index creation warning:', err.message);
                });
              });
            }, 1000); // Wait 1 second for connection to be fully ready
          }
        }

        return mongooseInstance;
      })
      .catch(async (err) => {
        console.error('MongoDB connection failed:', err);
        await resetMongoCache();
        throw err;
      });
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (err) {
    await resetMongoCache();
    throw err;
  }
}
