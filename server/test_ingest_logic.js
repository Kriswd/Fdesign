
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMPLATE_ID = '7e4e20ec991aa9dd';
const BASE_URL = 'http://localhost:3001';
const MANIFEST_PATH = path.resolve(__dirname, `../output/templates/${TEMPLATE_ID}/manifest.json`);

async function runTest() {
  console.log('Reading manifest...');
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('Manifest not found:', MANIFEST_PATH);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const variables = manifest.variables;

  // Pick a text variable to modify
  const targetVar = variables.find(v => v.varType === 'text');
  if (!targetVar) {
    console.error('No text variable found in manifest');
    process.exit(1);
  }

  console.log(`Targeting variable: ${targetVar.name} (ID: ${targetVar.id})`);
  
  const values = {
    [targetVar.id]: 'TEST_VALUE_' + Date.now()
  };

  console.log('Sending export request...');
  try {
    const response = await fetch(`${BASE_URL}/api/template/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateId: TEMPLATE_ID,
        values,
        variables, // SENDING FULL VARIABLES
        format: 'png'
      })
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Export failed:', response.status, text);
      // Don't exit here, still check job.json in case it was created
    } else {
      const result = await response.json();
      console.log('Export successful response:', result);
    }

  } catch (err) {
    console.log('Request finished (or timed out), checking artifacts anyway...');
    if (err.cause && err.cause.code === 'UND_ERR_HEADERS_TIMEOUT') {
        console.log('Timeout expected (server is running Photoshop), proceeding to check job.json');
    } else {
        console.error('Request error:', err);
    }
  }

  // Wait a bit for file system to sync
  await new Promise(r => setTimeout(r, 2000));

  // Verify job.json
  console.log('Verifying job.json...');
  // We need to find the latest job.json in exports
  const exportsDir = path.resolve(__dirname, `../output/templates/${TEMPLATE_ID}/exports`);
  if (!fs.existsSync(exportsDir)) {
      console.error('Exports dir not found');
      process.exit(1);
  }
  
  const files = fs.readdirSync(exportsDir);
  const jobFiles = files.filter(f => f.startsWith('job_') && f.endsWith('.json'));
  jobFiles.sort(); // simple sort by timestamp in name
  const latestJobFile = jobFiles[jobFiles.length - 1];
  
  if (!latestJobFile) {
    console.error('No job file found in exports');
    process.exit(1);
  }

  const jobPath = path.join(exportsDir, latestJobFile);
  console.log('Checking job file:', jobPath);
  const job = JSON.parse(fs.readFileSync(jobPath, 'utf8'));

  const update = job.updates.find(u => u.name === targetVar.name);
  if (!update) {
    console.error('FAILED: Update not found in job.json');
    console.log('Updates found:', job.updates.map(u => u.name));
  } else {
    console.log('PASSED: Update found in job.json');
    console.log('Expected Value:', values[targetVar.id]);
    console.log('Actual Value:', update.value);
    if (update.value === values[targetVar.id]) {
      console.log('PASSED: Value matches');
    } else {
      console.error('FAILED: Value mismatch');
    }
  }
}

runTest();
