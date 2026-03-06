import { connectDB } from '../../../../../lib/db';
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../../../lib/api/response';
import Device from '../../../../../models/Device';
import SuspiciousLog from '../../../../../models/SuspiciousLog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIVE_OFFLINE_MS = 120 * 1000; // 2 min — reduces false offline when heartbeat delayed

function getTodayStart(tz = '+05:00') {
  const now = new Date();
  const ymd = new Date(now.toISOString().slice(0, 10) + `T00:00:00${tz}`);
  return ymd;
}

export async function GET(req) {
  try {
    await connectDB();

    const now = new Date();
    const todayStart = getTodayStart(process.env.TIMEZONE_OFFSET || '+05:00');

    const [devices, suspiciousLogs] = await Promise.all([
      Device.find({})
        .select('empCode deviceId suspiciousActive lastSeenAt')
        .lean()
        .maxTimeMS(3000),
      SuspiciousLog.find({
        startedAt: { $gte: todayStart }
      })
        .select('empCode active durationMin startedAt endedAt')
        .lean()
        .maxTimeMS(3000)
    ]);

    const liveSuspiciousEmployees = new Set();
    const liveOnlineEmployees = new Set();
    for (const d of devices) {
      const lastSeenMs = d.lastSeenAt ? new Date(d.lastSeenAt).getTime() : 0;
      const isOnline = now.getTime() - lastSeenMs <= LIVE_OFFLINE_MS;
      if (isOnline) liveOnlineEmployees.add(String(d.empCode));
      if (isOnline && d.suspiciousActive) liveSuspiciousEmployees.add(String(d.empCode));
    }

    const suspiciousMinutesToday = suspiciousLogs.reduce((acc, row) => {
      if (row.active && !row.endedAt) {
        const start = new Date(row.startedAt).getTime();
        const minutes = Math.max(0, Math.floor((now.getTime() - start) / 60000));
        return acc + minutes;
      }
      return acc + Number(row.durationMin || 0);
    }, 0);

    return successResponse(
      {
        totalDevices: devices.length,
        liveOnlineEmployees: liveOnlineEmployees.size,
        liveSuspiciousEmployees: liveSuspiciousEmployees.size,
        suspiciousMinutesToday,
        suspiciousHoursToday: Number((suspiciousMinutesToday / 60).toFixed(2))
      },
      'Monitoring summary loaded',
      HTTP_STATUS.OK
    );
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}
