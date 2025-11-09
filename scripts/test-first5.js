#!/usr/bin/env node

/**
 * Test First 5 Invoices
 *
 * Modified version of batch-test-invoices.js to test with first 5 invoices
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Configuration
const API_ENDPOINT = process.env.API_ENDPOINT || 'https://nldl5jl1x6.execute-api.us-east-1.amazonaws.com/dev';
const API_KEY = process.env.API_KEY || 'Mwaf64Bevy7Jl7ynOtsCK2St9GHpqHbya3Ct2HVs';
const INPUT_CSV = path.join(__dirname, '../verifications/community/test_first5.csv');
const OUTPUT_DIR = path.join(__dirname, '../verifications/community');
const OUTPUT_FILES = {
  general: path.join(OUTPUT_DIR, 'results_general.csv'),
  insurance: path.join(OUTPUT_DIR, 'results_insurance.csv'),
  utility: path.join(OUTPUT_DIR, 'results_utility.csv'),
  tax: path.join(OUTPUT_DIR, 'results_tax.csv')
};
const CONCURRENCY = parseInt(process.argv.find(arg => arg.startsWith('--concurrency'))?.split('=')[1] || '3');
const TIMEOUT_MS = parseInt(process.argv.find(arg => arg.startsWith('--timeout'))?.split('=')[1] || '300000'); // 5 minutes
const POLL_INTERVAL_MS = 2000; // 2 seconds

// Stats tracking
const stats = {
  total: 0,
  skipped: 0,
  completed: 0,
  failed: 0,
  timeout: 0,
  startTime: Date.now()
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

    const { status, result } = response.data;

    if (status === 'llm_completed' || status === 'completed') {
      return { status, result };
    } else if (status === 'failed') {
      throw new Error(`Job failed: ${result?.error || 'Unknown error'}`);
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  return { status: 'timeout' };
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
 * Flatten extracted data to CSV columns
 */
function flattenResult(wfJobId, pdfUrl, jobResult) {
  const flattened = {
    WF_JOB_ID: wfJobId,
    PDF_URL: pdfUrl,
    STATUS: 'completed',
    INVOICE_TYPE: '',
    ERROR: ''
  };

  // Result endpoint returns extracted_data directly
  if (jobResult.extracted_data) {
    const data = jobResult.extracted_data;

    // Extract invoice type
    if (data.invoice_type?.value) {
      flattened.INVOICE_TYPE = data.invoice_type.value;
    }

    // Extract all fields (only values, not confidence/reason_code)
    const fieldNames = [
      'invoice_date', 'invoice_due_date', 'invoice_number', 'account_number',
      'vendor_name', 'community_name', 'invoice_total', 'amount_due',
      'payment_remittance_address', 'payment_remittance_email', 'payment_remittance_phone',
      'policy_start_date', 'policy_end_date', 'policy_number',
      'service_start_date', 'service_end_date', 'service_termination',
      'tax_year', 'property_id', 'valid_input'
    ];

    fieldNames.forEach(fieldName => {
      const fieldData = data[fieldName];
      flattened[fieldName] = fieldData?.value ?? '';
    });
  } else if (jobResult.error) {
    flattened.ERROR = jobResult.error;
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
    STATUS: 'pending'
  };

  try {
    console.log(`[${wfJobId}] Submitting job...`);
    const jobId = await submitJob(pdfUrl);
    console.log(`[${wfJobId}] Job created: ${jobId}, polling...`);

    const jobResult = await pollJobStatus(jobId, TIMEOUT_MS);

    if (jobResult.status === 'llm_completed' || jobResult.status === 'completed') {
      const fullResult = await getJobResult(jobId);
      const flattenedResult = flattenResult(wfJobId, pdfUrl, fullResult);
      Object.assign(result, flattenedResult);

      // Store raw JSON
      result.RAW_EXTRACTION = JSON.stringify(fullResult);

      console.log(`[${wfJobId}] ✅ Completed (${result.INVOICE_TYPE})`);
      stats.completed++;
    } else if (jobResult.status === 'timeout') {
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
 * Load existing results from all CSV files to skip already-processed invoices
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
    const columns = new Set();
    typeResults.forEach(result => {
      Object.keys(result).forEach(key => {
        if (key !== '_raw') columns.add(key);
      });
    });

    const columnNames = Array.from(columns);

    // Build CSV rows for new results
    const newRows = typeResults.map(result => {
      return columnNames.map(col => {
        const value = result[col] ?? '';
        // Escape quotes, replace actual newlines with space
        const escaped = String(value).replace(/\n/g, ' ').replace(/\r/g, '').replace(/"/g, '""');
        return escaped.includes(',') || escaped.includes('"')
          ? `"${escaped}"`
          : escaped;
      }).join(',');
    });

    // Combine header, existing rows, and new rows
    const header = columnNames.map(col => `"${col}"`).join(',');
    const csv = [header, ...existingRows, ...newRows].join('\n');

    fs.writeFileSync(outputFile, csv, 'utf8');
    console.log(`\n✅ ${typeResults.length} ${type} results written to ${path.basename(outputFile)}`);
  });
}

/**
 * Process jobs with concurrency control
 */
async function processWithConcurrency(jobs, concurrency) {
  const results = [];
  const queue = [...jobs];
  const inProgress = new Set();

  return new Promise((resolve) => {
    const processNext = async () => {
      // Start new jobs up to concurrency limit
      while (queue.length > 0 && inProgress.size < concurrency) {
        const job = queue.shift();
        inProgress.add(job.wfJobId);

        processInvoice(job.wfJobId, job.pdfUrl)
          .then(result => {
            results.push(result);
            inProgress.delete(job.wfJobId);
            processNext();
          })
          .catch(error => {
            console.error(`[${job.wfJobId}] Fatal error:`, error);
            results.push({
              WF_JOB_ID: job.wfJobId,
              PDF_URL: job.pdfUrl,
              STATUS: 'error',
              ERROR: error.message
            });
            stats.failed++;
            inProgress.delete(job.wfJobId);
            processNext();
          });
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
  console.log('=== Testing First 5 Invoices ===\n');
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
  const jobs = allJobs.filter(job => !existingResults.has(job.wfJobId));

  stats.skipped = allJobs.length - jobs.length;
  stats.total = jobs.length;

  console.log(`📋 Total invoices in input: ${allJobs.length}`);
  if (stats.skipped > 0) {
    console.log(`⏭️  Skipped (already processed): ${stats.skipped}`);
  }
  console.log(`🔄 To process: ${jobs.length}\n`);

  if (jobs.length === 0) {
    console.log('✅ All invoices already processed! Nothing to do.');
    return;
  }

  // Process all jobs
  const newResults = await processWithConcurrency(jobs, CONCURRENCY);

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
}

// Run
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
