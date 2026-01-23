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

    // Get all paid leave records for the year (without lean to allow saving)
    const paidLeaves = await PaidLeave.find(query)
      .maxTimeMS(3000);

    // If filtering by empCode and no record exists, create one
    if (empCode && paidLeaves.length === 0) {
      const paidLeave = await PaidLeave.getOrCreate(empCode, year);
      const emp = await Employee.findOne({ empCode })
        .select('empCode name department designation')
        .lean()
        .maxTimeMS(2000);
      
      return successResponse(
        { 
          paidLeaves: [{
            ...paidLeave.toObject(),
            employeeName: emp?.name || '',
            department: emp?.department || '',
            designation: emp?.designation || '',
            totalLeavesAllocated: paidLeave.totalLeavesAllocated,
            totalLeavesTaken: paidLeave.totalLeavesTaken,
            totalLeavesRemaining: paidLeave.totalLeavesRemaining,
            casualLeavesRemaining: paidLeave.casualLeavesRemaining,
            annualLeavesRemaining: paidLeave.annualLeavesRemaining,
          }] 
        },
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

    // STEP 1: Clean up duplicate LeaveRecords FIRST (same empCode and date) - keep only the first one
    // This must happen BEFORE counting to ensure accurate counts
    console.log(`[LEAVES API] Starting duplicate cleanup for year ${year}, empCodes:`, empCodes.length);
    
    const allLeaveRecords = await LeaveRecord.find({
      empCode: { $in: empCodes },
      date: { $gte: `${year}-01-01`, $lte: `${year}-12-31` }
    })
      .sort({ createdAt: 1 })
      .lean()
      .maxTimeMS(3000);
    
    console.log(`[LEAVES API] Found ${allLeaveRecords.length} total LeaveRecords before cleanup`);
    
    // Group by empCode-date to find duplicates
    const leaveRecordsByKey = new Map();
    const duplicatesToDelete = [];
    
    allLeaveRecords.forEach(record => {
      const key = `${record.empCode}-${record.date}`;
      if (leaveRecordsByKey.has(key)) {
        // Duplicate found - mark for deletion (keep the first one)
        console.log(`[LEAVES API] Duplicate found: empCode=${record.empCode}, date=${record.date}, leaveType=${record.leaveType}, _id=${record._id}`);
        duplicatesToDelete.push(record._id);
      } else {
        leaveRecordsByKey.set(key, record);
      }
    });
    
    console.log(`[LEAVES API] Found ${duplicatesToDelete.length} duplicate records to delete`);
    
    // Delete duplicate records
    if (duplicatesToDelete.length > 0) {
      const deleteResult = await LeaveRecord.deleteMany({ _id: { $in: duplicatesToDelete } });
      console.log(`[LEAVES API] Deleted ${deleteResult.deletedCount} duplicate records`);
    }

    // STEP 2: Get ShiftAttendance records with "Paid Leave" status to validate LeaveRecords
    const paidLeaveAttendances = await ShiftAttendance.find({
      empCode: { $in: empCodes },
      date: { $gte: `${year}-01-01`, $lte: `${year}-12-31` },
      attendanceStatus: 'Paid Leave'
    })
      .select('empCode date leaveType')
      .lean()
      .maxTimeMS(3000);
    
    // Create a map of valid paid leave dates (empCode-date)
    const validPaidLeaveDates = new Set();
    paidLeaveAttendances.forEach(sa => {
      validPaidLeaveDates.add(`${sa.empCode}-${sa.date}`);
    });
    
    console.log(`[LEAVES API] Found ${paidLeaveAttendances.length} ShiftAttendance records with "Paid Leave" status`);
    
    // STEP 3: Clean up LeaveRecords that don't have matching "Paid Leave" status in ShiftAttendance
    const orphanedLeaveRecords = [];
    allLeaveRecords.forEach(record => {
      const key = `${record.empCode}-${record.date}`;
      if (!validPaidLeaveDates.has(key)) {
        orphanedLeaveRecords.push(record._id);
        console.log(`[LEAVES API] Orphaned LeaveRecord found: empCode=${record.empCode}, date=${record.date}, leaveType=${record.leaveType}`);
      }
    });
    
    if (orphanedLeaveRecords.length > 0) {
      const deleteResult = await LeaveRecord.deleteMany({ _id: { $in: orphanedLeaveRecords } });
      console.log(`[LEAVES API] Deleted ${deleteResult.deletedCount} orphaned LeaveRecords (no matching Paid Leave status)`);
    }

    // STEP 4: Get actual LeaveRecord counts AFTER cleanup (only for dates with "Paid Leave" status)
    const actualLeaveCounts = await LeaveRecord.aggregate([
      {
        $match: {
          empCode: { $in: empCodes },
          date: { $gte: `${year}-01-01`, $lte: `${year}-12-31` }
        }
      },
      {
        $group: {
          _id: { empCode: '$empCode', leaveType: '$leaveType' },
          count: { $sum: 1 }
        }
      }
    ]).option({ maxTimeMS: 3000 });

    console.log(`[LEAVES API] Actual leave counts from aggregation:`, JSON.stringify(actualLeaveCounts, null, 2));

    // Build a map of actual counts
    const actualCountsMap = new Map();
    actualLeaveCounts.forEach(item => {
      const key = `${item._id.empCode}-${item._id.leaveType}`;
      actualCountsMap.set(key, item.count);
      console.log(`[LEAVES API] Count map: ${key} = ${item.count}`);
    });

    // Enrich paid leave records with employee details and validate/correct counters
    const enrichedLeaves = await Promise.all(paidLeaves.map(async (pl) => {
      const emp = employeeMap.get(pl.empCode);
      
      // Get actual counts from LeaveRecord (after duplicate cleanup)
      const actualCasual = actualCountsMap.get(`${pl.empCode}-casual`) || 0;
      const actualAnnual = actualCountsMap.get(`${pl.empCode}-annual`) || 0;
      
      // Check if counters are out of sync and fix them
      const casualMismatch = pl.casualLeavesTaken !== actualCasual;
      const annualMismatch = pl.annualLeavesTaken !== actualAnnual;
      
      if (casualMismatch || annualMismatch) {
        // Fix the counters to match actual LeaveRecord count
        pl.casualLeavesTaken = actualCasual;
        pl.annualLeavesTaken = actualAnnual;
        await pl.save();
      }
      
      return {
        ...pl.toObject(),
        employeeName: emp?.name || '',
        department: emp?.department || '',
        designation: emp?.designation || '',
        // Calculate virtuals
        totalLeavesAllocated: pl.totalLeavesAllocated,
        totalLeavesTaken: pl.totalLeavesTaken,
        totalLeavesRemaining: pl.totalLeavesRemaining,
        casualLeavesRemaining: pl.casualLeavesRemaining,
        annualLeavesRemaining: pl.annualLeavesRemaining,
      };
    }));

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

    // Create leave record using upsert to prevent duplicates (atomic operation)
    const leaveRecord = await LeaveRecord.findOneAndUpdate(
      { empCode, date },
      {
        empCode,
        date,
        leaveType,
        reason: reason || '',
        markedBy: markedBy || 'HR',
      },
      { upsert: true, new: true }
    );

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
