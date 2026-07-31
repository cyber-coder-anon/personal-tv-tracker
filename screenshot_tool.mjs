import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

// HOW TO USE THIS SCRIPT:
// 1. Run your dev server: npm run dev
// 2. Open a new terminal and run: node screenshot_tool.mjs <URL> <OUTPUT_FILENAME>
// Example: node screenshot_tool.mjs http://localhost:5173/shows screenshots/my_shows.jpg

const args = process.argv.slice(2);
const url = args[0] || 'http://localhost:5173';
const outputName = args[1] || 'screenshot.jpg';

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const screenshotsDir = path.join(process.cwd(), 'screenshots');

if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir);
}

async function main() {
    console.log(`Launching headless browser to capture: ${url}`);
    const browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: "new"
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    try {
        console.log("Navigating and waiting for content to load...");
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
        
        // Wait an extra 2 seconds for any animations or images to finish loading
        await new Promise(r => setTimeout(r, 2000));
        
        const outputPath = path.join(screenshotsDir, outputName);
        
        // Taking the screenshot. Puppeteer strips most metadata naturally.
        await page.screenshot({ 
            path: outputPath, 
            type: outputName.endsWith('.png') ? 'png' : 'jpeg',
            quality: outputName.endsWith('.png') ? undefined : 90,
            fullPage: false 
        });
        console.log(`\n✅ Success! Clean, metadata-free screenshot saved to:\n${outputPath}`);
    } catch(e) {
        console.error("❌ Error capturing screenshot:", e.message);
    }

    await browser.close();
}

main().catch(console.error);
