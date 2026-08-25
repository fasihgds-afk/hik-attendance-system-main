// app/api/hr/salary-summary/route.js
// Fast salary report reads from MonthlySalarySummary rollups.
// Missing months are rebuilt once via monthly-attendance?mode=summary (which also upserts rollups).
import { connectDB } from '../../../../lib/db';
import {
  successResponse,
  errorResponse,
  errorResponseFromException,
  HTTP_STATUS,
} from '../../../../lib/api/response';
import { requirePermission } from '../../../../lib/auth/requireAuth';
import { ValidationError } from '../../../../lib/errors/errorHandler';
import {
  getSalarySummariesByMonths,
  toMonthKey,
} from '../../../../lib/salary/salarySummaries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseMonthsParam(searchParams) {
  const monthsParam = (searchParams.get('months') || '').trim();
  const yearParam = (searchParams.get('year') || '').trim();
  const monthParam = toMonthKey(searchParams.get('month') || '');

  if (monthsParam) {
    return [...new Set(monthsParam.split(',').map((m) => toMonthKey(m.trim())).filter(Boolean))];
  }
  if (monthParam) return [monthParam];
  if (yearParam && /^\d{4}$/.test(yearParam)) {
    return Array.from({ length: 12 }, (_, i) => `${yearParam}-${String(i + 1).padStart(2, '0')}`);
  }
  return [];
}

async function rebuildMonthViaMonthlyAttendance(req, month) {
  const url = new URL(req.url);
  url.pathname = url.pathname.replace(/\/salary-summary\/?$/, '/monthly-attendance');
  url.search = `?month=${encodeURIComponent(month)}&mode=summary`;
  const subReq = new Request(url.toString(), {
    method: 'GET',
    headers: req.headers,
  });
  const { GET: monthlyGet } = await import('../monthly-attendance/route.js');
  const res = await monthlyGet(subReq);
  if (!res?.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Failed to rebuild salary summary for ${month}`);
  }
  // Body not needed — monthly GET upserts summaries as a side effect.
  await res.arrayBuffer().catch(() => null);
}

/**
 * GET /api/hr/salary-summary?months=2026-01,2026-02&empCode=
 * GET /api/hr/salary-summary?year=2026
 * GET /api/hr/salary-summary?month=2026-01
 */
export async function GET(req) {
  try {
    await requirePermission('salaryReport', 'view');
    await connectDB();

    const { searchParams } = new URL(req.url);
    const months = parseMonthsParam(searchParams);
    if (months.length === 0) {
      throw new ValidationError('Provide months=YYYY-MM,YYYY-MM or year=YYYY or month=YYYY-MM');
    }
    if (months.length > 24) {
      throw new ValidationError('Too many months requested (max 24)');
    }

    const empCode = (searchParams.get('empCode') || '').trim();
    let byMonth = await getSalarySummariesByMonths(months, { empCode });

    const missing = months.filter((m) => (byMonth.get(m) || []).length === 0);
    const rebuilt = [];
    for (const month of missing) {
      await rebuildMonthViaMonthlyAttendance(req, month);
      rebuilt.push(month);
    }

    if (rebuilt.length > 0) {
      byMonth = await getSalarySummariesByMonths(months, { empCode });
    }

    const monthsOut = months.map((month) => ({
      month,
      employees: byMonth.get(month) || [],
      fromCache: !rebuilt.includes(month),
    }));

    return successResponse(
      {
        months: monthsOut,
        rebuiltMonths: rebuilt,
      },
      'Salary summaries retrieved',
      HTTP_STATUS.OK
    );
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR' || err?.code === 'UNAUTHORIZED') {
      return errorResponse('Unauthorized', 401);
    }
    if (err?.code === 'FORBIDDEN_PERMISSION') {
      return errorResponse(err.message || 'Forbidden', 403);
    }
    return errorResponseFromException(err, req);
  }
}
