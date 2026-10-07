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
    options: { viewport: { width: 960, height: 540 }, deviceScaleFactor: 1, hasTouch: false, isMobile: false },
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
scenarios.push({
  name:'desktop-battle', expectedQuality:'high', battle:true,
  options:{viewport:{width:960,height:540},deviceScaleFactor:1,hasTouch:false,isMobile:false},
});
// Targeted original-art checks exercise actual touch commands and portrait layout.
if(process.env.SEAL_SMOKE_CASE==='battle'){
 scenarios.splice(0,scenarios.length,scenarios.find(s=>s.name==='desktop-battle'),{
  name:'touch-battle',expectedQuality:'low',battle:true,
  options:{viewport:{width:844,height:390},deviceScaleFactor:1,hasTouch:true,isMobile:true},
 },{
  name:'portrait-battle',expectedQuality:'low',battle:true,
  options:{viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true},
 });
}
const report = {
  schemaVersion: 1, startedAt: new Date().toISOString(),
  gitSha: process.env.GITHUB_SHA || null, appURL,
  backendRequested: 'Chromium ANGLE SwiftShader',
  scope: 'Production startup, real GLSL compilation/linking, draw calls, actual keyboard/touch belly hops, shore/water transitions and UI interactions. The capture context retains its drawing buffer for screenshots; no visual quality, frame-rate or real-device assertion.',
  capturePolicy:{testOnlyFramebufferRetention:true,screenshotSource:'Chromium native view',rendererSourceChanged:false},
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
// Capture-only context option: retain the actual rendered pixels while RAF
// is held at the belly-hop apex. Production renderer settings are unchanged.
function installCaptureContext() {
  const original=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(type,options,...args){
    return original.call(this,type,this.classList.contains('game-canvas')&&['webgl','webgl2','experimental-webgl'].includes(type)
      ?{...options,preserveDrawingBuffer:true}:options,...args);
  };
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
      motion: window.__sealSmokeMotion?.latest || null,
      focus: {tag:document.activeElement?.tagName, className:document.activeElement?.className, inert:document.activeElement?.inert},
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

function installCaptureGate() {
  const nativeRAF=window.requestAnimationFrame.bind(window),nativeCancel=window.cancelAnimationFrame.bind(window);
  const pending=new Map();let paused=false,next=1;
  const schedule=(id,entry)=>{
    entry.native=nativeRAF(time=>{
      if(!pending.has(id))return;
      if(paused){entry.native=0;return;}
      pending.delete(id);entry.callback(time);
    });
  };
  window.requestAnimationFrame=callback=>{
    const id=next++,entry={callback,native:0};pending.set(id,entry);schedule(id,entry);return id;
  };
  window.cancelAnimationFrame=id=>{
    const entry=pending.get(id);if(entry?.native)nativeCancel(entry.native);pending.delete(id);
  };
  window.__sealSmokeFrames={
    get paused(){return paused;},
    pause(){paused=true;document.querySelector('canvas')?.getContext('webgl2')?.finish();},
    resume(){paused=false;for(const [id,entry] of pending)if(!entry.native)schedule(id,entry);}
  };
}

function installMotionTrace() {
  const trace = {events:[],latest:null,captureHop:false,captured:false,captureScheduled:false};
  window.__sealSmokeMotion=trace;
  document.addEventListener('seal:motion-state', event => {
    const state={...event.detail};
    trace.latest=state; trace.events.push(state);
    if(trace.events.length>128)trace.events.shift();
    if(trace.captureHop && !trace.captureScheduled && state.jumpStage==='air' && state.jumpHeight>=.18) {
      trace.captureScheduled=true;
      // Capture the completed game frame, after its draw calls.
      requestAnimationFrame(()=>{
        window.__sealSmokeFrames.pause();
        trace.captured=true;
      });
    }
  },true);
}
async function testBellyHop(page, scenario, screenshot) {
  await page.evaluate(()=>{
    const t=window.__sealSmokeMotion;
    t.events=[];t.captureHop=true;t.captured=false;t.captureScheduled=false;
  });
  if(scenario.expectedQuality==='high') {
    await page.locator('canvas.game-canvas').focus();
    await page.keyboard.press('Space');
  } else {
    await page.getByRole('button',{name:'Petit bond sur le ventre',exact:true}).tap();
  }
  await page.waitForFunction(()=>window.__sealSmokeMotion.captured,undefined,{polling:100,timeout:45000});
  await screenshot('belly-hop');
  await page.evaluate(()=>window.__sealSmokeMotion.captureHop=false);
  await page.waitForFunction(()=>{
    const t=window.__sealSmokeMotion;
    return t.events.some(s=>s.jumpStage==='landing') && t.latest.jumpStage==='idle';
  },undefined,{polling:100,timeout:45000});
  const trace=await page.evaluate(()=>window.__sealSmokeMotion.events);
  for(const stage of ['anticipation','air','landing','idle'])
    assert.ok(trace.some(s=>s.jumpStage===stage),'Actual movement must reach '+stage);
  assert.ok(trace.some(s=>s.jumpStage==='air' && s.grounded===false && s.jumpHeight>=.18),'Hop must leave the ground.');
  assert.ok(trace.at(-1).grounded,'Hop must finish on the ground.');
  return {stages:[...new Set(trace.map(s=>s.jumpStage))],peakObserved:Math.max(...trace.map(s=>s.jumpHeight)),input:scenario.expectedQuality==='high'?'Space':'native touch tap'};
}
async function testSwimming(page, screenshot) {
  await page.locator('canvas.game-canvas').click({position:{x:10,y:10}});
  await page.waitForFunction(()=>document.activeElement===document.querySelector('canvas.game-canvas'));
  await page.keyboard.down('Shift');
  await page.keyboard.down('ArrowUp');
  try {
    await page.waitForFunction(()=>window.__sealSmokeMotion.latest?.mode==='surface',undefined,{polling:200,timeout:120000});
    const shore=await page.evaluate(()=>({...window.__sealSmokeMotion.latest}));
    await page.waitForFunction(start=>{
      const s=window.__sealSmokeMotion.latest;
      return s?.mode==='surface' && Math.hypot(s.x-start.x,s.z-start.z)>=3;
    },shore,{polling:200,timeout:120000});
  } finally {
    await page.keyboard.up('ArrowUp');await page.keyboard.up('Shift');
  }
  await screenshot('swimming');
  await page.keyboard.down('KeyQ');
  try {
    await page.waitForFunction(()=>window.__sealSmokeMotion.latest?.mode==='underwater',undefined,{polling:100,timeout:45000});
  } finally {await page.keyboard.up('KeyQ');}
  await screenshot('underwater');
  await page.keyboard.down('Space');
  try {
    await page.waitForFunction(()=>window.__sealSmokeMotion.latest?.mode==='surface',undefined,{polling:100,timeout:45000});
  } finally {await page.keyboard.up('Space');}
  return {modes:['land','surface','underwater','surface'],input:'ArrowUp/Shift, Q, Space'};
}

async function testCombat(page,screenshot,scenario) {
  const panel=page.locator('.battle-panel');
  await page.locator('canvas.game-canvas').click({position:{x:10,y:10}});
  await page.keyboard.down('Shift');await page.keyboard.down('ArrowRight');
  try {
    await panel.waitFor({state:'visible',timeout:120000});
  } finally {await page.keyboard.up('ArrowRight');await page.keyboard.up('Shift');}
  const entry=await page.evaluate(()=>({...window.__sealSmokeMotion.latest}));
  assert.equal(await panel.getAttribute('data-battle-state'),'active');
  assert.equal(await panel.locator('[data-battle-action]').count(),6);
  assert.ok(await panel.locator('[data-battle-intent]').textContent());
  assert.equal(await panel.getAttribute('data-battle-art'),'illustrated','The first battle frame must use the loaded original art.');
  const icons=await panel.locator('.battle-action__art').evaluateAll(nodes=>nodes.map(n=>({loaded:n.complete&&n.naturalWidth>0,path:n.getAttribute('src')})));
  assert.equal(icons.length,6);assert.ok(icons.every(n=>n.loaded&&n.path.startsWith('/-seal-odyssey/assets/battle-icons/')));
  await screenshot('combat');
  const used=[];
  const perform=async id=>{
    const command=panel.locator('[data-battle-action="'+id+'"]');
    if(scenario.options.hasTouch)await command.tap();else await command.click();
    assert.equal(await panel.getAttribute('data-battle-busy'),'true','Commands must lock during the actual animated turn.');
    assert.ok(await panel.locator('[data-battle-action="swift-wave"]').isDisabled(),'A second turn must not start during animation.');
    await page.waitForFunction(()=>document.querySelector('.battle-panel')?.dataset.battleBusy==='false',undefined,{polling:100,timeout:120000});
    used.push(id);
  };
  // Native DOM actions exercise all six distinct gestures before finishing.
  for(const id of ['observe','guard','dodge','comfort','strong-wave','swift-wave'])await perform(id);
  for(let i=0;i<12 && await panel.getAttribute('data-battle-state')==='active';i++){
    const combo=await panel.locator('[data-battle-combo]').getAttribute('data-battle-combo');
    const strong=panel.locator('[data-battle-action="strong-wave"]');
    const swift=panel.locator('[data-battle-action="swift-wave"]');
    const id=combo!=='ready'?'observe':!await strong.isDisabled()?'strong-wave':!await swift.isDisabled()?'swift-wave':'comfort';
    await perform(id);
  }
  assert.equal(await panel.getAttribute('data-battle-state'),'victory','The shore manifestation must be appeasable using the visible actions.');
  await screenshot('combat-victory');
  if(scenario.options.hasTouch)await panel.locator('[data-battle-close]').tap();else await panel.locator('[data-battle-close]').click();
  await panel.waitFor({state:'hidden'});
  assert.equal(await page.locator('canvas.game-canvas').evaluate(c=>document.activeElement===c),true,'Exploration must regain keyboard focus.');
  const returned=await page.evaluate(()=>({...window.__sealSmokeMotion.latest}));
  assert.ok(Math.hypot(returned.x-entry.x,returned.z-entry.z)<.08,'Battle must return to the same world position.');
  await page.waitForFunction(()=>localStorage.getItem('seal-odyssey:save')?.includes('current-appeased'),undefined,{timeout:10000});
  return {actions:used,result:'victory',entry,returned,persistentMemory:true};
}

async function runScenario(scenario) {
  const result = { name: scenario.name, expectedQuality: scenario.expectedQuality, status: 'running', consoleErrors: [], pageErrors: [], requestFailures: [], httpErrors: [], warnings: [], screenshots: [] };
  report.cases.push(result);
  const context = await browser.newContext({ ...scenario.options, serviceWorkers: 'block' });
  const page = await context.newPage();
  const captureSession = await context.newCDPSession(page);
  page.setDefaultTimeout(45000); page.setDefaultNavigationTimeout(30000);
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
  await page.addInitScript(installCaptureContext);
  await page.addInitScript(installWebGLProbe);
  await page.addInitScript(installCaptureGate);
  await page.addInitScript(installMotionTrace);
  const screenshot = async (phase) => {
    const filename = scenario.name + '-' + phase + '.png';
    // Briefly hold browser RAF callbacks and drain software GL for a stable,
    // actual game frame. The production renderer/game code is unchanged.
    await page.evaluate(async(holdFrame)=>{
      await document.fonts.ready;
      if(!window.__sealSmokeFrames.paused) {
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      }
      if(holdFrame)window.__sealSmokeFrames.pause();
      else document.querySelector('canvas.game-canvas')?.getContext('webgl2')?.finish();
    },phase!=='care');
    try {
      const pixels=await page.evaluate(()=>{
        const canvas=document.querySelector('canvas.game-canvas'),gl=canvas?.getContext('webgl2');
        if(!gl)return null;
        const size=8,data=new Uint8Array(size*size*4);
        gl.readPixels(Math.max(0,Math.floor(canvas.width/2)-4),Math.max(0,Math.floor(canvas.height/2)-4),size,size,gl.RGBA,gl.UNSIGNED_BYTE,data);
        let opaque=0,lit=0;
        for(let i=0;i<data.length;i+=4){if(data[i+3]>240)opaque++;if(data[i]+data[i+1]+data[i+2]>12)lit++;}
        return {opaque,lit,retained:gl.getContextAttributes().preserveDrawingBuffer};
      });
      assert.ok(pixels?.retained&&pixels.opaque>40&&pixels.lit>16,'Capture must contain the actual opaque 3D framebuffer: '+phase);
      // Capture the compositor's actual frozen frame directly. Playwright's
      // screenshot preparation waits for extra animation frames during layout
      // changes, which cannot complete while the apex/capture RAF gate is held.
      const capture = async (format, path) => {
        let timer;
        try {
          const image = await Promise.race([
            captureSession.send('Page.captureScreenshot', {
              format, ...(format === 'jpeg' ? {quality:82} : {}),
              fromSurface:false, captureBeyondViewport:true,
              clip:{x:0,y:0,...scenario.options.viewport,scale:1},
            }),
            new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Compositor capture timed out: '+phase)),45000);}),
          ]);
          await writeFile(path,Buffer.from(image.data,'base64'));
        } finally {clearTimeout(timer);}
      };
      await capture('png',join(artifactDirectory,filename));
      result.screenshots.push(filename);
      if (['exploration', 'failure', 'care', 'belly-hop', 'swimming', 'underwater', 'combat', 'combat-victory'].includes(phase)) {
        await capture('jpeg',join(artifactDirectory,scenario.name+'-'+phase+'.jpg'));
      }
    } finally {
      await page.evaluate(()=>window.__sealSmokeFrames.resume());
    }
  };
  try {
    const response = await page.goto(appURL, { waitUntil: 'domcontentloaded' });
    assert.ok(response?.ok(), 'Production document must load successfully.');
    // Settle UI transitions before capture; avoid layout/ResizeObserver changes
    // while the WebGL frame gate holds the portrait canvas.
    await page.addStyleTag({content:'*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important;}'});
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
    if(scenario.battle){
      result.combat=await testCombat(page,screenshot,scenario);
    }else{
    result.bellyHop=await testBellyHop(page,scenario,screenshot);
    await page.getByRole('button', { name: 'Prendre soin de Luma', exact: true }).click();
    await page.getByRole('dialog', { name: 'Un moment avec Luma', exact: true }).waitFor({ state: 'visible' });

    assert.equal(await page.locator('[data-care-surface] canvas').count(), 1, 'Care must display the live 3D canvas.');
    await page.waitForFunction(() => {
      const c=document.querySelector('[data-care-surface] canvas');
      return c && c.width>100 && c.height>100 && c.inert===false;
    });
    await page.waitForTimeout(700); // Allow the portrait camera's eased transition.
    await screenshot('care');
    await page.getByRole('button', {name:'Nourrir', exact:false}).click();
    const surface=page.locator('[data-care-surface]');
    const feedbackBefore=await page.locator('[data-care-feedback]').textContent();
    await surface.focus();
    await page.keyboard.press('Enter');
    assert.notEqual(await page.locator('[data-care-feedback]').textContent(),feedbackBefore,'Care input must reach the care system.');

    await page.getByRole('button', { name: 'Fermer le soin', exact: true }).click();
    await page.getByRole('dialog', { name: 'Un moment avec Luma', exact: true }).waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#app > canvas').count(),1,'The live canvas must return to exploration.');
    if(scenario.expectedQuality==='high')result.swimming=await testSwimming(page,screenshot);
    }
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
    try {await captureSession.detach();} finally {await context.close();}
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
  browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=960,540'] });
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
console.log(JSON.stringify({status:report.status,failures:report.failures,cases:report.cases.map(({name,status,failure,consoleErrors,pageErrors,failureRuntime})=>({name,status,failure,consoleErrors,pageErrors,failureRuntime})),artifacts:artifactDirectory}));
if (report.failures.length) process.exitCode = 1;
