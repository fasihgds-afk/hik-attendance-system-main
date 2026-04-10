import { z } from 'zod';
import crypto from 'crypto';
import { connectDB } from '../../../../lib/db';
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';
import { rateLimiters } from '../../../../lib/middleware/rateLimit';
import Employee from '../../../../models/Employee';
import Device from '../../../../models/Device';
import SecurityAuditLog from '../../../../models/SecurityAuditLog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function allowedOrigins() {
  return String(process.env.ENROLLMENT_ALLOWED_ORIGINS || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function getRequestOrigin(req) {
  return String(req.headers.get('origin') || '').trim();
}

function isOriginAllowed(origin) {
  if (!origin) return false;
  const allowed = allowedOrigins();
  return allowed.includes(origin);
}

function applyCorsHeaders(headers, origin) {
  headers.set('Vary', 'Origin');
  if (origin && isOriginAllowed(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
  }
}

function verifyEnrollmentToken(token, empCode, deviceName) {
  const secret = String(process.env.ENROLLMENT_TOKEN_SECRET || '').trim();
  if (!secret) throw new Error('Enrollment token secret is not configured');
  const [payloadB64, sig] = String(token || '').split('.');
  if (!payloadB64 || !sig) throw new Error('Invalid enrollment token format');
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');
  if (expectedSig.length !== sig.length) throw new Error('Invalid enrollment token signature');
  if (!crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(sig))) {
    throw new Error('Invalid enrollment token signature');
  }
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  if (!payload?.exp || Date.now() > Number(payload.exp)) throw new Error('Enrollment token expired');
  if (String(payload.empCode || '') !== String(empCode || '')) throw new Error('Enrollment token empCode mismatch');
  if (payload.deviceName && String(payload.deviceName) !== String(deviceName)) {
    throw new Error('Enrollment token device mismatch');
  }
  return payload;
}

// Strict CORS for agent enrollment
export async function OPTIONS(req) {
  const origin = getRequestOrigin(req);
  if (!isOriginAllowed(origin)) {
    return new Response(null, { status: 403 });
  }
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  });
  applyCorsHeaders(headers, origin);
  return new Response(null, {
    status: 204,
    headers,
  });
}

const bodySchema = z.object({
  empCode: z.string().min(1, 'Employee code is required'),
  deviceName: z.string().optional().default(''),
  os: z.string().optional().default(''),
  agentVersion: z.string().optional().default(''),
  enrollmentToken: z.string().min(1, 'enrollmentToken is required'),
});

export async function POST(req) {
  const rateLimitResponse = await rateLimiters.auth(req);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const origin = getRequestOrigin(req);
    if (!isOriginAllowed(origin)) {
      throw new Error('Origin not allowed for enrollment');
    }
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
    verifyEnrollmentToken(body.enrollmentToken, empCode, deviceName);

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
    applyCorsHeaders(res.headers, origin);
    await SecurityAuditLog.create({
      actorRole: 'SYSTEM',
      actorId: empCode,
      action: 'DEVICE_ENROLL',
      target: `${empCode}:${deviceId}`,
      status: 'SUCCESS',
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown',
      details: { os, agentVersion },
    });
    return res;
  } catch (err) {
    try {
      await SecurityAuditLog.create({
        actorRole: 'SYSTEM',
        actorId: 'unknown',
        action: 'DEVICE_ENROLL',
        target: 'unknown',
        status: 'FAILED',
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown',
        details: { message: err?.message || 'enroll_failed' },
      });
    } catch {}
    return errorResponseFromException(err, req);
  }
}
