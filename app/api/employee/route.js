// app/api/employee/route.js
import { connectDB } from '../../../lib/db';
import Employee from '../../../models/Employee';
import { buildEmployeeFilter, getEmployeeProjection } from '../../../lib/db/queryOptimizer';
import { NotFoundError, ValidationError } from '../../../lib/errors/errorHandler';
import { validateEmployee } from '../../../lib/validations/employee';
import { successResponse, errorResponseFromException, HTTP_STATUS } from '../../../lib/api/response';

// OPTIMIZATION: Node.js runtime for better connection pooling
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 30; // Cache for 30 seconds for faster responses
export const fetchCache = 'default';

// Helper function to convert ObjectId shift to shift code
async function normalizeShiftField(shiftValue) {
  if (!shiftValue) return '';
  
  const shiftString = String(shiftValue).trim();
  if (!shiftString) return '';
  
  // Check if shift is an ObjectId (24 hex characters)
  if (/^[0-9a-fA-F]{24}$/.test(shiftString)) {
    // Import Shift model to look up shift code
    const Shift = (await import('../../../models/Shift')).default;
    const shiftDoc = await Shift.findById(shiftString).lean();
    
    if (shiftDoc && shiftDoc.code) {
      return shiftDoc.code;
    }
    // ObjectId doesn't match any shift, return empty
    return '';
  }
  
  // Shift is already a code, normalize to uppercase
  return shiftString.toUpperCase();
}

// GET /api/employee
// - /api/employee?empCode=943425  -> single employee { employee: {...} }
// - /api/employee                  -> list { items: [...] }
export async function GET(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const empCode = searchParams.get('empCode');
    
    // Employee API Query params

    // If empCode is provided → return single employee (used by employee dashboard)
    if (empCode) {
      // OPTIMIZATION: Use Mongoose with .select() and .lean(), add timeout
      // OPTIMIZATION: Skip shift normalization for faster response - shift is already normalized in most cases
      const projection = getEmployeeProjection(true);
      const employee = await Employee.findOne({ empCode })
        .select(projection)
        .lean()
        .maxTimeMS(1500); // Reduced timeout for faster response
      
      if (!employee) {
        throw new NotFoundError(`Employee ${empCode}`);
      }
      
      // OPTIMIZATION: Only normalize shift if it's an ObjectId (skip if already a code)
      if (employee.shift) {
        const shiftString = String(employee.shift).trim();
        // Only do lookup if it's an ObjectId (24 hex characters)
        if (/^[0-9a-fA-F]{24}$/.test(shiftString)) {
          // It's an ObjectId - need to look up shift code
          const Shift = (await import('../../../models/Shift')).default;
          const shiftDoc = await Shift.findById(shiftString)
            .select('code')
            .lean()
            .maxTimeMS(1000); // Fast timeout for shift lookup
          
          if (shiftDoc && shiftDoc.code) {
            employee.shift = shiftDoc.code;
          } else {
            employee.shift = '';
          }
        } else {
          // Already a code - just normalize to uppercase
          employee.shift = shiftString.toUpperCase();
        }
      }
      
      return successResponse(
        { employee },
        'Employee retrieved successfully',
        HTTP_STATUS.OK
      );
    }

    // Otherwise → return list with pagination (used by admin/HR UI)
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const search = (searchParams.get('search') || '').trim();
    let shift = (searchParams.get('shift') || '').trim();
    const department = (searchParams.get('department') || '').trim();
    
    // Normalize "All Shifts" - empty string means all shifts
    if (shift === 'All Shifts' || shift === 'all shifts') {
      shift = '';
    }

    // Build filter
    const { filter, sortOptions } = buildEmployeeFilter({ search, shift, department });
    const skip = (page - 1) * limit;
    
    // Use direct Mongoose queries instead of aggregation for simplicity and reliability
    // Aggregation can have issues in serverless environments
    const queryFilter = Object.keys(filter).length > 0 ? filter : {};
    
    // OPTIMIZATION: Use empCode index for sorting (faster than department+empCode compound)
    const optimizedSort = sortOptions || { empCode: 1 };
    
    // OPTIMIZATION: Minimal projection for list view - exclude heavy fields
    // Exclude profileImageUrl (can be large), cnic (not needed for list), phoneNumber (not needed)
    const listProjection = {
      _id: 1,
      empCode: 1,
      name: 1,
      email: 1,
      monthlySalary: 1,
      shift: 1,
      shiftId: 1,
      department: 1,
      designation: 1,
      saturdayGroup: 1,
      // Excluded: profileImageUrl, cnic, phoneNumber, createdAt, updatedAt
    };
    
    // OPTIMIZATION: Run find query first, then count only if needed
    // For first page without filters, we can estimate total to save time
    const employees = await Employee.find(queryFilter)
      .select(listProjection)
      .sort(optimizedSort)
      .skip(skip)
      .limit(limit)
      .lean()
      .maxTimeMS(2000) // Further reduced timeout
      .exec();
    
    // OPTIMIZATION: Only count if we need exact total (pagination beyond page 1 or with filters)
    const needsExactCount = page > 1 || search || shift || department;
    let total;
    
    if (needsExactCount) {
      total = await Employee.countDocuments(queryFilter)
        .maxTimeMS(1500) // Further reduced timeout
        .exec();
    } else {
      // Estimate: if we got full page, assume there are more; otherwise use actual count
      total = employees.length === limit ? limit * 10 : employees.length;
    }
    
    // OPTIMIZATION: Fast shift normalization - skip lookup if shift is already a code
    // Most employees have shift codes (not ObjectIds), so we can skip the lookup in most cases
    let shiftObjectIds = new Set();
    let needsShiftLookup = false;
    
    // First pass: normalize codes and collect ObjectIds
    for (const emp of employees) {
      if (emp.shift) {
        const shiftString = String(emp.shift).trim();
        // Check if it's an ObjectId (24 hex characters)
        if (/^[0-9a-fA-F]{24}$/.test(shiftString)) {
          shiftObjectIds.add(shiftString);
          needsShiftLookup = true;
        } else {
          // Already a code - normalize to uppercase immediately (most common case)
          emp.shift = shiftString.toUpperCase();
        }
      }
    }
    
    // OPTIMIZATION: Only do shift lookup if we have ObjectIds (rare case)
    if (needsShiftLookup && shiftObjectIds.size > 0) {
      const Shift = (await import('../../../models/Shift')).default;
      const shifts = await Shift.find({ 
        _id: { $in: Array.from(shiftObjectIds) } 
      })
        .select('_id code')
        .lean()
        .maxTimeMS(1000); // Very fast timeout - this should be rare
      
      // Build map for fast lookup
      const shiftMap = new Map();
      for (const shift of shifts) {
        shiftMap.set(shift._id.toString(), shift.code);
      }
      
      // Update only employees with ObjectId shifts
      for (const emp of employees) {
        if (emp.shift) {
          const shiftString = String(emp.shift).trim();
          if (/^[0-9a-fA-F]{24}$/.test(shiftString)) {
            emp.shift = shiftMap.get(shiftString) || '';
          }
        }
      }
    }
    
    if (process.env.NODE_ENV === 'development') {
      // Employee API Query result
    }

    return successResponse(
      { items: employees || [] },
      'Employees retrieved successfully',
      HTTP_STATUS.OK,
      {
        pagination: {
          page,
          limit,
          total: total || 0,
          totalPages: Math.ceil((total || 0) / limit),
        },
      }
    );
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}

