import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

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

    for (const file of files) {
        const fullPath = path.join(SOURCE_DIR, file);
        console.log(`\n--------------------------------------------------`);
        console.log(`Processing: ${file}`);
        console.log(`--------------------------------------------------\n`);

        try {
            await runPlaywrightTest(fullPath);

            // If we get here, the test passed (exit code 0)
            console.log(`\n[SUCCESS] Submission completed for ${file}`);

            // Move to submitted folder
            const destPath = path.join(SUBMITTED_DIR, file);
            fs.renameSync(fullPath, destPath);
            console.log(`Moved to: ${destPath}`);

        } catch (error) {
            console.error(`\n[FAILURE] Failed to process ${file}`);
            console.error(error);

            // Stop processing on failure to let user investigate
            console.log('Stopping batch processing due to error.');
            process.exit(1);
        }
    }

    console.log(`\nAll images processed!`);
}

function runPlaywrightTest(imagePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const env = { ...process.env, TARGET_IMAGE: imagePath };

        // Spawn the playwright test command
        // Using 'inherit' for stdio to let the user interact with the browser/terminal if needed
        // and to see the test output directly.
        const child = spawn('npx', ['playwright', 'test', 'tests/app.spec.ts', '--headed'], {
            env,
            stdio: 'inherit',
            cwd: __dirname // Run from the playwright directory
        });

        child.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Playwright test exited with code ${code}`));
            }
        });

        child.on('error', (err) => {
            reject(err);
        });
    });
}

processBatch().catch(console.error);
