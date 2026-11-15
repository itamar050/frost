// Renders flyer.html to flyer.png (2160 x 2700) and flyer.pdf with Playwright's Chromium.
//   node docs/promo/render-flyer.js
// Needs the fonts Inter Display, Inter and JetBrains Mono installed.
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const dir = __dirname;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 });
  await page.goto('file://' + path.join(dir, 'flyer.html'));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(dir, 'flyer.png') });
  await page.pdf({ path: path.join(dir, 'flyer.pdf'), width: '1080px', height: '1350px', printBackground: true,
                   pageRanges: '1' });
  await browser.close();
})();
