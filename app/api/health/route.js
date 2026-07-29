// Health check endpoint to verify API routes are working on Vercel
import { NextResponse } from 'next/server';
import { connectDB } from '../../../lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req) {
  try {
    // Check environment variables
    const hasMongoUri = !!process.env.MONGO_URI;
    const nodeEnv = process.env.NODE_ENV;
    const warm = new URL(req.url).searchParams.get('warm') === '1';

    let mongo = 'skipped';
    if (warm && hasMongoUri) {
      try {
        await connectDB();
        mongo = 'ready';
      } catch {
        mongo = 'unavailable';
      }
    }

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: nodeEnv,
      hasMongoUri,
      mongo,
      message: hasMongoUri 
        ? 'API is working. MONGO_URI is set.' 
        : 'API is working but MONGO_URI is missing!',
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: 'error',
        error: err.message,
      },
      { status: 500 }
    );
  }
}
