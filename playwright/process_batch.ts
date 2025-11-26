import fs from 'fs';
import path from 'path';
import { chromium } from 'patchright';
import { runComplaint } from './automation';

// npx ts-node process_batch.ts

// Configuration
const SOURCE_DIR = path.resolve(__dirname, 'media/ondeck');
const SUBMITTED_DIR = path.resolve(__dirname, 'media/submitted');

// Ensure submitted directory exists
if (!fs.existsSync(SUBMITTED_DIR)) {
    fs.mkdirSync(SUBMITTED_DIR, { recursive: true });
}

async function processBatch() {
    console.log(`Scanning for images in: ${SOURCE_DIR}`);

    if (!fs.existsSync(SOURCE_DIR)) {
        console.error(`Source directory not found: ${SOURCE_DIR}`);
        process.exit(1);
    }

    const files = fs.readdirSync(SOURCE_DIR)
        .filter(f => /\.(jpe?g)$/i.test(f))
        .sort(); // Sort to process in order

    console.log(`Found ${files.length} images to process.`);

    // Launch Patchright browser (Chrome channel)
    const browser = await chromium.launch({
        channel: 'chrome',
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox'] // Optional args
    });

    try {
        for (const file of files) {
            const fullPath = path.join(SOURCE_DIR, file);
            console.log(`\n--------------------------------------------------`);
            console.log(`Processing: ${file}`);
            console.log(`--------------------------------------------------\n`);

            const context = await browser.newContext({
                viewport: null, // Let browser decide or maximize
            });
            const page = await context.newPage();

            try {
                await runComplaint(page, fullPath);

                // If we get here, the function completed (meaning user resumed after pause)
                console.log(`\n[SUCCESS] Submission completed for ${file}`);

                // Move to submitted folder
                const destPath = path.join(SUBMITTED_DIR, file);
                fs.renameSync(fullPath, destPath);
                console.log(`Moved to: ${destPath}`);

                // Random delay between 1 and 3 seconds to mimic human pace
                const delaySeconds = Math.floor(Math.random() * (3 - 1 + 1)) + 1;
                console.log(`Waiting ${delaySeconds} seconds before next submission...`);
                await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));

            } catch (error) {
                console.error(`\n[FAILURE] Failed to process ${file}`);
                console.error(error);

                // Stop processing on failure to let user investigate
                console.log('Stopping batch processing due to error.');
                await context.close();
                await browser.close();
                process.exit(1);
            }

            await context.close();
        }
    } finally {
        await browser.close();
    }

    console.log(`\nAll images processed!`);
}

processBatch().catch(console.error);
