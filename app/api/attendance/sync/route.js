import { NextResponse } from 'next/server';
import { connectDB } from '../../../../lib/db';
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';
import AgentActivityLog from '../../../../models/AgentActivityLog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const syncSchema = {
  type: 'object',
  required: ['employeeCode', 'events'],
  properties: {
    employeeCode: { type: 'string', minLength: 1 },
    deviceId: { type: 'string' },
    events: {
      type: 'array',
      items: {
        type: 'object',
        required: ['type', 'timestamp'],
        properties: {
          type: { type: 'string' },
          sessionStart: { type: 'string' },
          totalIdle: { type: 'number' },
          reason: { type: 'string' },
          category: { type: 'string' },
          timestamp: { type: 'string' }
        }
      }
    }
  }
};

function validatePayload(body) {
  if (!body || typeof body !== 'object') return 'Invalid payload';
  if (!body.employeeCode || typeof body.employeeCode !== 'string') return 'employeeCode required';
  if (!Array.isArray(body.events)) return 'events array required';
  for (const e of body.events) {
    if (!e.type || !e.timestamp) return 'Each event needs type and timestamp';
  }
  return null;
}

export async function POST(req) {
  try {
    const body = await req.json();
    const err = validatePayload(body);
    if (err) {
      return NextResponse.json(
        { success: false, message: err, data: null, error: err },
        { status: HTTP_STATUS.BAD_REQUEST }
      );
    }
    await connectDB();

    const empCode = String(body.employeeCode).trim();
    const deviceId = String(body.deviceId || 'whealthsvc-win').trim();
    const events = body.events || [];

    if (events.length === 0) {
      return successResponse({ accepted: 0 }, 'No events to sync', HTTP_STATUS.OK);
    }

    const docs = events.map((e) => ({
      empCode,
      deviceId,
      type: String(e.type || 'event'),
      sessionStart: e.sessionStart ? new Date(e.sessionStart) : null,
      totalIdle: Number(e.totalIdle || 0),
      reason: String(e.reason || ''),
      category: String(e.category || ''),
      timestamp: new Date(e.timestamp),
      raw: e
    }));

    await AgentActivityLog.insertMany(docs);
    return successResponse({ accepted: docs.length }, 'Log synced', HTTP_STATUS.OK);
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}
