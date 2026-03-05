import { z } from 'zod';
import crypto from 'crypto';
import { connectDB } from '../../../../lib/db';
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';
import Employee from '../../../../models/Employee';
import Device from '../../../../models/Device';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Allow CORS for agent enrollment (desktop app)
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

const bodySchema = z.object({
  empCode: z.string().min(1, 'Employee code is required'),
  deviceName: z.string().optional().default(''),
  os: z.string().optional().default(''),
  agentVersion: z.string().optional().default(''),
});

export async function POST(req) {
  try {
    const body = bodySchema.parse(await req.json());
    const empCode = String(body.empCode || '').trim();
    const deviceName = String(body.deviceName || '').trim() || 'unknown';
    const os = String(body.os || '').trim();
    const agentVersion = String(body.agentVersion || '').trim();

    if (!empCode) {
      return errorResponseFromException(
        new Error('Employee code is required'),
        req,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    await connectDB();

    const employee = await Employee.findOne({ empCode }).lean().maxTimeMS(3000);
    if (!employee) {
      return errorResponseFromException(
        new Error(`Employee not found: ${empCode}. Please check your employee code.`),
        req,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const deviceId = deviceName || crypto.randomBytes(8).toString('hex');
    const deviceToken = crypto.randomBytes(32).toString('hex');
    const heartbeatIntervalSec = 180;

    const now = new Date();
    await Device.updateOne(
      { empCode, deviceId },
      {
        $set: {
          empCode,
          deviceId,
          deviceToken,
          hostName: deviceName,
          os,
          appVersion: agentVersion,
          currentStatus: 'OFFLINE',
          suspiciousActive: false,
          lastSeenAt: now,
          updatedAt: now,
        },
      },
      { upsert: true }
    );

    const res = successResponse(
      {
        deviceId,
        deviceToken,
        heartbeatIntervalSec,
      },
      'Device enrolled successfully',
      HTTP_STATUS.OK
    );
    res.headers.set('Access-Control-Allow-Origin', '*');
    return res;
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}
