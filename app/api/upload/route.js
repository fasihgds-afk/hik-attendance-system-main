import { createWriteStream } from 'fs';
import { mkdir, stat } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { successResponse, errorResponse, errorResponseFromException } from '../../../lib/api/response';
import { requireAuth } from '../../../lib/auth/requireAuth';
import { ValidationError } from '../../../lib/errors/errorHandler';
import { rateLimiters } from '../../../lib/middleware/rateLimit';

export const dynamic = 'force-dynamic';
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const SAFE_EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

function hasMagicBytes(buffer, mimeType) {
  if (!buffer || buffer.length < 12) return false;
  if (mimeType === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8;
  if (mimeType === 'image/png') {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }
  if (mimeType === 'image/webp') {
    return buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP';
  }
  return false;
}

async function ensureDir(dirPath) {
  try {
    const s = await stat(dirPath);
    if (!s.isDirectory()) throw new Error('Not a directory');
  } catch {
    await mkdir(dirPath, { recursive: true });
  }
}

export async function POST(req) {
  const rateLimitResponse = await rateLimiters.write(req);
  if (rateLimitResponse) return rateLimitResponse;
  try {
    await requireAuth(); // HR or Employee can upload (profile photos)
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      throw new ValidationError('No file uploaded');
    }

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'employees');
    await ensureDir(uploadsDir);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length === 0) {
      throw new ValidationError('Empty file upload is not allowed');
    }
    if (buffer.length > MAX_UPLOAD_BYTES) {
      throw new ValidationError('File too large. Maximum size is 5MB');
    }

    const mimeType = String(file.type || '').toLowerCase();
    if (!ALLOWED_MIME.has(mimeType)) {
      throw new ValidationError('Unsupported file type. Use JPG, PNG, or WEBP');
    }
    if (!hasMagicBytes(buffer, mimeType)) {
      throw new ValidationError('Invalid file signature');
    }

    const ext = SAFE_EXT_BY_MIME[mimeType] || '.bin';
    const fileName = `${randomUUID()}${ext}`;
    const filePath = path.join(uploadsDir, fileName);

    await new Promise((resolve, reject) => {
      const stream = createWriteStream(filePath);
      stream.on('finish', resolve);
      stream.on('error', reject);
      stream.end(buffer);
    });

    // Frontend will store this in Employee.photoUrl
    const publicPath = `/uploads/employees/${fileName}`;

    return successResponse({ url: publicPath }, 'File uploaded successfully', 201);
  } catch (err) {
    if (err?.code === 'UNAUTHORIZED') return errorResponse('Unauthorized', 401);
    return errorResponseFromException(err, req);
  }
}
