#!/usr/bin/env node

/**
 * Batch Invoice Testing Script
 *
 * Processes a CSV of invoice URLs through the invoice extraction pipeline
 * and generates a comprehensive results CSV with all extracted fields.
 *
 * Usage:
 *   node scripts/batch-test-invoices.js [--type community] [--concurrency 3] [--timeout 300000] [--limit 0]
 *
 * Input:  verifications/{type}/{type}_list.csv
 * Output: verifications/{type}/results_*.csv (split by invoice type)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Configuration
const API_ENDPOINT = process.env.API_ENDPOINT || 'https://nldl5jl1x6.execute-api.us-east-1.amazonaws.com/dev';
const API_KEY = process.env.API_KEY || 'Mwaf64Bevy7Jl7ynOtsCK2St9GHpqHbya3Ct2HVs';
const TYPE = process.argv.find(arg => arg.startsWith('--type'))?.split('=')[1] || 'community';
const INPUT_CSV = path.join(__dirname, `../verifications/${TYPE}/${TYPE}_list.csv`);
const OUTPUT_DIR = path.join(__dirname, `../verifications/${TYPE}`);
const OUTPUT_FILES = {
  general: path.join(OUTPUT_DIR, 'results_general.csv'),
  insurance: path.join(OUTPUT_DIR, 'results_insurance.csv'),
  utility: path.join(OUTPUT_DIR, 'results_utility.csv'),
  tax: path.join(OUTPUT_DIR, 'results_tax.csv')
};
const LOG_DIR = path.join(__dirname, '../run_logs');
const LOG_FILE = path.join(LOG_DIR, 'batch_runs.md');
const CONCURRENCY = parseInt(process.argv.find(arg => arg.startsWith('--concurrency'))?.split('=')[1] || '3');
const TIMEOUT_MS = parseInt(process.argv.find(arg => arg.startsWith('--timeout'))?.split('=')[1] || '300000'); // 5 minutes
const LIMIT = parseInt(process.argv.find(arg => arg.startsWith('--limit'))?.split('=')[1] || '0'); // 0 = no limit
const POLL_INTERVAL_MS = 2000; // 2 seconds

// Stats tracking
const stats = {
  total: 0,
  skipped: 0,
  completed: 0,
  failed: 0,
  timeout: 0,
  startTime: Date.now(),
  jobDetails: [] // Array to store job execution details
};

/**
 * Make HTTP request with promise wrapper
 */