// POST /api/employee  -> create / update (upsert)
export async function POST(req) {
  try {
    await connectDB();

    const body = await req.json();
    
    // Validate input
    const validation = validateEmployee(body, true);
    if (!validation.success) {
      throw new ValidationError('Validation failed', validation.errors);
    }

    const validatedData = validation.data;
    const { empCode } = validatedData;

    if (!empCode) {
      throw new ValidationError('empCode is required');
    }

    // Build update object
    const update = {};
    Object.keys(validatedData).forEach((key) => {
      if (validatedData[key] !== undefined && key !== 'empCode') {
        update[key] = validatedData[key];
      }
    });

    if (update.monthlySalary !== undefined && update.monthlySalary !== null) {
      update.monthlySalary = Number(update.monthlySalary);
    }

    // Handle shift field: Convert ObjectId to shift code if needed
    if (update.shift) {
      const shiftValue = String(update.shift).trim();
      
      // Check if shift is an ObjectId (24 hex characters)
      if (/^[0-9a-fA-F]{24}$/.test(shiftValue)) {
        // Import Shift model to look up shift code
        const Shift = (await import('../../../models/Shift')).default;
        const shiftDoc = await Shift.findById(shiftValue).lean();
        
        if (shiftDoc && shiftDoc.code) {
          // Replace ObjectId with shift code
          update.shift = shiftDoc.code;
          // Also update shiftId if it's different
          update.shiftId = shiftDoc._id;
        } else {
          // ObjectId doesn't match any shift, clear it
          console.warn(`[Employee API] Shift ObjectId ${shiftValue} not found, clearing shift for employee ${empCode}`);
          update.shift = '';
          update.shiftId = null;
        }
      } else {
        // Shift is already a code (like 'D1', 'N1'), normalize to uppercase
        update.shift = shiftValue.toUpperCase();
        
        // Try to find and set shiftId if shift code is provided
        const Shift = (await import('../../../models/Shift')).default;
        const shiftDoc = await Shift.findOne({ code: update.shift }).lean();
        if (shiftDoc) {
          update.shiftId = shiftDoc._id;
        }
      }
    }

    // Execute update directly
    const employee = await Employee.findOneAndUpdate(
      { empCode },
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    const isNew = !employee.createdAt || new Date(employee.createdAt).getTime() > Date.now() - 1000;
    
    return successResponse(
      { employee },
      isNew ? 'Employee created successfully' : 'Employee updated successfully',
      isNew ? HTTP_STATUS.CREATED : HTTP_STATUS.OK
    );
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}

// DELETE /api/employee?empCode=XXXXX
export async function DELETE(req) {
  try {
    await connectDB();

    const { searchParams } = new URL(req.url);
    const empCode = searchParams.get('empCode');

    if (!empCode) {
      throw new ValidationError('empCode is required');
    }

    // OPTIMIZATION: Add timeout for delete operation
    const deleted = await Employee.findOneAndDelete({ empCode })
      .lean()
      .maxTimeMS(2000);

    if (!deleted) {
      throw new NotFoundError(`Employee ${empCode}`);
    }

    return successResponse(
      { employee: deleted },
      `Employee ${empCode} deleted successfully`,
      HTTP_STATUS.OK
    );
  } catch (err) {
    return errorResponseFromException(err, req);
  }
}
