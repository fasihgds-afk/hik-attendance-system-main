// next-app/app/api/hr/daily-attendance/route.js
import { NextResponse } from 'next/server';
import { connectDB } from '../../../../lib/db';
import AttendanceEvent from '../../../../models/AttendanceEvent';
import Employee from '../../../../models/Employee';
import ShiftAttendance from '../../../../models/ShiftAttendance';
import EmployeeShiftHistory from '../../../../models/EmployeeShiftHistory';
import Shift from '../../../../models/Shift';

export const dynamic = 'force-dynamic'; // avoid caching in dev

/**
 * Classify a punch time to a shift code using dynamic shifts from database
 * @param {Date} localDate - The punch time
 * @param {String} businessDateStr - Business date in YYYY-MM-DD format
 * @param {String} tzOffset - Timezone offset
 * @param {Array} shifts - Array of shift objects from database
 * @returns {String|null} - Shift code or null if no match
 */
function classifyByTime(localDate, businessDateStr, tzOffset, shifts) {
  if (!shifts || shifts.length === 0) return null;

  const businessStartLocal = new Date(`${businessDateStr}T00:00:00${tzOffset}`);
  const nextDayLocal = new Date(businessStartLocal);
  nextDayLocal.setDate(nextDayLocal.getDate() + 1);

  const localDateStr = localDate.toISOString().slice(0, 10);
  const nextDayStr = nextDayLocal.toISOString().slice(0, 10);

  const h = localDate.getHours();
  const m = localDate.getMinutes();
  const punchMinutes = h * 60 + m; // minutes after midnight 0–1439

  // Helper to parse HH:mm to minutes
  function parseTime(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }

  // Check each shift to see if punch time falls within its window
  for (const shift of shifts) {
    if (!shift.isActive) continue;

    const startMin = parseTime(shift.startTime);
    let endMin = parseTime(shift.endTime);

    // Handle shifts that cross midnight
    if (shift.crossesMidnight) {
      endMin += 24 * 60; // Add 24 hours for next day
    }

    // Check if punch is on business date and within shift window
    if (shift.crossesMidnight) {
      // Night shift: can start on business date and end on next day
      const isOnStartDay = localDateStr === businessDateStr && punchMinutes >= startMin;
      const isOnEndDay = localDateStr === nextDayStr && punchMinutes < (endMin % (24 * 60));
      
      if (isOnStartDay || isOnEndDay) {
        return shift.code;
      }
    } else {
      // Day shift: same day only
      if (localDateStr === businessDateStr && punchMinutes >= startMin && punchMinutes < endMin) {
        return shift.code;
      }
    }
  }

  return null;
}

