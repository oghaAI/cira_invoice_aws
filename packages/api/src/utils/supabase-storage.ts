/**
 * Supabase Storage Utility
 *
 * Provides utilities for downloading PDFs and uploading them to Supabase Storage.
 * Used as a fallback when Mistral OCR fails with "Could not determine document type" error.
 */

import { StorageClient } from '@supabase/storage-js';

/**
 * Parsed Supabase configuration from DATABASE_URL
 */
interface SupabaseConfig {
  projectUrl: string;
  serviceKey: string;
}

/**
 * Parse Supabase configuration from DATABASE_URL environment variable.
 *
 * DATABASE_URL format:
 * postgresql://postgres.{project-ref}:{password}@aws-0-{region}.pooler.supabase.com:6543/postgres
 *
 * Extracts project URL as: https://{project-ref}.supabase.co
 *
 * @returns Supabase configuration with project URL
 * @throws Error if DATABASE_URL is not set or SUPABASE_SERVICE_KEY is not set
 */
function parseSupabaseConfig(): SupabaseConfig {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const serviceKey = process.env['SUPABASE_SERVICE_KEY'];
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_KEY environment variable is not set for storage access');
  }

  // Extract project reference from DATABASE_URL
  // Format: postgresql://postgres.{project-ref}:...
  const match = databaseUrl.match(/postgres\.([a-zA-Z0-9]+):/);
  if (!match || !match[1]) {
    throw new Error('Could not extract Supabase project reference from DATABASE_URL');
  }

  const projectRef = match[1];
  const projectUrl = `https://${projectRef}.supabase.co`;

  return {
    projectUrl,
    serviceKey
  };
}

/**
 * Get Supabase Storage client instance.
 *
 * @returns StorageClient configured for the project
 */
export function getSupabaseStorageClient(): StorageClient {
  const config = parseSupabaseConfig();

  return new StorageClient(`${config.projectUrl}/storage/v1`, {
    apikey: config.serviceKey,
    Authorization: `Bearer ${config.serviceKey}`
  });
}

/**
 * Validate that a buffer contains a valid PDF by checking magic bytes.
 *
 * @param buffer - Buffer to validate
 * @returns true if buffer starts with PDF magic bytes (%PDF-)
 */
function isValidPdf(buffer: Buffer): boolean {
  if (buffer.length < 5) return false;
  const header = buffer.slice(0, 5).toString('ascii');
  return header === '%PDF-';
}

/**
 * Download PDF from a URL.
 *
 * @param url - URL of the PDF to download
 * @returns Object containing the PDF buffer and extracted filename
 * @throws Error if download fails or response is not OK
 */
