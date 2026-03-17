// Test endpoint to check if employee query works without filters - HR only
import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import Employee from '@/models/Employee';
import { requireHR } from '@/lib/auth/requireAuth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireHR();
    await connectDB();
    
    // Simple query - no filters, no projection, just get all employees
    const allEmployees = await Employee.find({}).lean();
    const total = await Employee.countDocuments({});
    
    return NextResponse.json({
      success: true,
      total,
      count: allEmployees.length,
      sample: allEmployees.slice(0, 3).map(e => ({
        empCode: e.empCode,
        name: e.name,
        shift: e.shift,
        department: e.department,
      })),
      message: total > 0 
        ? `Found ${total} employees in database` 
        : 'No employees found in database',
    });
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED_HR') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[Employee Test API] Error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      },
      { status: 500 }
    );
  }
}

