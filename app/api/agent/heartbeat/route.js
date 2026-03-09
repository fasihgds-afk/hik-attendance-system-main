import { z } from 'zod';
import { connectDB } from '../../../../lib/db';
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';
import { UnauthorizedError } from '../../../../lib/errors/errorHandler';
import Device from '../../../../models/Device';
import BreakLog from '../../../../models/BreakLog';
import SuspiciousLog from '../../../../models/SuspiciousLog';
import { clipIntervalToShiftWindow } from '../../../../lib/shift/resolveShiftWindow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const LIVE_OFFLINE_MS = 120 * 1000; // 2 min — reduces false offline when heartbeat delayed

const bodySchema = z.object({
  empCode: z.string().min(1),
  deviceId: z.string().min(1),
  deviceToken: z.string().optional().default(''),
  status: z.enum(['ACTIVE', 'IDLE', 'BREAK', 'SUSPICIOUS', 'OFFLINE']).optional(),
  state: z.enum(['ACTIVE', 'IDLE', 'BREAK', 'SUSPICIOUS', 'OFFLINE']).optional(),
  suspiciousActive: z.boolean().optional(),
  autoClickerDetected: z.boolean().optional(),
  activityScore: z.number().optional(),
  hostName: z.string().optional().default(''),
  os: z.string().optional().default(''),
  appVersion: z.string().optional().default('')
});

export async function POST(req) {
  try {
    const body = bodySchema.parse(await req.json());
    await connectDB();

    const headerToken = String(req.headers.get('x-device-token') || '').trim();
    const providedToken = headerToken || body.deviceToken;
    if (!providedToken) throw new UnauthorizedError('Missing device token');

    const status = body.status || body.state || 'ACTIVE';
    const suspiciousActive = body.suspiciousActive ?? body.autoClickerDetected ?? false;

    const existing = await Device.findOne({
      empCode: body.empCode,
      deviceId: body.deviceId
    }).lean().maxTimeMS(2000);

    if (existing && String(existing.deviceToken || '') !== providedToken) {
      throw new UnauthorizedError('Invalid device token');
    }

    const now = new Date();
    const STALE_BREAK_HOURS = 12;

    await Device.updateOne(
      { empCode: body.empCode, deviceId: body.deviceId },
      {
        $set: {
          deviceToken: providedToken,
          currentStatus: status,
          suspiciousActive,
          hostName: body.hostName,
          os: body.os,
          appVersion: body.appVersion,
          lastSeenAt: now,
          updatedAt: now
        },
        $setOnInsert: {
          empCode: body.empCode,
          deviceId: body.deviceId
        }
      },
      { upsert: true }
    );

    // Auto-close stale OPEN breaks (safety net for orphaned breaks from network outages)
    const staleThreshold = new Date(now.getTime() - STALE_BREAK_HOURS * 60 * 60 * 1000);
    const staleBreaks = await BreakLog.find({
      empCode: body.empCode,
      deviceId: body.deviceId,
      status: 'OPEN',
      breakStartAt: { $lt: staleThreshold }
    }).maxTimeMS(2000);
    for (const doc of staleBreaks) {
      try {
        const window = doc.shiftStartAt && doc.shiftEndAt
          ? { shiftStart: doc.shiftStartAt, shiftEnd: doc.shiftEndAt }
          : null;
        const effectiveEnd = window ? new Date(Math.min(now.getTime(), new Date(doc.shiftEndAt).getTime())) : now;
        const startMs = new Date(doc.breakStartAt).getTime();
        const endMs = effectiveEnd.getTime();
        const clipped = window
          ? clipIntervalToShiftWindow(doc.breakStartAt, effectiveEnd, window)
          : { durationMin: Math.max(0, Math.floor((endMs - startMs) / 60000)) };
        doc.breakEndAt = effectiveEnd;
        doc.status = 'CLOSED';
        doc.reason = 'Auto-closed: stale break (network recovery)';
        doc.category = doc.category || 'Official';
        doc.durationMin = clipped.durationMin ?? Math.max(0, Math.floor((endMs - startMs) / 60000));
        doc.exceededDurationMin = Math.max(0, doc.durationMin - (doc.allowedDurationMin || 0));
        await doc.save();
      } catch (e) {
        // Non-fatal
      }
    }

    // Keep live suspicious state and historical suspicious minutes in sync.
    const wasSuspicious = !!existing?.suspiciousActive;
    const isSuspicious = suspiciousActive;
    if (!wasSuspicious && isSuspicious) {
      await SuspiciousLog.create({
        empCode: body.empCode,
        deviceId: body.deviceId,
        active: true,
        startedAt: now,
        source: 'autoclicker'
      });
    } else if (wasSuspicious && !isSuspicious) {
      const openLog = await SuspiciousLog.findOne({
        empCode: body.empCode,
        deviceId: body.deviceId,
        active: true,
        endedAt: null
      }).sort({ startedAt: -1 }).maxTimeMS(2000);
      if (openLog) {
        const durationMin = Math.max(
          0,
          Math.floor((now.getTime() - new Date(openLog.startedAt).getTime()) / 60000)
        );
        openLog.active = false;
        openLog.endedAt = now;
        openLog.durationMin = durationMin;
        await openLog.save();
      }
    }

    return successResponse(
      { serverTime: now.toISOString() },
      'Heartbeat accepted',
      HTTP_STATUS.OK
    );
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}

export async function GET(req) {
  try {
    await connectDB();
    const now = Date.now();
    const rows = await Device.find({})
      .select('empCode deviceId hostName os appVersion currentStatus suspiciousActive lastSeenAt updatedAt')
      .lean()
      .maxTimeMS(3000);

    const data = rows.map((d) => {
      const lastSeenMs = d.lastSeenAt ? new Date(d.lastSeenAt).getTime() : 0;
      const liveOnline = now - lastSeenMs <= LIVE_OFFLINE_MS;
      const liveStatus = liveOnline ? d.currentStatus : 'OFFLINE';
      const liveSuspicious = liveOnline && !!d.suspiciousActive;
      return {
        ...d,
        liveOnline,
        liveStatus,
        liveSuspicious
      };
    });

    return successResponse(data, 'Live device monitoring feed', HTTP_STATUS.OK);
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}