export async function downloadPdf(url: string): Promise<{ buffer: Buffer; filename: string }> {
  console.log(JSON.stringify({ event: 'pdf_download_start', url }));

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download PDF: HTTP ${response.status} ${response.statusText}`);
  }

  // Verify content type
  const contentType = response.headers.get('content-type');
  const contentEncoding = response.headers.get('content-encoding');
  console.log(JSON.stringify({
    event: 'pdf_download_headers',
    contentType,
    contentEncoding,
    contentLength: response.headers.get('content-length'),
    contentDisposition: response.headers.get('content-disposition')
  }));

  if (contentType && !contentType.includes('application/pdf') && !contentType.includes('application/octet-stream')) {
    throw new Error(`Invalid content type: ${contentType}. Expected application/pdf`);
  }

  // Note: fetch() automatically handles gzip/deflate decompression when Content-Encoding is set.
  // However, some servers (like CiraNet) may compress the PDF but not set Content-Encoding header.
  // In that case, we need to manually decompress.
  const arrayBuffer = await response.arrayBuffer();
  let buffer = Buffer.from(arrayBuffer);

  console.log(JSON.stringify({
    event: 'pdf_download_complete',
    bufferSize: buffer.length,
    firstBytes: buffer.slice(0, 10).toString('hex'),
    contentEncoding
  }));

  // Check if buffer is gzip-compressed (magic bytes: 1f 8b)
  const isGzipped = buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
  if (isGzipped) {
    console.log(JSON.stringify({ event: 'pdf_decompressing_gzip' }));
    try {
      const { gunzipSync } = await import('zlib');
      buffer = gunzipSync(buffer);
      console.log(JSON.stringify({
        event: 'pdf_decompressed',
        decompressedSize: buffer.length,
        firstBytes: buffer.slice(0, 10).toString('hex')
      }));
    } catch (decompressErr) {
      throw new Error(`Failed to decompress gzipped PDF: ${decompressErr instanceof Error ? decompressErr.message : String(decompressErr)}`);
    }
  }

  // Validate PDF magic bytes - if not at start, try to find and extract
  if (!isValidPdf(buffer)) {
    // Search for PDF magic bytes within the buffer (some servers add headers/wrappers)
    const pdfMarker = Buffer.from('%PDF-', 'ascii');
    const pdfStartIndex = buffer.indexOf(pdfMarker);

    if (pdfStartIndex > 0 && pdfStartIndex < 1000) {
      // Found PDF marker within first 1KB - extract from there
      console.log(JSON.stringify({
        event: 'pdf_header_stripped',
        pdfStartIndex,
        headerBytes: buffer.slice(0, pdfStartIndex).toString('hex')
      }));
      buffer = buffer.slice(pdfStartIndex);

      // Verify extraction worked
      if (!isValidPdf(buffer)) {
        throw new Error('PDF extraction failed after finding %PDF- marker');
      }
    } else if (pdfStartIndex === -1) {
      // No PDF marker found at all
      const preview = buffer.slice(0, 100).toString('utf8', 0, Math.min(100, buffer.length));
      throw new Error(`No PDF marker found in file. First bytes: ${preview}`);
    } else {
      // PDF marker found but too far into the file (suspicious)
      throw new Error(`PDF marker found at unusual offset: ${pdfStartIndex} bytes`);
    }
  }

  // Extract filename from URL or Content-Disposition header
  let filename = 'document.pdf';

  // Try Content-Disposition header first
  const contentDisposition = response.headers.get('content-disposition');
  if (contentDisposition) {
    const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    if (filenameMatch && filenameMatch[1]) {
      filename = filenameMatch[1].replace(/['"]/g, '');
    }
  }

  // Fallback to URL path
  if (filename === 'document.pdf') {
    try {
      const urlObj = new URL(url);
      const pathSegments = urlObj.pathname.split('/');
      const lastSegment = pathSegments[pathSegments.length - 1];
      if (lastSegment && lastSegment.length > 0) {
        // Sanitize filename - keep only alphanumeric, dots, hyphens, underscores
        filename = lastSegment.replace(/[^a-zA-Z0-9._-]/g, '_');
        // Ensure it has .pdf extension
        if (!filename.toLowerCase().endsWith('.pdf')) {
          filename = `${filename}.pdf`;
        }
      }
    } catch {
      // If URL parsing fails, keep default filename
    }
  }

  return { buffer, filename };
}

/**
 * Upload PDF buffer to Supabase Storage.
 *
 * @param buffer - PDF file buffer
 * @param filename - Name to use for the uploaded file
 * @param bucketName - Supabase storage bucket name (default: 'pdf_files')
 * @returns Public URL of the uploaded file
 * @throws Error if upload fails
 */
export async function uploadToSupabase(
  buffer: Buffer,
  filename: string,
  bucketName: string = process.env['SUPABASE_STORAGE_BUCKET'] || 'pdf_files'
): Promise<string> {
  const client = getSupabaseStorageClient();
  const config = parseSupabaseConfig();

  // Generate unique filename to avoid collisions
  const timestamp = Date.now();
  const uniqueFilename = `${timestamp}_${filename}`;

  console.log(JSON.stringify({
    event: 'supabase_upload_start',
    filename: uniqueFilename,
    bucketName,
    bufferSize: buffer.length
  }));

  // Upload file
  const { data, error } = await client.from(bucketName).upload(uniqueFilename, buffer, {
    contentType: 'application/pdf',
    upsert: false
  });

  if (error) {
    throw new Error(`Failed to upload to Supabase: ${error.message}`);
  }

  if (!data || !data.path) {
    throw new Error('Upload succeeded but no path was returned');
  }

  // Construct public URL
  const publicUrl = `${config.projectUrl}/storage/v1/object/public/${bucketName}/${data.path}`;

  console.log(JSON.stringify({
    event: 'supabase_upload_complete',
    publicUrl,
    path: data.path
  }));

  // Verify the uploaded file is accessible
  try {
    const verifyResponse = await fetch(publicUrl, { method: 'HEAD' });
    console.log(JSON.stringify({
      event: 'supabase_url_verification',
      url: publicUrl,
      status: verifyResponse.status,
      contentType: verifyResponse.headers.get('content-type'),
      contentLength: verifyResponse.headers.get('content-length'),
      accessible: verifyResponse.ok
    }));

    if (!verifyResponse.ok) {
      throw new Error(`Uploaded file not accessible: HTTP ${verifyResponse.status}`);
    }
  } catch (verifyError) {
    console.error(JSON.stringify({
      event: 'supabase_url_verification_failed',
      error: verifyError instanceof Error ? verifyError.message : String(verifyError)
    }));
    // Don't throw - let Mistral fail with better error
  }

  return publicUrl;
}

/**
 * Download PDF from URL and upload to Supabase Storage.
 *
 * Convenience function that combines downloadPdf and uploadToSupabase.
 *
 * @param pdfUrl - Original PDF URL
 * @param bucketName - Supabase storage bucket name (default: 'pdf_files')
 * @returns Public URL of the uploaded file in Supabase
 * @throws Error if download or upload fails
 */
export async function downloadAndUploadToSupabase(
  pdfUrl: string,
  bucketName?: string
): Promise<string> {
  // Download PDF
  const { buffer, filename } = await downloadPdf(pdfUrl);

  // Upload to Supabase
  const supabaseUrl = await uploadToSupabase(buffer, filename, bucketName);

  return supabaseUrl;
}
