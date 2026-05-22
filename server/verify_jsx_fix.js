
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const vbsPath = path.resolve(__dirname, 'photoshop/run_job.vbs');
const jsxPath = path.resolve(__dirname, 'photoshop/render_export.jsx');
// Use the job file from the failed test run, assuming it exists
const jobPath = path.resolve(__dirname, '../output/templates/7e4e20ec991aa9dd/exports/job_1768559180830.json');

async function run() {
  console.log('Running VBS script...');
  try {
    const { stdout, stderr } = await execFileAsync('cscript.exe', ['//Nologo', vbsPath, jsxPath, jobPath], {
        timeout: 60000
    });
    console.log('STDOUT:', stdout);
    console.error('STDERR:', stderr);
  } catch (err) {
    console.error('Command failed:', err.message);
    if (err.stdout) console.log('STDOUT:', err.stdout);
    if (err.stderr) console.error('STDERR:', err.stderr);
  }
}

run();
