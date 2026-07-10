import { chromium } from 'playwright';

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5175';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});

const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, hasTouch: true });
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.waitForSelector('#intro:not(.is-hidden)');
await page.waitForTimeout(900);
await page.locator('#enter-button').click();
await page.waitForTimeout(600);

for (const id of ['princess', 'huashi', 'coast']) {
  await page.locator('#map-button').click();
  await page.locator(`.map-pin[data-target="${id}"]`).click();
  await page.waitForTimeout(550);
  await page.screenshot({ path: `/tmp/badaguan-${id}-current.png`, fullPage: true });
}

await page.close();

const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  hasTouch: true,
  isMobile: true,
});
mobile.on('pageerror', (error) => errors.push(`mobile: ${error.message}`));
await mobile.goto(baseUrl, { waitUntil: 'networkidle' });
await mobile.waitForSelector('#intro:not(.is-hidden)');
await mobile.waitForTimeout(900);
await mobile.screenshot({ path: '/tmp/badaguan-mobile-intro-current.png', fullPage: true });
await mobile.locator('#enter-button').click();
await mobile.waitForTimeout(1350);
await mobile.screenshot({ path: '/tmp/badaguan-mobile-walk-current.png', fullPage: true });

console.log(JSON.stringify({ errors }, null, 2));
await browser.close();
if (errors.length) process.exitCode = 1;
