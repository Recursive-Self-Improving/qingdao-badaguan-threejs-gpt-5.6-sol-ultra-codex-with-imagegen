import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const externalServer = Boolean(process.env.BASE_URL);
const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:4178';
let server = null;
if (!externalServer) {
  server = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '4178', '--strictPort'], {
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) break;
    } catch {
      // The Vite process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});

const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.waitForSelector('#intro:not(.is-hidden)', { timeout: 15_000 });
await page.waitForTimeout(950);
await page.screenshot({ path: '/tmp/badaguan-intro.png', fullPage: true });

const canvasState = await page.locator('#scene').evaluate((canvas) => ({
  width: canvas.width,
  height: canvas.height,
  webgl: Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl')),
}));

await page.locator('#enter-button').click();
await page.waitForSelector('#hud:not(.is-hidden)');
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/badaguan-walk.png', fullPage: true });

const mapYBeforeMove = await page.locator('#map-player').evaluate((element) => element.style.getPropertyValue('--y'));
await page.keyboard.down('KeyW');
await page.waitForTimeout(650);
await page.keyboard.up('KeyW');
await page.waitForTimeout(120);
const mapYAfterMove = await page.locator('#map-player').evaluate((element) => element.style.getPropertyValue('--y'));

await page.evaluate(() => document.exitPointerLock?.());
await page.waitForTimeout(250);
await page.locator('#map-button').click({ force: true });
await page.waitForSelector('#map-dialog[open]');
await page.screenshot({ path: '/tmp/badaguan-map.png', fullPage: true });

const movementWorked = mapYBeforeMove !== mapYAfterMove;
await page.close();

const tablet = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true });
tablet.on('pageerror', (error) => errors.push(`tablet pageerror: ${error.message}`));
tablet.on('console', (message) => {
  if (message.type() === 'error') errors.push(`tablet console: ${message.text()}`);
});
await tablet.goto(baseUrl, { waitUntil: 'networkidle' });
await tablet.waitForSelector('#intro:not(.is-hidden)', { timeout: 15_000 });
await tablet.locator('#enter-button').click();
await tablet.waitForTimeout(800);
const tabletControlsVisible = await tablet.locator('#joystick').evaluate((element) => {
  const containerStyle = getComputedStyle(element.closest('.touch-controls'));
  const joystickStyle = getComputedStyle(element);
  return containerStyle.display !== 'none' && joystickStyle.pointerEvents !== 'none';
});
const tabletYBefore = await tablet.locator('#map-player').evaluate((element) => element.style.getPropertyValue('--y'));
const joystickBox = await tablet.locator('#joystick').boundingBox();
await tablet.mouse.move(joystickBox.x + joystickBox.width / 2, joystickBox.y + joystickBox.height / 2);
await tablet.mouse.down();
await tablet.mouse.move(joystickBox.x + joystickBox.width / 2, joystickBox.y + 8, { steps: 4 });
await tablet.waitForTimeout(550);
await tablet.mouse.up();
const tabletYAfter = await tablet.locator('#map-player').evaluate((element) => element.style.getPropertyValue('--y'));
const tabletMovementWorked = tabletYBefore !== tabletYAfter;
await tablet.close();

console.log(JSON.stringify({
  canvasState,
  movementWorked,
  tabletControlsVisible,
  tabletMovementWorked,
  errors,
}, null, 2));
await browser.close();
server?.kill();

if (
  !canvasState.webgl || canvasState.width < 1000 || !movementWorked ||
  !tabletControlsVisible || !tabletMovementWorked || errors.length
) process.exitCode = 1;
