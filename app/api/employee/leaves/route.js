// app/api/employee/leaves/route.js
// Quarter-based paid leave with restricted carry-forward (Q1->Q2 and Q3->Q4 only)
import { connectDB } from '../../../../lib/db';
import LeaveRecord from '../../../../models/LeaveRecord';
import { getQuarterFromDate, getQuarterRange, getCurrentQuarter, getQuarterLabel } from '../../../../lib/leave/quarterUtils';
import { getLeavePolicy } from '../../../../lib/leave/getLeavePolicy';
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';
import { ValidationError } from '../../../../lib/errors/errorHandler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getQuarterAllocationsWithCarry(leavesPerQuarter, q1Taken, q2Taken, q3Taken, q4Taken) {
  const base = leavesPerQuarter;
  const q1Allocated = base;
  const q1Remaining = Math.max(0, q1Allocated - q1Taken);
  const q2Allocated = base + q1Remaining; // carry only from Q1 -> Q2
  const q2Remaining = Math.max(0, q2Allocated - q2Taken);
  const q3Allocated = base;
  const q3Remaining = Math.max(0, q3Allocated - q3Taken);
  const q4Allocated = base + q3Remaining; // carry only from Q3 -> Q4
  const q4Remaining = Math.max(0, q4Allocated - q4Taken);

  return {
    q1: { allocated: q1Allocated, remaining: q1Remaining },
    q2: { allocated: q2Allocated, remaining: q2Remaining },
    q3: { allocated: q3Allocated, remaining: q3Remaining },
    q4: { allocated: q4Allocated, remaining: q4Remaining },
  };
}

// GET /api/employee/leaves?empCode=XXX&year=YYYY - Balance by quarter (current quarter + full year optional)
export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const empCode = searchParams.get('empCode');
    const yearParam = searchParams.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

    if (!empCode) {
      throw new ValidationError('empCode is required');
    }

    const policy = await getLeavePolicy();
    const leavesPerQuarter = policy.leavesPerQuarter;

    const { year: currentYear, quarter: currentQuarter } = getCurrentQuarter();

    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    const leaveRecords = await LeaveRecord.find({
      empCode,
      date: { $gte: yearStart, $lte: yearEnd },
      leaveType: { $in: ['paid', 'casual', 'annual'] },
    })
      .select('date reason leaveType')
      .sort({ date: -1 })
      .lean()
      .maxTimeMS(2000);

    function toDateStr(d) {
      if (!d) return '';
      if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
      if (d instanceof Date && !Number.isNaN(d.getTime())) {
        const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
      return String(d).slice(0, 10);
    }

    const countByQuarter = { 1: 0, 2: 0, 3: 0, 4: 0 };
    leaveRecords.forEach((lr) => {
      const dateStr = toDateStr(lr.date);
      if (!dateStr) return;
      const { quarter } = getQuarterFromDate(dateStr);
      if (countByQuarter[quarter] !== undefined) countByQuarter[quarter] += 1;
    });
    const allocations = getQuarterAllocationsWithCarry(
      leavesPerQuarter,
      countByQuarter[1] || 0,
      countByQuarter[2] || 0,
      countByQuarter[3] || 0,
      countByQuarter[4] || 0
    );

    const quarters = [1, 2, 3, 4].map((q) => ({
      quarter: q,
      label: getQuarterLabel(year, q),
      allocated: allocations[`q${q}`].allocated,
      taken: countByQuarter[q] || 0,
      remaining: allocations[`q${q}`].remaining,
      ...getQuarterRange(year, q),
    }));

    const currentQuarterData = year === currentYear ? quarters[currentQuarter - 1] : null;

    const summary = {
      leavesPerQuarter,
      currentQuarter: currentQuarterData
        ? {
            quarter: currentQuarter,
            label: currentQuarterData.label,
            year: currentYear,
            taken: currentQuarterData.taken,
            remaining: currentQuarterData.remaining,
            allocated: currentQuarterData.allocated,
          }
        : null,
      quarters,
      history: leaveRecords,
    };

    return successResponse(
      { empCode, year, summary },
      'Leave balance retrieved successfully',
      HTTP_STATUS.OK
    );
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}