export async function POST(req) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date'); // "YYYY-MM-DD"

    if (!date) {
      return NextResponse.json(
        { error: 'Missing "date" query parameter' },
        { status: 400 }
      );
    }

    await connectDB();

    const TZ = process.env.TIMEZONE_OFFSET || '+05:00';

    // Load ALL active shifts from database (for dynamic classification)
    const allShifts = await Shift.find({ isActive: true }).lean();
    
    if (allShifts.length === 0) {
      return NextResponse.json(
        { error: 'No active shifts found. Please create shifts first.' },
        { status: 400 }
      );
    }

    // Load ALL employees (we want to show present + absent)
    const allEmployees = await Employee.find().lean();

    // Pre-fetch shift history for all employees for this date
    const empCodes = allEmployees.map((e) => e.empCode);
    const shiftHistoryForDate = await EmployeeShiftHistory.find({
      empCode: { $in: empCodes },
      effectiveDate: { $lte: date },
      $or: [{ endDate: null }, { endDate: { $gte: date } }],
    })
      .sort({ effectiveDate: -1 })
      .lean();

    // Build map: empCode -> shiftCode (from history)
    const shiftMap = new Map();
    for (const history of shiftHistoryForDate) {
      if (!shiftMap.has(history.empCode)) {
        shiftMap.set(history.empCode, history.shiftCode);
      }
    }

    // Build shift code to shift object map for quick lookup
    const shiftByCode = new Map();
    for (const shift of allShifts) {
      shiftByCode.set(shift.code, shift);
    }

    // Map for quick lookup: empCode -> info
    const empInfoMap = new Map();
    for (const emp of allEmployees) {
      // Use dynamic shift from history if available, otherwise fallback to employee's shift
      const dynamicShift = shiftMap.get(emp.empCode) || emp.shift || '';
      empInfoMap.set(emp.empCode, {
        name: emp.name || '',
        shift: dynamicShift,
        department: emp.department || '',
        designation: emp.designation || '',
      });
    }

    /**
     * Calculate business day window based on dynamic shifts
     * Find earliest start time and latest end time (considering midnight crossing)
     */
    let earliestStart = 24 * 60; // Start with max value
    let latestEnd = 0; // Start with min value
    
    for (const shift of allShifts) {
      const [startH, startM] = shift.startTime.split(':').map(Number);
      const startMin = startH * 60 + startM;
      
      let [endH, endM] = shift.endTime.split(':').map(Number);
      let endMin = endH * 60 + endM;
      
      if (shift.crossesMidnight) {
        endMin += 24 * 60; // Add 24 hours for next day
      }
      
      if (startMin < earliestStart) earliestStart = startMin;
      if (endMin > latestEnd) latestEnd = endMin;
    }
    
    // Convert back to hours for date calculation
    const startHour = Math.floor(earliestStart / 60);
    const startMinute = earliestStart % 60;
    const endHour = Math.floor(latestEnd / 60);
    const endMinute = latestEnd % 60;
    
    const pad = (n) => String(n).padStart(2, '0');
    const startLocal = new Date(`${date}T${pad(startHour)}:${pad(startMinute)}:00${TZ}`);
    
    // Calculate end time - handle midnight crossing properly
    let endLocal;
    if (latestEnd >= 24 * 60) {
      // End time is on the next day (e.g., latestEnd = 1620 means 03:00 next day)
      const endHourNormalized = Math.floor((latestEnd % (24 * 60)) / 60);
      const endMinuteNormalized = latestEnd % 60;
      // Get next day date string (YYYY-MM-DD)
      const nextDay = new Date(startLocal);
      nextDay.setDate(nextDay.getDate() + 1);
      const nextDayStr = nextDay.getFullYear() + '-' + 
                         pad(nextDay.getMonth() + 1) + '-' + 
                         pad(nextDay.getDate());
      endLocal = new Date(`${nextDayStr}T${pad(endHourNormalized)}:${pad(endMinuteNormalized)}:00${TZ}`);
    } else {
      // End time is on the same day
      endLocal = new Date(`${date}T${pad(endHour)}:${pad(endMinute)}:00${TZ}`);
    }

    // Load existing ShiftAttendance records for this date (to preserve saved checkOut times)
    const existingRecords = await ShiftAttendance.find({
      date: date,
    }).lean();
    
    // Calculate next day date for night shift checkOut lookup
    const currentDateObj = new Date(`${date}T00:00:00${TZ}`);
    const nextDateObj = new Date(currentDateObj);
    nextDateObj.setDate(nextDateObj.getDate() + 1);
    const nextDateStr = nextDateObj.getFullYear() + '-' + 
                        String(nextDateObj.getMonth() + 1).padStart(2, '0') + '-' + 
                        String(nextDateObj.getDate()).padStart(2, '0');
    
    // Load existing ShiftAttendance records for next day (for night shift checkOut that occurs on next day)
    const nextDayRecords = await ShiftAttendance.find({
      date: nextDateStr,
    }).lean();
    
    // Build map: empCode -> next day record
    const nextDayByEmpCode = new Map();
    for (const record of nextDayRecords) {
      if (record.empCode) {
        nextDayByEmpCode.set(record.empCode, record);
      }
    }
    
    // Build map: empCode -> existing record (if multiple records exist for same empCode, prefer one with checkOut)
    const existingByEmpCode = new Map();
    for (const record of existingRecords) {
      const existing = existingByEmpCode.get(record.empCode);
      // If we already have a record for this empCode, prefer the one with checkOut if current doesn't have it
      if (!existing || (!existing.checkOut && record.checkOut)) {
        existingByEmpCode.set(record.empCode, record);
      }
    }

    // Fetch all successful access events in the window
    const events = await AttendanceEvent.find({
      eventTime: { $gte: startLocal, $lte: endLocal },
      minor: 38, // "valid access" events only
    }).lean();

    // Group punches by employee (only those who have events)
    const byEmp = new Map();

    for (const ev of events) {
      if (!ev.empCode) continue;

      const local = new Date(ev.eventTime);
      const timeShift = classifyByTime(local, date, TZ, allShifts); // Dynamic shift code or null

      let rec = byEmp.get(ev.empCode);
      if (!rec) {
        const info = empInfoMap.get(ev.empCode) || {};
        rec = {
          empCode: ev.empCode,
          employeeName: info.name || ev.employeeName || ev.raw?.name || '',
          assignedShift: info.shift || '',
          department: info.department || '',
          designation: info.designation || '',
          times: [],
          detectedShifts: new Set(), // Track all detected shift codes dynamically
        };
        byEmp.set(ev.empCode, rec);
      }

      rec.times.push(local);

      if (timeShift) {
        rec.detectedShifts.add(timeShift);
      }
    }

    const items = [];

    // Build one row PER EMPLOYEE (even if no punches)
    for (const emp of allEmployees) {
      const rec = byEmp.get(emp.empCode);
      const existingRecord = existingByEmpCode.get(emp.empCode);

      const times = rec?.times ? [...rec.times].sort((a, b) => a - b) : [];

      // Use checkIn from events if available, otherwise from existing record
      let checkIn = times[0] || null;
      if (!checkIn && existingRecord?.checkIn) {
        checkIn = new Date(existingRecord.checkIn);
      }

      // Determine checkOut: prefer from events if multiple punches, otherwise use existing record or next day's record
      let checkOut = null;
      if (times.length > 1) {
        // Use latest punch from events if we have multiple punches
        checkOut = times[times.length - 1];
      } else if (existingRecord && existingRecord.checkOut != null) {
        // If we have one or zero punches from events, use checkOut from existing record
        // This handles cases where checkOut event might be outside query window or missing
        // This is the key fix: even if we found checkIn from events, use existing checkOut
        // Use != null to check for both null and undefined
        checkOut = new Date(existingRecord.checkOut);
      }
      
      // ====================================================================================
      // NIGHT SHIFT CHECKOUT RETRIEVAL (for all dates going forward)
      // ====================================================================================
      // For night shifts that cross midnight: checkOut occurs on the next day
      // This logic ensures checkOut is retrieved correctly for ALL dates:
      // - Current day (e.g., Jan 1) → checkOut on next day (Jan 2)
      // - Month-end (e.g., Jan 31) → checkOut on next month (Feb 1)
      // - Year-end (e.g., Dec 31) → checkOut on next year (Jan 1)
      // 
      // The main events query should already include next day early morning events (up to latest shift end time),
      // but we also check next day's ShiftAttendance record and query events directly as a fallback
      // ====================================================================================
      if (!checkOut && checkIn) {
        // Get employee's assigned shift code
        const assignedShift = rec?.assignedShift || emp.shift || '';
        
        // Get shift object from database to check crossesMidnight property
        // This is the PRIMARY and RELIABLE way to detect night shifts (works for all shifts)
        const shiftObj = shiftByCode.get(assignedShift);
        
        // Check if this is a night shift:
        // PRIMARY: Use crossesMidnight property from shift definition (most reliable, works for all shifts)
        // This prevents incorrect matching for day shifts
        const isNightShift = shiftObj?.crossesMidnight === true;
        
        if (isNightShift) {
          // ====================================================================================
          // NIGHT SHIFT CHECKOUT RETRIEVAL FROM NEXT DAY
          // ====================================================================================
          // For night shifts that cross midnight: checkOut may be stored on the next day
          // since the shift ends on the next working day (e.g., Dec 31 shift 21:00-06:00 ends on Jan 1 at 06:00)
          // 
          // Strategy:
          // 1. First check next day's ShiftAttendance record (if it exists)
          // 2. If not found, query AttendanceEvent records directly for next day early morning
          // 3. Use time-based logic to determine if checkOut belongs to current day's shift
          // ====================================================================================
          
          // Try next day's ShiftAttendance record first
          const nextDayRecord = nextDayByEmpCode.get(emp.empCode);
          let nextDayCheckOut = null;
          
          if (nextDayRecord && nextDayRecord.checkOut) {
            try {
              nextDayCheckOut = new Date(nextDayRecord.checkOut);
              if (isNaN(nextDayCheckOut.getTime())) {
                nextDayCheckOut = null;
              }
            } catch (e) {
              nextDayCheckOut = null;
            }
          }
          
          // If not found in ShiftAttendance, query AttendanceEvent directly for next day early morning
          // This fallback ensures checkOut is retrieved correctly for ALL dates:
          // - Regular days: Jan 1 → check Jan 2, Jan 15 → check Jan 16, etc.
          // - Month-end: Jan 31 → check Feb 1, Feb 28/29 → check Mar 1, etc.
          // - Year-end: Dec 31 → check Jan 1 (next year)
          // The query uses dynamically calculated nextDateStr, so it works for any date
          if (!nextDayCheckOut) {
            try {
              // Query events from next day 00:00 to 08:00 (early morning checkOut belongs to previous night shift)
              // Using 08:00 as cutoff covers all night shift end times (N1: 03:00, N2: 06:00, etc.)
              const nextDayStartLocal = new Date(`${nextDateStr}T00:00:00${TZ}`);
              const nextDayEndLocal = new Date(`${nextDateStr}T08:00:00${TZ}`);
              
              const nextDayEvents = await AttendanceEvent.find({
                empCode: emp.empCode,
                eventTime: { $gte: nextDayStartLocal, $lte: nextDayEndLocal },
                minor: 38, // "valid access" events only
              })
              .sort({ eventTime: 1 }) // Sort by time ascending
              .limit(1) // Only need the first (earliest) event
              .lean();
              
              // Get the earliest event on next day (which is the checkOut from previous night shift)
              if (nextDayEvents.length > 0) {
                nextDayCheckOut = new Date(nextDayEvents[0].eventTime);
              }
            } catch (e) {
              // Ignore errors - will continue without checkOut
            }
          }
          
          // If we found a checkOut from next day, validate it belongs to current day's shift
          if (nextDayCheckOut && !isNaN(nextDayCheckOut.getTime())) {
            try {
              // Convert to local time for comparison
              const TZ_MS = TZ === '+05:00' ? 5 * 60 * 60 * 1000 : 0;
              const checkOutLocal = new Date(nextDayCheckOut.getTime() + TZ_MS);
              const checkOutHour = checkOutLocal.getUTCHours();
              const checkOutMin = checkOutLocal.getUTCMinutes();
              const checkOutTotalMin = checkOutHour * 60 + checkOutMin;
              
              // Check if next day has checkIn (from ShiftAttendance record if available)
              let nextDayHasCheckIn = false;
              if (nextDayRecord && nextDayRecord.checkIn != null) {
                try {
                  const nextCheckIn = new Date(nextDayRecord.checkIn);
                  if (!isNaN(nextCheckIn.getTime())) {
                    nextDayHasCheckIn = true;
                  }
                } catch (e) {
                  // Ignore errors
                }
              }
              
              // Logic to determine if next day's checkOut belongs to current day's night shift:
              // 1. If checkOut is before 08:00 → belongs to previous day's night shift (most common case)
              // 2. If next day has no checkIn → checkOut definitely belongs to previous day
              // 3. If next day has checkIn in evening (>= 18:00) and checkOut is before 08:00 → checkOut belongs to previous day
              if (checkOutTotalMin < 480 || !nextDayHasCheckIn) {
                // Case 1 & 2: checkOut before 08:00 OR no checkIn on next day
                checkOut = nextDayCheckOut;
              } else if (nextDayHasCheckIn) {
                // Case 3: Check if next day's checkIn is in evening (new shift started)
                try {
                  const nextCheckIn = new Date(nextDayRecord.checkIn);
                  if (!isNaN(nextCheckIn.getTime())) {
                    const checkInLocal = new Date(nextCheckIn.getTime() + TZ_MS);
                    const checkInHour = checkInLocal.getUTCHours();
                    
                    // If checkOut is before 08:00 and checkIn is after 18:00 (evening),
                    // then checkOut belongs to previous day's night shift
                    // (The checkIn at 18:00+ indicates a new shift started, so checkOut is from previous shift)
                    if (checkOutTotalMin < 480 && checkInHour >= 18) {
                      checkOut = nextDayCheckOut;
                    }
                  }
                } catch (e) {
                  // Ignore errors
                }
              }
            } catch (e) {
              // Ignore errors
            }
          }
        }
      }

      // Final shift decision:
      // 1) Prefer employee's assigned shift (from history or Employee.shift)
      // 2) Otherwise infer from detected punch times
      let shift = 'Unknown';
      const assignedShift = rec?.assignedShift || emp.shift || '';

      // Check if assigned shift exists in database
      if (assignedShift && shiftByCode.has(assignedShift)) {
        shift = assignedShift;
      } else if (rec?.detectedShifts && rec.detectedShifts.size > 0) {
        // Use first detected shift (or could prioritize by most punches)
        shift = Array.from(rec.detectedShifts)[0];
      }

      // Calculate total punches: count events found, but also count checkOut if it exists from existing record or next day's record
      let totalPunches = times.length;
      // If we're using checkOut from existing record or next day's record but didn't have events for it, count it
      if (totalPunches === 0 && (existingRecord?.checkIn || checkIn)) {
        totalPunches = checkOut ? 2 : (checkIn ? 1 : 0);
      } else if (totalPunches === 1 && checkOut && times.length === 1) {
        // If we have one event but also have checkOut from existing record or next day's record, count as 2
        totalPunches = 2;
      }
      
      const attendanceStatus = totalPunches > 0 ? 'Present' : 'Absent';

      items.push({
        empCode: emp.empCode,
        employeeName: emp.name || rec?.employeeName || '',
        department: emp.department || '',
        designation: emp.designation || '',
        shift,
        checkIn,
        checkOut,
        totalPunches,
        attendanceStatus,
      });
    }

    // Save snapshot into ShiftAttendance ONLY for present employees
    const presentItems = items.filter((item) => item.totalPunches > 0);

    const bulkOps = presentItems.map((item) => ({
      updateOne: {
        filter: {
          date,
          empCode: item.empCode,
          shift: item.shift,
        },
        update: {
          $set: {
            date,
            empCode: item.empCode,
            employeeName: item.employeeName,
            department: item.department || '',
            designation: item.designation || '',
            shift: item.shift,
            checkIn: item.checkIn,
            checkOut: item.checkOut || null,
            totalPunches: item.totalPunches,
            updatedAt: new Date(),
          },
        },
        upsert: true,
      },
    }));

    if (bulkOps.length > 0) {
      await ShiftAttendance.bulkWrite(bulkOps);
    }

    // Sort output: department already handled on UI,
    // here we just keep shift order & then empCode
    // Build dynamic shift order from database shifts
    const shiftOrder = new Map();
    allShifts.forEach((s, idx) => {
      shiftOrder.set(s.code, idx + 1);
    });
    shiftOrder.set('Unknown', 999);
    
    items.sort((a, b) => {
      const sa = shiftOrder.get(a.shift) ?? 999;
      const sb = shiftOrder.get(b.shift) ?? 999;
      if (sa !== sb) return sa - sb;
      return String(a.empCode).localeCompare(String(b.empCode));
    });

    return NextResponse.json({
      date,
      savedCount: presentItems.length,
      items,
    });
  } catch (err) {
    console.error('HR daily-attendance error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

