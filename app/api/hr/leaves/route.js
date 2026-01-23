// app/api/hr/leaves/route.js
import { connectDB } from '../../../../lib/db';
import PaidLeave from '../../../../models/PaidLeave';
import LeaveRecord from '../../../../models/LeaveRecord';
import ShiftAttendance from '../../../../models/ShiftAttendance';
import Employee from '../../../../models/Employee';
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../../lib/api/response';
import { ValidationError, NotFoundError } from '../../../../lib/errors/errorHandler';

// OPTIMIZATION: Node.js runtime for better connection pooling
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/hr/leaves - Get all employees' leave status
export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString(), 10);
    const empCode = searchParams.get('empCode'); // Optional: filter by employee

    // Build query
    const query = { year };
    if (empCode) {
      query.empCode = empCode;
    }

    // Get all paid leave records for the year
    const paidLeaves = await PaidLeave.find(query)
      .lean()
      .maxTimeMS(3000);

    // If filtering by empCode and no record exists, create one
    if (empCode && paidLeaves.length === 0) {
      const paidLeave = await PaidLeave.getOrCreate(empCode, year);
      return successResponse(
        { paidLeaves: [paidLeave] },
        'Leave status retrieved successfully',
        HTTP_STATUS.OK
      );
    }

    // Get employee details for each paid leave record
    const empCodes = paidLeaves.map(pl => pl.empCode);
    const employees = await Employee.find({ empCode: { $in: empCodes } })
      .select('empCode name department designation')
      .lean()
      .maxTimeMS(3000);

    const employeeMap = new Map();
    employees.forEach(emp => {
      employeeMap.set(emp.empCode, emp);
    });

    // Enrich paid leave records with employee details
    const enrichedLeaves = paidLeaves.map(pl => {
      const emp = employeeMap.get(pl.empCode);
      return {
        ...pl,
        employeeName: emp?.name || '',
        department: emp?.department || '',
        designation: emp?.designation || '',
        // Calculate virtuals
        totalLeavesAllocated: (pl.casualLeavesAllocated || 0) + (pl.annualLeavesAllocated || 0),
        totalLeavesTaken: (pl.casualLeavesTaken || 0) + (pl.annualLeavesTaken || 0),
        totalLeavesRemaining: ((pl.casualLeavesAllocated || 0) + (pl.annualLeavesAllocated || 0)) - ((pl.casualLeavesTaken || 0) + (pl.annualLeavesTaken || 0)),
        casualLeavesRemaining: (pl.casualLeavesAllocated || 0) - (pl.casualLeavesTaken || 0),
        annualLeavesRemaining: (pl.annualLeavesAllocated || 0) - (pl.annualLeavesTaken || 0),
      };
    });

    return successResponse(
      { paidLeaves: enrichedLeaves, year },
      'Leave status retrieved successfully',
      HTTP_STATUS.OK
    );
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}

// POST /api/hr/leaves - Mark employee on paid leave
export async function POST(req) {
  try {
    await connectDB();

    const body = await req.json();
    const { empCode, date, leaveType, reason, markedBy } = body;

    // Validation
    if (!empCode || !date || !leaveType) {
      throw new ValidationError('empCode, date, and leaveType are required');
    }

    if (!['casual', 'annual'].includes(leaveType)) {
      throw new ValidationError('leaveType must be "casual" or "annual"');
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      throw new ValidationError('date must be in YYYY-MM-DD format');
    }

    // Get year from date
    const year = parseInt(date.split('-')[0], 10);

    // Check if employee exists
    const employee = await Employee.findOne({ empCode })
      .select('empCode name')
      .lean()
      .maxTimeMS(2000);

    if (!employee) {
      throw new NotFoundError(`Employee ${empCode}`);
    }

    // Check if leave record already exists for this date
    const existingLeave = await LeaveRecord.findOne({ empCode, date })
      .lean()
      .maxTimeMS(2000);

    if (existingLeave) {
      throw new ValidationError(`Leave already marked for employee ${empCode} on ${date}`);
    }

    // Get or create paid leave record for the year
    const paidLeave = await PaidLeave.getOrCreate(empCode, year);

    // Check if employee has remaining leaves of the requested type
    const leavesRemaining = leaveType === 'casual' 
      ? paidLeave.casualLeavesRemaining 
      : paidLeave.annualLeavesRemaining;

    if (leavesRemaining <= 0) {
      throw new ValidationError(`Employee ${empCode} has no remaining ${leaveType} leaves`);
    }

    // Create leave record
    const leaveRecord = await LeaveRecord.create({
      empCode,
      date,
      leaveType,
      reason: reason || '',
      markedBy: markedBy || 'HR',
    });

    // Update paid leave counter
    if (leaveType === 'casual') {
      paidLeave.casualLeavesTaken += 1;
    } else {
      paidLeave.annualLeavesTaken += 1;
    }
    await paidLeave.save();

    // Update ShiftAttendance record if it exists
    await ShiftAttendance.findOneAndUpdate(
      { empCode, date },
      {
        $set: {
          attendanceStatus: 'Paid Leave',
          leaveType: leaveType,
          reason: reason || `Paid ${leaveType} leave`,
        },
      },
      { upsert: true, new: true }
    );

    return successResponse(
      {
        leaveRecord,
        paidLeave: {
          ...paidLeave.toObject(),
          totalLeavesAllocated: paidLeave.totalLeavesAllocated,
          totalLeavesTaken: paidLeave.totalLeavesTaken,
          totalLeavesRemaining: paidLeave.totalLeavesRemaining,
          casualLeavesRemaining: paidLeave.casualLeavesRemaining,
          annualLeavesRemaining: paidLeave.annualLeavesRemaining,
        },
      },
      'Leave marked successfully',
      HTTP_STATUS.CREATED
    );
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}

// DELETE /api/hr/leaves - Remove/Unmark a leave
export async function DELETE(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const empCode = searchParams.get('empCode');
    const date = searchParams.get('date');

    if (!empCode || !date) {
      throw new ValidationError('empCode and date are required');
    }

    // Find and delete leave record
    const leaveRecord = await LeaveRecord.findOneAndDelete({ empCode, date });

    if (!leaveRecord) {
      throw new NotFoundError('Leave record not found');
    }

    // Get year from date
    const year = parseInt(date.split('-')[0], 10);

    // Update paid leave counter (decrement)
    const paidLeave = await PaidLeave.findOne({ empCode, year });

    if (paidLeave) {
      if (leaveRecord.leaveType === 'casual' && paidLeave.casualLeavesTaken > 0) {
        paidLeave.casualLeavesTaken -= 1;
      } else if (leaveRecord.leaveType === 'annual' && paidLeave.annualLeavesTaken > 0) {
        paidLeave.annualLeavesTaken -= 1;
      }
      await paidLeave.save();
    }

    // Update ShiftAttendance record (remove leave type)
    await ShiftAttendance.findOneAndUpdate(
      { empCode, date },
      {
        $unset: { leaveType: '' },
        $set: {
          attendanceStatus: 'Absent', // Revert to absent if no other status
        },
      }
    );

    return successResponse(
      { leaveRecord },
      'Leave removed successfully',
      HTTP_STATUS.OK
    );
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}
