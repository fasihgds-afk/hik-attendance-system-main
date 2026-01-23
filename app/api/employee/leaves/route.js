// app/api/employee/leaves/route.js
import { connectDB } from '../../../../lib/db';
import PaidLeave from '../../../../models/PaidLeave';
import LeaveRecord from '../../../../models/LeaveRecord';
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';
import { ValidationError } from '../../../../lib/errors/errorHandler';

// OPTIMIZATION: Node.js runtime for better connection pooling
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/employee/leaves?empCode=XXXXX - Get employee leave balance
export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const empCode = searchParams.get('empCode');
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString(), 10);

    if (!empCode) {
      throw new ValidationError('empCode is required');
    }

    // Get or create paid leave record for the year
    const paidLeave = await PaidLeave.getOrCreate(empCode, year);

    // Get leave history for the year
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    
    const leaveHistory = await LeaveRecord.find({
      empCode,
      date: { $gte: yearStart, $lte: yearEnd },
    })
      .sort({ date: -1 })
      .lean()
      .maxTimeMS(3000);

    // Calculate summary
    const summary = {
      totalAllocated: paidLeave.totalLeavesAllocated,
      totalTaken: paidLeave.totalLeavesTaken,
      totalRemaining: paidLeave.totalLeavesRemaining,
      casual: {
        allocated: paidLeave.casualLeavesAllocated,
        taken: paidLeave.casualLeavesTaken,
        remaining: paidLeave.casualLeavesRemaining,
      },
      annual: {
        allocated: paidLeave.annualLeavesAllocated,
        taken: paidLeave.annualLeavesTaken,
        remaining: paidLeave.annualLeavesRemaining,
      },
    };

    return successResponse(
      {
        empCode,
        year,
        summary,
        history: leaveHistory,
      },
      'Leave balance retrieved successfully',
      HTTP_STATUS.OK
    );
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}
