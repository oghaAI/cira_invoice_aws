#!/usr/bin/env node

/**
 * Complete API Workflow Test
 *
 * This script tests the full pipeline:
 * 1. Create a job with PDF URL
 * 2. Poll job status until completed
 * 3. Retrieve OCR results
 * 4. Retrieve final extracted results
 */

const https = require('https');

// Configuration - Set these from your deployment outputs
const API_BASE_URL = process.env.API_BASE_URL || 'https://your-api-gateway-url.execute-api.us-east-1.amazonaws.com/dev';
const API_KEY = process.env.API_KEY || 'your-api-key';
const TEST_PDF_URL = process.env.TEST_PDF_URL || 'https://example.com/sample-invoice.pdf';

// Utility function to make HTTP requests
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'X-Api-Key': API_KEY,
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    const req = https.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsedData = JSON.parse(data);
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsedData
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          });
        }
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

// Utility function to sleep
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🚀 Starting Complete API Workflow Test');
  console.log('=====================================\n');

  try {
    // Step 1: Health Check
    console.log('1️⃣ Testing API Health...');
    const health = await makeRequest(`${API_BASE_URL}/`);
    console.log(`   Status: ${health.statusCode}`);
    console.log(`   Response: ${JSON.stringify(health.body, null, 2)}`);

    if (health.statusCode !== 200) {
      throw new Error('Health check failed');
    }
    console.log('   ✅ API is healthy\n');

    // Step 2: Create Job
    console.log('2️⃣ Creating Job...');
    const createJob = await makeRequest(`${API_BASE_URL}/jobs`, {
      method: 'POST',
      body: { pdf_url: TEST_PDF_URL }
    });

    console.log(`   Status: ${createJob.statusCode}`);
    console.log(`   Response: ${JSON.stringify(createJob.body, null, 2)}`);

    if (createJob.statusCode !== 201) {
      throw new Error('Job creation failed');
    }

    const jobId = createJob.body.job_id;
    console.log(`   ✅ Job created: ${jobId}\n`);

    // Step 3: Poll Job Status
    console.log('3️⃣ Polling Job Status...');
    let jobStatus = 'queued';
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max

    while (jobStatus !== 'completed' && jobStatus !== 'failed' && attempts < maxAttempts) {
      await sleep(5000); // Wait 5 seconds
      attempts++;

      const status = await makeRequest(`${API_BASE_URL}/jobs/${jobId}/status`);
      console.log(`   Attempt ${attempts}: ${status.statusCode} - ${JSON.stringify(status.body)}`);

      if (status.statusCode === 200) {
        jobStatus = status.body.status;
        if (status.body.phase) {
          console.log(`   Phase: ${status.body.phase_label}`);
        }
      }
    }

    if (jobStatus === 'failed') {
      throw new Error('Job processing failed');
    }

    if (jobStatus !== 'completed') {
      throw new Error('Job did not complete within timeout');
    }

    console.log('   ✅ Job completed successfully\n');

    // Step 4: Get Job Details
    console.log('4️⃣ Getting Job Details...');
    const jobDetails = await makeRequest(`${API_BASE_URL}/jobs/${jobId}`);
    console.log(`   Status: ${jobDetails.statusCode}`);
    console.log(`   Response: ${JSON.stringify(jobDetails.body, null, 2)}`);
    console.log('   ✅ Job details retrieved\n');

    // Step 5: Get OCR Results
    console.log('5️⃣ Getting OCR Results...');
    const ocrResults = await makeRequest(`${API_BASE_URL}/jobs/${jobId}/ocr`);
    console.log(`   Status: ${ocrResults.statusCode}`);
    if (ocrResults.statusCode === 200) {
      const textLength = ocrResults.body.raw_ocr_text?.length || 0;
      console.log(`   OCR Provider: ${ocrResults.body.provider}`);
      console.log(`   Duration: ${ocrResults.body.duration_ms}ms`);
      console.log(`   Pages: ${ocrResults.body.pages}`);
      console.log(`   Text Length: ${textLength} characters`);
      console.log(`   First 200 chars: "${ocrResults.body.raw_ocr_text?.substring(0, 200)}..."`);
    } else {
      console.log(`   Error: ${JSON.stringify(ocrResults.body, null, 2)}`);
    }
    console.log('   ✅ OCR results retrieved\n');

    // Step 6: Get Final Results (NEW ENDPOINT!)
    console.log('6️⃣ Getting Final Extracted Results...');
    const finalResults = await makeRequest(`${API_BASE_URL}/jobs/${jobId}/result`);
    console.log(`   Status: ${finalResults.statusCode}`);

    if (finalResults.statusCode === 200) {
      console.log(`   Job ID: ${finalResults.body.job_id}`);
      console.log(`   Confidence Score: ${finalResults.body.confidence_score}`);
      console.log(`   Tokens Used: ${finalResults.body.tokens_used}`);
      console.log(`   Extracted Data: ${JSON.stringify(finalResults.body.extracted_data, null, 2)}`);

      const markdownLength = finalResults.body.raw_ocr_markdown?.length || 0;
      console.log(`   OCR Markdown Length: ${markdownLength} characters`);
      if (markdownLength > 0) {
        console.log(`   OCR Markdown Preview: "${finalResults.body.raw_ocr_markdown.substring(0, 200)}..."`);
      }
    } else {
      console.log(`   Error: ${JSON.stringify(finalResults.body, null, 2)}`);
    }
    console.log('   ✅ Final results retrieved\n');

    console.log('🎉 Complete API Workflow Test PASSED!');
    console.log('=====================================');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { makeRequest };