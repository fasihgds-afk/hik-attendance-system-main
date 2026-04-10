import crypto from 'crypto';
import { z } from 'zod';
import { requireHR } from '../../../../lib/auth/requireAuth';
import { successResponse, errorResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';
import { rateLimiters } from '../../../../lib/middleware/rateLimit';
import SecurityAuditLog from '../../../../models/SecurityAuditLog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  empCode: z.string().min(1),
  deviceName: z.string().optional(),
  ttlSec: z.number().int().min(60).max(3600).optional(),
});

export async function POST(req) {
  const rateLimitResponse = await rateLimiters.write(req);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { user } = await requireHR();
    const body = schema.parse(await req.json());
    const secret = String(process.env.ENROLLMENT_TOKEN_SECRET || '').trim();
    if (!secret) {
      return errorResponse('ENROLLMENT_TOKEN_SECRET is not configured', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    const ttlSec = Number(body.ttlSec || 600);
    const payload = {
      empCode: String(body.empCode).trim(),
      deviceName: String(body.deviceName || '').trim() || undefined,
      exp: Date.now() + ttlSec * 1000,
      issuedBy: String(user?.email || user?.empCode || 'HR'),
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');
    const token = `${payloadB64}.${sig}`;

    await SecurityAuditLog.create({
      actorRole: String(user?.role || 'HR'),
      actorId: String(user?.email || user?.empCode || 'unknown'),
      action: 'ENROLLMENT_TOKEN_ISSUE',
      target: payload.empCode,
      status: 'SUCCESS',
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown',
      details: { ttlSec },
    });

    return successResponse({ token, expiresInSec: ttlSec }, 'Enrollment token generated', HTTP_STATUS.OK);
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return errorResponse('Unauthorized', 401);
    return errorResponseFromException(err, req);
  }
}