function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;

    const req = protocol.request(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      ...options
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch (err) {
          resolve({ status: res.statusCode, data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Submit job to API
 */
async function submitJob(pdfUrl) {
  const response = await request(`${API_ENDPOINT}/jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': API_KEY
    }
  }, { pdf_url: pdfUrl });

  if (response.status !== 201) {
    throw new Error(`Failed to create job: ${response.status} ${JSON.stringify(response.data)}`);
  }

  return response.data.job_id;
}

/**
 * Poll job status until complete or timeout
 */
async function pollJobStatus(jobId, timeoutMs) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const response = await request(`${API_ENDPOINT}/jobs/${jobId}/status`, {
      headers: {
        'X-Api-Key': API_KEY
      }
    });

    if (response.status !== 200) {
      throw new Error(`Failed to get status: ${response.status}`);
    }

    const status = response.data.status;

    if (status === 'completed' || status === 'llm_completed') {
      return 'completed';
    }

    if (status === 'failed' || status.includes('error')) {
      return 'failed';
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  return 'timeout';
}

/**
 * Get job result
 */
async function getJobResult(jobId) {
  const response = await request(`${API_ENDPOINT}/jobs/${jobId}/result`, {
    headers: {
      'X-Api-Key': API_KEY
    }
  });

  if (response.status !== 200) {
    throw new Error(`Failed to get result: ${response.status}`);
  }

  return response.data;
}

/**
 * Flatten extraction result for CSV (only values, not confidence/reason_code)
 */
function flattenResult(extractedData) {
  const flattened = {};

  for (const [fieldName, fieldData] of Object.entries(extractedData || {})) {
    if (fieldData && typeof fieldData === 'object' && 'value' in fieldData) {
      flattened[fieldName] = fieldData.value ?? '';
    }
  }

  return flattened;
}

/**
 * Process single invoice
 */
async function processInvoice(wfJobId, pdfUrl) {
  const result = {
    WF_JOB_ID: wfJobId,
    PDF_URL: pdfUrl,
    JOB_ID: null,
    STATUS: null,
    INVOICE_TYPE: null,
    ERROR: null,
    RAW_EXTRACTION: null
  };

  try {
    console.log(`[${wfJobId}] Submitting job...`);
    result.JOB_ID = await submitJob(pdfUrl);

    console.log(`[${wfJobId}] Polling status (job: ${result.JOB_ID})...`);
    result.STATUS = await pollJobStatus(result.JOB_ID, TIMEOUT_MS);

    if (result.STATUS === 'completed') {
      console.log(`[${wfJobId}] Fetching results...`);
      const jobResult = await getJobResult(result.JOB_ID);

      // Extract invoice type
      const invoiceTypeField = jobResult.extracted_data?.invoice_type;
      result.INVOICE_TYPE = invoiceTypeField?.value || 'unknown';

      // Flatten all extracted fields
      const flattened = flattenResult(jobResult.extracted_data);
      Object.assign(result, flattened);

      // Store raw JSON
      result.RAW_EXTRACTION = JSON.stringify(jobResult);

      console.log(`[${wfJobId}] ✅ Completed (${result.INVOICE_TYPE})`);
      stats.completed++;
    } else if (result.STATUS === 'timeout') {
      console.log(`[${wfJobId}] ⏱️  Timeout`);
      stats.timeout++;
    } else {
      console.log(`[${wfJobId}] ❌ Failed`);
      stats.failed++;
    }
  } catch (error) {
    result.STATUS = 'error';
    result.ERROR = error.message;
    console.log(`[${wfJobId}] ❌ Error: ${error.message}`);
    stats.failed++;
  }

  // Track job details for logging
  stats.jobDetails.push({
    wfJobId,
    pdfUrl,
    jobId: result.JOB_ID,
    status: result.STATUS,
    invoiceType: result.INVOICE_TYPE,
    error: result.ERROR
  });

  return result;
}

/**
 * Parse CSV input
 */
function parseInputCSV() {
  const content = fs.readFileSync(INPUT_CSV, 'utf8');
  const lines = content.split('\n').filter(line => line.trim());

  // Skip header, remove BOM if present
  const rows = lines.slice(1).map(line => {
    const [wfJobId, pdfUrl] = line.split(',');
    return {
      wfJobId: wfJobId.replace(/^\uFEFF/, '').trim(),
      pdfUrl: pdfUrl.trim()
    };
  }).filter(row => row.wfJobId && row.pdfUrl);

  return rows;
}

/**
 * Load existing results to skip already-processed invoices
 */
function loadExistingResults() {
  const processedIds = new Set();

  // Check all invoice type CSV files
  Object.values(OUTPUT_FILES).forEach(filePath => {
    if (!fs.existsSync(filePath)) return;

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());

      // Skip header and extract WF_JOB_IDs
      lines.slice(1).forEach(line => {
        const firstComma = line.indexOf(',');
        if (firstComma > 0) {
          const wfJobId = line.substring(0, firstComma).replace(/"/g, '').trim();
          if (wfJobId) {
            processedIds.add(wfJobId);
          }
        }
      });
    } catch (error) {
      console.warn(`Warning: Could not load ${filePath}: ${error.message}`);
    }
  });

  return processedIds;
}

/**
 * Write results to separate CSV files by invoice type
 */
function writeResultsCSV(results) {
  if (results.length === 0) {
    console.error('No results to write');
    return;
  }

  // Group results by invoice type
  const resultsByType = {
    general: [],
    insurance: [],
    utility: [],
    tax: []
  };

  results.forEach(result => {
    const invoiceType = result.INVOICE_TYPE || 'general';
    if (resultsByType[invoiceType]) {
      resultsByType[invoiceType].push(result);
    } else {
      resultsByType.general.push(result); // Default to general if unknown type
    }
  });

  // Write each type to its own file
  Object.keys(resultsByType).forEach(type => {
    const typeResults = resultsByType[type];
    if (typeResults.length === 0) return;

    const outputFile = OUTPUT_FILES[type];

    // Load existing results for this type
    let existingRows = [];
    if (fs.existsSync(outputFile)) {
      try {
        const content = fs.readFileSync(outputFile, 'utf8');
        const lines = content.split('\n');
        existingRows = lines.slice(1).filter(line => line.trim()); // Skip header
      } catch (error) {
        console.warn(`Warning: Could not load existing ${outputFile}: ${error.message}`);
      }
    }

    // Get all unique column names
    const allColumns = new Set();
    typeResults.forEach(result => {
      Object.keys(result).filter(k => k !== '_raw').forEach(key => allColumns.add(key));
    });

    const columns = Array.from(allColumns);

    // Build CSV rows for new results
    const newRows = typeResults.map(result => {
      return columns.map(col => {
        let value = result[col] ?? '';
        // Escape CSV values
        if (typeof value === 'string') {
          value = value.replace(/\n/g, ' ').replace(/\r/g, '').replace(/"/g, '""');
          if (value.includes(',') || value.includes('"')) {
            value = `"${value}"`;
          }
        }
        return value;
      }).join(',');
    });

    // Combine header, existing rows, and new rows
    const csvLines = [columns.join(','), ...existingRows, ...newRows];
    fs.writeFileSync(outputFile, csvLines.join('\n'));
    console.log(`\n✅ ${typeResults.length} ${type} results written to ${path.basename(outputFile)}`);
  });
}

/**
 * Write run log to markdown file
 */
function writeRunLog() {
  // Ensure log directory exists
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString();
  const duration = ((Date.now() - stats.startTime) / 1000).toFixed(1);

  // Build log entry
  const logEntry = `
---

## Run: ${timestamp}

**Configuration:**
- Concurrency: ${CONCURRENCY}
- Timeout: ${TIMEOUT_MS}ms
- Limit: ${LIMIT > 0 ? LIMIT : 'No limit'}

**Summary:**
- Total in input: ${stats.total + stats.skipped}
- Skipped (already processed): ${stats.skipped}
- Processed: ${stats.total}
- ✅ Completed: ${stats.completed}
- ❌ Failed: ${stats.failed}
- ⏱️ Timeout: ${stats.timeout}
- Duration: ${duration}s
- Success Rate: ${stats.total > 0 ? ((stats.completed / stats.total) * 100).toFixed(1) : 0}%

**Job Details:**

| WF_JOB_ID | Job ID | Status | Invoice Type | Error |
|-----------|--------|--------|--------------|-------|
${stats.jobDetails.map(job => {
  const shortJobId = job.jobId ? job.jobId.substring(0, 8) + '...' : 'N/A';
  const status = job.status === 'completed' ? '✅ completed' :
                 job.status === 'timeout' ? '⏱️ timeout' :
                 job.status === 'failed' ? '❌ failed' :
                 '❌ error';
  const invoiceType = job.invoiceType || '-';
  const error = job.error ? job.error.substring(0, 50) + '...' : '-';
  return `| ${job.wfJobId} | ${shortJobId} | ${status} | ${invoiceType} | ${error} |`;
}).join('\n')}

`;

  // Append to log file (or create if doesn't exist)
  if (fs.existsSync(LOG_FILE)) {
    fs.appendFileSync(LOG_FILE, logEntry, 'utf8');
  } else {
    const header = `# Batch Invoice Processing Run Logs\n\nThis file contains detailed logs of all batch processing runs.\n`;
    fs.writeFileSync(LOG_FILE, header + logEntry, 'utf8');
  }

  console.log(`\n📋 Run log written to: ${path.relative(process.cwd(), LOG_FILE)}`);
}

/**
 * Process jobs with concurrency control
 */
async function processWithConcurrency(jobs, concurrency) {
  const results = [];
  const queue = [...jobs];
  const inProgress = new Set();

  return new Promise((resolve) => {
    const processNext = () => {
      // Start new jobs up to concurrency limit
      while (inProgress.size < concurrency && queue.length > 0) {
        const job = queue.shift();
        const promise = processInvoice(job.wfJobId, job.pdfUrl)
          .then(result => {
            results.push(result);
            inProgress.delete(promise);
            processNext();
          });
        inProgress.add(promise);
      }

      // Done when queue is empty and no jobs in progress
      if (queue.length === 0 && inProgress.size === 0) {
        resolve(results);
      }
    };

    processNext();
  });
}

/**
 * Main execution
 */
async function main() {
  console.log('=== Batch Invoice Testing ===\n');
  console.log(`Type: ${TYPE}`);
  console.log(`API Endpoint: ${API_ENDPOINT}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log(`Timeout: ${TIMEOUT_MS}ms`);
  console.log(`Input: ${INPUT_CSV}`);
  console.log(`Output Dir: ${OUTPUT_DIR}\n`);

  // Load existing results to skip already-processed invoices
  const existingResults = loadExistingResults();
  if (existingResults.size > 0) {
    console.log(`📂 Found ${existingResults.size} already-processed invoices (will skip)\n`);
  }

  // Parse input and filter out already-processed
  const allJobs = parseInputCSV();
  let jobs = allJobs.filter(job => !existingResults.has(job.wfJobId));

  // Apply limit if specified
  if (LIMIT > 0 && jobs.length > LIMIT) {
    jobs = jobs.slice(0, LIMIT);
  }

  stats.skipped = allJobs.length - jobs.length;
  stats.total = jobs.length;

  console.log(`📋 Total invoices in input: ${allJobs.length}`);
  if (stats.skipped > 0) {
    console.log(`⏭️  Skipped (already processed): ${stats.skipped}`);
  }
  if (LIMIT > 0) {
    console.log(`🔢 Limit: ${LIMIT}`);
  }
  console.log(`🔄 To process: ${jobs.length}\n`);

  if (jobs.length === 0) {
    console.log('✅ All invoices already processed! Nothing to do.');
    return;
  }

  // Process all jobs
  const newResults = await processWithConcurrency(jobs, CONCURRENCY);

  // Load existing results and append new ones
  let allResults = [];
  if (existingResults.size > 0) {
    try {
      const content = fs.readFileSync(OUTPUT_CSV, 'utf8');
      const lines = content.split('\n');

      // Parse existing results (skip header)
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;

        // Simple CSV parsing (assuming first column is WF_JOB_ID)
        const firstComma = lines[i].indexOf(',');
        const wfJobId = lines[i].substring(0, firstComma).replace(/"/g, '').trim();

        // Create a mock result object to preserve existing data
        allResults.push({ _raw: lines[i], WF_JOB_ID: wfJobId });
      }
    } catch (error) {
      console.warn(`Warning: Could not load existing results for merging: ${error.message}`);
    }
  }

  // Write results (grouped by invoice type)
  writeResultsCSV(newResults);

  // Print summary
  const duration = ((Date.now() - stats.startTime) / 1000).toFixed(1);
  console.log('\n=== Summary ===');
  console.log(`Total in input: ${allJobs.length}`);
  if (stats.skipped > 0) {
    console.log(`⏭️  Skipped: ${stats.skipped}`);
  }
  console.log(`🔄 Processed: ${stats.total}`);
  console.log(`✅ Completed: ${stats.completed}`);
  console.log(`❌ Failed: ${stats.failed}`);
  console.log(`⏱️  Timeout: ${stats.timeout}`);
  console.log(`⏱️  Duration: ${duration}s`);
  if (stats.total > 0) {
    console.log(`📊 Success Rate: ${((stats.completed / stats.total) * 100).toFixed(1)}%`);
  }

  // Write run log
  writeRunLog();
}

// Run
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
