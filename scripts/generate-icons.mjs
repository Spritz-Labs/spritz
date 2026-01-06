import sharp from "sharp";
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, "../public/icons");

// Read the SVG
const svgBuffer = readFileSync(join(iconsDir, "icon.svg"));

// Icon sizes to generate
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

// Generate PWA icons
for (const size of sizes) {
    await sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toFile(join(iconsDir, `icon-${size}x${size}.png`));
    console.log(`Generated icon-${size}x${size}.png`);
}

// Generate apple-touch-icon (180x180)
await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(join(iconsDir, "apple-touch-icon.png"));
console.log("Generated apple-touch-icon.png");

// Generate favicons
await sharp(svgBuffer)
    .resize(16, 16)
    .png()
    .toFile(join(iconsDir, "favicon-16x16.png"));
console.log("Generated favicon-16x16.png");

await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toFile(join(iconsDir, "favicon-32x32.png"));
console.log("Generated favicon-32x32.png");

console.log("All icons generated successfully!");








