import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

// CI copies this beside a pinned temporary Playwright install; no lock changes.
const workspace = resolve(process.env.GITHUB_WORKSPACE || process.cwd());
const artifactDirectory = join(workspace, 'artifacts-smoke');
const basePath = process.env.VITE_BASE_PATH || '/-seal-odyssey/';
const appURL = new URL(basePath, 'http://127.0.0.1:4173').href;
const scenarios = [
  {
    name: 'desktop-high', expectedQuality: 'high',
    options: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, hasTouch: false, isMobile: false },
  },
  {
    name: 'touch-landscape-low', expectedQuality: 'low',
    options: {
      viewport: { width: 844, height: 390 }, deviceScaleFactor: 1,
      hasTouch: true, isMobile: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    },
  },
];
const report = {
  schemaVersion: 1, startedAt: new Date().toISOString(),
  gitSha: process.env.GITHUB_SHA || null, appURL,
  backendRequested: 'Chromium ANGLE SwiftShader',
  scope: 'Production startup, real GLSL compilation/linking, draw calls and UI interactions. No visual quality, frame-rate or real-device assertion.',
  cases: [], failures: [],
};
let preview, browser;
let previewLog = '', previewExit = null, previewError = null;
function serializeError(error) {
  return { name: error?.name || 'Error', message: String(error?.message || error), stack: error?.stack || null };
}
function appendPreviewLog(chunk) { previewLog = (previewLog + String(chunk)).slice(-80000); }
async function waitForPreview() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (previewError) throw previewError;
    if (previewExit) throw new Error('Vite preview exited before readiness: ' + JSON.stringify(previewExit));
    try {
      const response = await fetch(appURL, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch {}
    await delay(250);
  }
  throw new Error('Production preview did not become ready within 30 seconds.');
}
function installWebGLProbe() {
  const probe = {
    compiledShaders: 0, linkedPrograms: [], shaderFailures: [],
    drawCalls: 0, contextLost: false, available: typeof WebGL2RenderingContext !== 'undefined',
  };
  window.__sealSmokeWebGL = probe;
  document.addEventListener('webglcontextlost', () => { probe.contextLost = true; }, true);
  if (!probe.available) return;
  const prototype = WebGL2RenderingContext.prototype;
  const originalCompileShader = prototype.compileShader;
  prototype.compileShader = function (shader) {
    const result = originalCompileShader.call(this, shader);
    probe.compiledShaders += 1;
    if (!this.getShaderParameter(shader, this.COMPILE_STATUS)) {
      probe.shaderFailures.push({
        stage: 'compile', type: this.getShaderParameter(shader, this.SHADER_TYPE),
        log: this.getShaderInfoLog(shader) || 'Compilation failed without a driver log.',
      });
    }
    return result;
  };
  const originalLinkProgram = prototype.linkProgram;
  prototype.linkProgram = function (program) {
    const result = originalLinkProgram.call(this, program);
    const source = (this.getAttachedShaders(program) || []).map((shader) => this.getShaderSource(shader) || '').join('\n');
    const linked = Boolean(this.getProgramParameter(program, this.LINK_STATUS));
    const kind = source.includes('uShallow') ? 'water' : (source.includes('uTop') && source.includes('uWarm')) ? 'sky' : 'other';
    probe.linkedPrograms.push({ kind, linked });
    if (!linked) probe.shaderFailures.push({ stage: 'link', kind, log: this.getProgramInfoLog(program) || 'Linking failed without a driver log.' });
    return result;
  };
  for (const method of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
    const original = prototype[method];
    if (typeof original !== 'function') continue;
    prototype[method] = function (...args) { probe.drawCalls += 1; return original.apply(this, args); };
  }
}
async function captureRuntime(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas.game-canvas');
    const gl = canvas?.getContext('webgl2');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    const terms = [...document.querySelectorAll('[data-debug-list] dt')];
    const quality = terms.find((term) => term.textContent === 'Rendu')?.nextElementSibling?.textContent || null;
    return {
      probe: window.__sealSmokeWebGL || null, quality,
      canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
      graphics: gl ? {
        version: gl.getParameter(gl.VERSION),
        renderer: gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
        vendor: gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR),
        contextLost: gl.isContextLost(), error: gl.getError(),
      } : null,
      fatalError: document.querySelector('.fatal-error')?.textContent || null,
    };
  });
}
function assertRuntime(runtime, scenario) {
  assert.ok(runtime.canvas && runtime.canvas.width > 0 && runtime.canvas.height > 0, 'Canvas must have nonzero drawing-buffer dimensions.');
  assert.ok(runtime.graphics, 'The application canvas must contain a WebGL2 context.');
  assert.equal(runtime.graphics.contextLost, false, 'WebGL context was lost.');
  assert.equal(runtime.graphics.error, 0, 'WebGL reported an error.');
  assert.equal(runtime.fatalError, null, 'Application displayed its fatal-error fallback.');
  assert.equal(runtime.quality, scenario.expectedQuality, 'The intended render-quality branch must actually run.');
  assert.ok(runtime.probe?.available, 'WebGL2 instrumentation was not installed.');
  assert.equal(runtime.probe.contextLost, false, 'A WebGL context-loss event occurred.');
  assert.deepEqual(runtime.probe.shaderFailures, [], 'Real shader compilation/linking failed.');
  assert.ok(runtime.probe.compiledShaders > 0, 'No actual shader compilation was observed.');
  assert.ok(runtime.probe.drawCalls > 0, 'No actual draw call was observed.');
  for (const kind of ['water', 'sky']) assert.ok(runtime.probe.linkedPrograms.some((program) => program.kind === kind && program.linked), 'No successfully linked ' + kind + ' shader was observed.');
}
async function activateButton(page, locator, keyboard) {
  if (keyboard) { await locator.focus(); await page.keyboard.press('Enter'); }
  else await locator.click();
}
async function testSoundToggle(page, keyboard) {
  const sound = page.locator('button[data-sound]');
  await sound.waitFor({ state: 'visible' });
  const initial = await sound.getAttribute('aria-pressed');
  assert.ok(initial === 'true' || initial === 'false', 'Sound must expose a binary aria-pressed state.');
  const initialLabel = initial === 'true' ? 'Couper le son' : 'Activer le son';
  assert.ok(await page.getByRole('button', { name: initialLabel, exact: true }).isVisible(), 'Sound must have the matching accessible name.');
  await activateButton(page, sound, keyboard);
  const changed = initial === 'true' ? 'false' : 'true';
  await page.waitForFunction((expected) => document.querySelector('button[data-sound]')?.getAttribute('aria-pressed') === expected, changed);
  assert.ok(await page.getByRole('button', { name: changed === 'true' ? 'Couper le son' : 'Activer le son', exact: true }).isVisible(), 'Accessible sound name must change after toggling.');
  await activateButton(page, sound, keyboard);
  await page.waitForFunction((expected) => document.querySelector('button[data-sound]')?.getAttribute('aria-pressed') === expected, initial);
  assert.ok(await page.getByRole('button', { name: initialLabel, exact: true }).isVisible(), 'Sound accessible name must restore after the second toggle.');
  return { initialState: initial, toggledState: changed, restoredState: initial, validated: 'Accessible controls and state only; no audio-output assertion.' };
}
async function runScenario(scenario) {
  const result = { name: scenario.name, expectedQuality: scenario.expectedQuality, status: 'running', consoleErrors: [], pageErrors: [], requestFailures: [], httpErrors: [], warnings: [], screenshots: [] };
  report.cases.push(result);
  const context = await browser.newContext({ ...scenario.options, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(30000);
  page.on('console', (message) => {
    if (message.type() === 'error') result.consoleErrors.push(message.text());
    if (message.type() === 'warning' && result.warnings.length < 30) result.warnings.push(message.text());
  });
  page.on('pageerror', (error) => result.pageErrors.push(serializeError(error)));
  page.on('requestfailed', (request) => result.requestFailures.push({ url: request.url(), error: request.failure()?.errorText || 'unknown' }));
  page.on('response', (response) => {
    if (response.status() >= 400) result.httpErrors.push({ url: response.url(), status: response.status() });
  });
  await page.addInitScript(() => {
    for (const [name, value] of [['hardwareConcurrency', 8], ['deviceMemory', 8]]) Object.defineProperty(navigator, name, { configurable: true, get: () => value });
  });
  await page.addInitScript(installWebGLProbe);
  const screenshot = async (phase) => {
    const filename = scenario.name + '-' + phase + '.png';
    await page.screenshot({ path: join(artifactDirectory, filename), timeout: 15000 });
    result.screenshots.push(filename);
    if (phase === 'exploration') {
      await page.screenshot({ path: join(artifactDirectory, scenario.name + '-exploration.jpg'), type: 'jpeg', quality: 82, timeout: 15000 });
    }
  };
  try {
    const response = await page.goto(appURL, { waitUntil: 'domcontentloaded' });
    assert.ok(response?.ok(), 'Production document must load successfully.');
    await page.getByRole('button', { name: 'Entrer dans Aqualys', exact: true }).waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const probe = window.__sealSmokeWebGL;
      return probe?.drawCalls > 0 && ['water', 'sky'].every((kind) => probe.linkedPrograms.some((program) => program.kind === kind && program.linked));
    }, undefined, { timeout: 20000 });
    result.beforeStart = await captureRuntime(page);
    assertRuntime(result.beforeStart, scenario);
    await screenshot('introduction');
    await activateButton(page, page.getByRole('button', { name: 'Entrer dans Aqualys', exact: true }), scenario.expectedQuality === 'high');
    await page.waitForFunction(() => document.querySelector('[data-intro]')?.hidden === true);
    result.sound = await testSoundToggle(page, scenario.expectedQuality === 'high');
    await screenshot('exploration');
    await page.getByRole('button', { name: 'Prendre soin de Luma', exact: true }).click();
    await page.getByRole('dialog', { name: 'Un moment avec Luma', exact: true }).waitFor({ state: 'visible' });
    await screenshot('care');
    await page.getByRole('button', { name: 'Fermer le soin', exact: true }).click();
    await page.getByRole('dialog', { name: 'Un moment avec Luma', exact: true }).waitFor({ state: 'hidden' });
    result.afterInteractions = await captureRuntime(page);
    assertRuntime(result.afterInteractions, scenario);
    assert.deepEqual(result.pageErrors, [], 'Uncaught browser errors occurred.');
    assert.deepEqual(result.consoleErrors, [], 'Browser console errors occurred.');
    assert.deepEqual(result.requestFailures, [], 'Resource requests failed.');
    assert.deepEqual(result.httpErrors, [], 'Resource HTTP errors occurred.');
    result.status = 'passed';
  } catch (error) {
    result.status = 'failed'; result.failure = serializeError(error);
    report.failures.push({ scenario: scenario.name, ...serializeError(error) });
    try { result.failureRuntime = await captureRuntime(page); } catch (captureError) { result.captureError = serializeError(captureError); }
    try { await screenshot('failure'); } catch (captureError) { result.screenshotError = serializeError(captureError); }
  } finally {
    await writeFile(join(artifactDirectory, scenario.name + '.json'), JSON.stringify(result, null, 2) + '\n');
    await context.close();
  }
}
async function stopPreview() {
  if (!preview || preview.exitCode !== null || preview.signalCode !== null || previewError) return;
  await new Promise((done) => {
    const timeout = setTimeout(() => { preview.kill('SIGKILL'); done(); }, 3000);
    preview.once('exit', () => { clearTimeout(timeout); done(); }); preview.kill('SIGTERM');
  });
}
await mkdir(artifactDirectory, { recursive: true });
try {
  report.playwrightVersion = JSON.parse(await readFile(new URL('./node_modules/playwright/package.json', import.meta.url), 'utf8')).version;
  preview = spawn(process.execPath, [join(workspace, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], {
    cwd: workspace, env: process.env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  preview.stdout.on('data', appendPreviewLog); preview.stderr.on('data', appendPreviewLog);
  preview.on('error', (error) => { previewError = error; });
  preview.on('exit', (code, signal) => { previewExit = { code, signal }; });
  await waitForPreview();
  browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  report.browserVersion = browser.version();
  for (const scenario of scenarios) await runScenario(scenario);
} catch (error) {
  report.failures.push({ scenario: 'runner', ...serializeError(error) });
} finally {
  if (browser) { try { await browser.close(); } catch (error) { report.failures.push({ scenario: 'browser-close', ...serializeError(error) }); } }
  await stopPreview(); report.finishedAt = new Date().toISOString();
  report.status = report.failures.length ? 'failed' : 'passed';
  await writeFile(join(artifactDirectory, 'preview.log'), previewLog);
  await writeFile(join(artifactDirectory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ status: report.status, cases: report.cases.map(({ name, status }) => ({ name, status })), artifacts: artifactDirectory }));
if (report.failures.length) process.exitCode = 1;
