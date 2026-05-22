import CleanupService from '../server/services/cleanupService.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputRoot = path.join(__dirname, '../output');

async function run() {
  console.log('--- Manual Cleanup Started ---');
  console.log(`Target Output Root: ${outputRoot}`);

  const service = new CleanupService({ outputRoot });
  
  // Clean up templates older than 1 day (24 hours) to be safe
  // This preserves work currently being done but removes accumulated junk
  const expiryDays = 1; 
  
  console.log(`\nExecuting cleanup for temporary templates older than ${expiryDays} day(s)...`);
  
  try {
    await service.cleanupExpiredTemplates(expiryDays);
    console.log('\n--- Cleanup Finished Successfully ---');
  } catch (err) {
    console.error('\n!!! Cleanup Failed !!!', err);
    process.exit(1);
  }
}

run();
