/**
 * app/api/upload/route.ts — Next.js API Route for local file staging.
 *
 * SECURITY HARDENING (production-ready):
 *  - Filenames are sanitized: path separators stripped, dangerous chars removed,
 *    length capped — prevents path traversal attacks.
 *  - Files are written to /tmp/uploads/ (NOT public/) so they are never
 *    directly web-accessible to anonymous users.
 *  - File size is enforced (100 MB max per file).
 *  - Only allowed MIME types are accepted.
 *  - Basic authentication check is performed.
 *
 * NOTE: This route is used for local staging only. The primary analysis flow
 * sends files directly to the FastAPI backend via /api/v1/analyze.
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// ── Configuration ──────────────────────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff',
  'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/flac',
  'audio/mp4', 'audio/aac', 'audio/webm',
  'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm',
  'video/mpeg', 'video/x-matroska', 'video/ogg',
]);

// Maximum length of the sanitized filename
const MAX_FILENAME_LENGTH = 200;

// ── Filename sanitization ──────────────────────────────────────────────────────

/**
 * Sanitize an uploaded filename to prevent path traversal and injection.
 * - Strips directory components (e.g. "../../etc/passwd" → "passwd")
 * - Replaces characters outside [A-Za-z0-9._-] with underscores
 * - Caps length at MAX_FILENAME_LENGTH
 * - Falls back to "upload" if the result is empty
 */
function sanitizeFilename(rawName: string): string {
  // Strip all path separators — take only the last segment
  const base = rawName.replace(/\\/g, '/').split('/').pop() ?? 'upload';
  // Replace dangerous characters
  const safe = base.replace(/[^A-Za-z0-9._\- ]/g, '_').trim().replace(/^\.+/, '');
  // Truncate and fall back
  const truncated = safe.slice(0, MAX_FILENAME_LENGTH);
  return truncated || 'upload';
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // ── Authentication check ─────────────────────────────────────────────────
    // Verify the user has a session token stored by the auth service.
    // This is a lightweight guard — the FastAPI backend performs full Firebase
    // token verification on the actual /api/v1/analyze call.
    const authToken = req.cookies.get('omniface_auth_token')?.value
      ?? req.headers.get('x-auth-token');

    if (!authToken) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const formData = await req.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No files provided.' },
        { status: 400 }
      );
    }

    // ── Write to tmp/uploads/ — NOT to public/ ───────────────────────────────
    // Files in public/ are web-accessible without authentication.
    // tmp/ is outside the web root and only accessible server-side.
    const uploadDir = path.join(process.cwd(), 'tmp', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const uploadedNames: string[] = [];

    for (const file of files) {
      // ── File size check ────────────────────────────────────────────────────
      if (file.size === 0) {
        return NextResponse.json(
          { success: false, error: 'Uploaded file is empty.' },
          { status: 400 }
        );
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
          { success: false, error: `File "${file.name}" exceeds the 100 MB size limit.` },
          { status: 413 }
        );
      }

      // ── MIME type check ────────────────────────────────────────────────────
      const mimeType = file.type || 'application/octet-stream';
      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        return NextResponse.json(
          { success: false, error: `File type "${mimeType}" is not supported.` },
          { status: 415 }
        );
      }

      // ── Sanitize filename ──────────────────────────────────────────────────
      const safeName = sanitizeFilename(file.name);

      // ── Write file ─────────────────────────────────────────────────────────
      const buffer = Buffer.from(await file.arrayBuffer());
      const destPath = path.join(uploadDir, safeName);
      fs.writeFileSync(destPath, buffer);
      uploadedNames.push(safeName);
    }

    return NextResponse.json({
      success: true,
      files: uploadedNames, // Return sanitized names only — never original attacker-controlled names
      message: 'Files staged successfully',
    });

  } catch (error: unknown) {
    // Never expose internal error details to clients
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[upload route] Error:', message);
    return NextResponse.json(
      { success: false, error: 'Upload failed. Please try again.' },
      { status: 500 }
    );
  }
}
