// Renders the app icons from the planner's logo (two rising bars over a baseline) with headless Chromium.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const out = process.argv[2] || 'app/icons';
fs.mkdirSync(out, { recursive: true });
const ACC = '#0b6b5c', INK = '#ffffff';
const glyph = (s) => `<g transform="translate(20 20) scale(${s}) translate(-20 -21.6)">
  <path d="M11 27 V17 a4 4 0 0 1 8 0 V27" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
  <path d="M21 27 V13 a4 4 0 0 1 8 0 V27" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" opacity="0.78"/>
  <path d="M9 30.5 H31" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/></g>`;
const variants = {
  // macOS-style icon: rounded square with a margin, transparent corners
  'icon-512.png': [512, `<rect x="3.6" y="3.6" width="32.8" height="32.8" rx="7.4" fill="${ACC}"/>${glyph(0.86)}`],
  'icon-192.png': [192, `<rect x="3.6" y="3.6" width="32.8" height="32.8" rx="7.4" fill="${ACC}"/>${glyph(0.86)}`],
  // full-bleed versions: the system adds its own rounded mask
  'maskable-512.png': [512, `<rect width="40" height="40" fill="${ACC}"/>${glyph(0.72)}`],
  'apple-touch-icon.png': [180, `<rect width="40" height="40" fill="${ACC}"/>${glyph(0.92)}`],
  'favicon-32.png': [32, `<rect x="1" y="1" width="38" height="38" rx="10" fill="${ACC}"/>${glyph(1)}`],
};
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  for (const [name, [size, body]] of Object.entries(variants)) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 40 40">${body}</svg></body></html>`);
    await page.screenshot({ path: path.join(out, name), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  }
  await browser.close();
  console.log('icons written to', out);
})();
