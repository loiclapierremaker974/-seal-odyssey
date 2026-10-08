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
const mobileUA='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const scenarios=[
 {name:'desktop-islands',expectedQuality:'high',fullJourney:true,options:{viewport:{width:960,height:540},deviceScaleFactor:1,hasTouch:false,isMobile:false}},
 {name:'touch-islands',expectedQuality:'low',options:{viewport:{width:844,height:390},deviceScaleFactor:1,hasTouch:true,isMobile:true,userAgent:mobileUA}},
 {name:'portrait-islands',expectedQuality:'low',options:{viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true,userAgent:mobileUA}},
];
const report = {
  schemaVersion: 1, startedAt: new Date().toISOString(),
  gitSha: process.env.GITHUB_SHA || null, appURL,
  backendRequested: 'Chromium ANGLE SwiftShader',
  scope: 'Native island exploration on desktop, touch landscape and portrait, real WebGL compilation and draw calls, native joystick and keyboard movement, hops, live care, island travel and diving. Desktop additionally checks the three Echoes, gated Site, all six combat commands and saved progress after reload. Actual Chromium screenshots, no FPS or physical-device assertion.',
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
    const kind = source.includes('uShallow') || /\bu(?:WorldTime|Time)\b/.test(source) ? 'water' : 'other';
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
    const quality = canvas?.dataset.quality || null;
    return {
      probe: window.__sealSmokeWebGL || null, quality,
      canvas: canvas ? { width:canvas.width,height:canvas.height,exploration:canvas.dataset.exploration,worldArt:canvas.dataset.worldArt,activeIsland:canvas.dataset.activeIsland } : null,
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
  for (const kind of ['water', 'other']) assert.ok(runtime.probe.linkedPrograms.some((program) => program.kind === kind && program.linked), 'No successfully linked ' + kind + ' shader was observed.');
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
    const state={...event.detail,sampledAt:performance.now()};
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

async function assertCombatLayout(panel,phase){
  const layout=await panel.evaluate(element=>({
    viewport:{width:window.innerWidth,height:window.innerHeight},
    buttons:[...element.querySelectorAll('button')].filter(n=>n.getClientRects().length).map(n=>{
      const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
      return {label:n.getAttribute('aria-label')||n.textContent.trim(),left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,unobstructed:hit?.closest('button')===n};
    }),
  }));
  assert.ok(layout.buttons.length>0,'Combat must expose commands during '+phase);
  for(const button of layout.buttons){
    assert.ok(button.left>=-1&&button.right<=layout.viewport.width+1&&button.top>=-1&&button.bottom<=layout.viewport.height+1,
      'Every combat command must fit in the viewport during '+phase+': '+JSON.stringify(button));
    assert.ok(button.width>=44&&button.height>=44,'Combat controls must remain touch-sized: '+button.label);
    assert.ok(button.unobstructed,'Combat command must be reachable without an overlay: '+button.label);
  }
}


async function motion(page){await page.waitForFunction(()=>Number.isFinite(window.__sealSmokeMotion?.latest?.x));return page.evaluate(()=>({...window.__sealSmokeMotion.latest}));}
async function travelLayout(page){
 const cards=await page.locator('[data-travel]').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {id:n.dataset.travel,x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('[data-travel]')===n,vw:innerWidth,vh:innerHeight};}));
 assert.deepEqual(cards.map(c=>c.id).sort(),['lagune','rivage','ruines']);
 for(const c of cards){assert.ok(c.width>=44&&c.height>=44&&c.x>=-1&&c.y>=-1&&c.right<=c.vw+1&&c.bottom<=c.vh+1&&c.hit,JSON.stringify(c));}
 return cards;
}
async function travel(page,id,scenario){
 await travelLayout(page);
 if(await page.locator('canvas.game-canvas').getAttribute('data-active-island')!==id){const b=page.locator('[data-travel="'+id+'"]');if(scenario.options.hasTouch)await b.tap();else await b.click();}
 await page.waitForFunction(id=>window.__sealSmokeMotion?.latest?.islandId===id&&window.__sealSmokeMotion.latest.jumpStage==='idle',id);
 const at=await motion(page);assert.equal(at.islandId,id);return at;
}
async function axis(page,key,target,tolerance=.4,encounter=false){
 await page.locator('canvas.game-canvas').focus();const from=await motion(page),sign=Math.sign(target-from[key]);
 if(Math.abs(target-from[key])<=tolerance)return {ok:true,at:from};
 const code=key==='x'?(sign>0?'ArrowRight':'ArrowLeft'):(sign>0?'ArrowDown':'ArrowUp');
 let prev=from[key],changed=Date.now(),at=from;const end=Date.now()+25000;await page.keyboard.down(code);
 try{while(Date.now()<end){await page.waitForTimeout(100);at=await motion(page);
 if(await page.locator('.battle-panel').isVisible()){if(encounter)return {ok:true,encounter:true,at};throw Error('Encounter on quest route '+JSON.stringify(at));}
 if(sign*(at[key]-target)>=-tolerance)return {ok:true,at};
 if(Math.abs(at[key]-prev)>.025){changed=Date.now();prev=at[key];}if(Date.now()-changed>4500)return {ok:false,key,target,at};
 }return {ok:false,key,target,at};}finally{await page.keyboard.up(code);}
}
async function walk(page,target){
 const attempts=[];
 for(let pass=0;pass<5;pass++){const at=await motion(page);if(Math.hypot(at.x-target.x,at.z-target.z)<=.65)return {at,attempts};
 const keys=['x','z'].sort((a,b)=>Math.abs(target[b]-at[b])-Math.abs(target[a]-at[a]));
 for(const key of keys){const r=await axis(page,key,target[key]);attempts.push(r);if(!r.ok){const k=key==='x'?'z':'x',center=k==='x'?{rivage:0,lagune:40,ruines:80}[r.at.islandId]:0;attempts.push(await axis(page,k,Math.max(center-13.5,Math.min(center+13.5,r.at[k]+[1.2,-1.2,2.4,-2.4,1.2][pass])),.3));}}}
 const at=await motion(page);assert.ok(Math.hypot(at.x-target.x,at.z-target.z)<=1,'Blocked native path '+JSON.stringify({target,at,attempts}));return {at,attempts};
}
async function nativeMove(page,scenario,session){
 const before=await motion(page);
 if(scenario.options.hasTouch){
 const b=await page.locator('[data-analog="move"]').boundingBox();assert.ok(b&&b.width>=44&&b.height>=44);const x=b.x+b.width/2,y=b.y+b.height/2,r=Math.min(b.width,b.height)*.38,point=(x,y)=>({x,y,id:7,radiusX:8,radiusY:8,force:.7});
 await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(x,y)]});
 try{await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(x-r*.8,y)]});await page.waitForFunction(s=>window.__sealSmokeMotion.latest.x<s.x-.4,before,{polling:100});}finally{await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
 }else{await page.locator('canvas.game-canvas').focus();await page.keyboard.down('ArrowLeft');try{await page.waitForFunction(s=>window.__sealSmokeMotion.latest.x<s.x-.4,before,{polling:100});}finally{await page.keyboard.up('ArrowLeft');}}
 await page.waitForTimeout(200);const after=await motion(page);assert.equal(after.islandId,before.islandId);assert.ok(after.x<before.x-.3);return {before,after,input:scenario.options.hasTouch?'CDP native joystick':'ArrowLeft'};
}
async function action(page){await page.locator('canvas.game-canvas').focus();await page.keyboard.press('KeyE');}
async function saved(page){return page.evaluate(()=>{const e=JSON.parse(localStorage.getItem('seal-odyssey:save')||'null');return e?{schemaVersion:e.schemaVersion,...e.state}:null;});}
async function echo(page,id,target,count){
 const path=await walk(page,target);await action(page);await page.waitForFunction(n=>document.querySelector('[data-echo-current]')?.textContent===String(n),count);
 await page.waitForFunction(id=>{try{return JSON.parse(localStorage.getItem('seal-odyssey:save'))?.state?.progress?.echoes?.discovered?.includes(id);}catch{return false;}},id,{timeout:10000});
 const state=await saved(page);assert.equal(state.progress.echoes.discovered.length,count);assert.equal(new Set(state.progress.echoes.discovered).size,count);return {id,path};
}
async function care(page,scenario,screenshot){
 const before=await motion(page),b=page.getByRole('button',{name:'Prendre soin de Luma',exact:true});if(scenario.options.hasTouch)await b.tap();else await b.click();
 const panel=page.getByRole('dialog',{name:'Un moment avec Luma',exact:true});await panel.waitFor({state:'visible'});
 assert.equal(await page.locator('[data-care-surface] canvas').count(),1);
 await page.waitForFunction(()=>{const c=document.querySelector('[data-care-surface] canvas');return c&&c.width>100&&c.height>100&&!c.inert;});await page.waitForTimeout(500);await screenshot('care');
 const feed=panel.locator('[data-care-mode="feed"]'),surface=panel.locator('[data-care-surface]');if(scenario.options.hasTouch){await feed.tap();await surface.tap();}else{await feed.click();await surface.focus();await page.keyboard.press('Enter');}
 await page.waitForFunction(()=>document.querySelector('[data-care-feedback]')?.dataset.accepted==='true');
 const close=page.getByRole('button',{name:'Fermer le soin',exact:true});if(scenario.options.hasTouch)await close.tap();else await close.click();await panel.waitFor({state:'hidden'});
 assert.equal(await page.locator('#app > canvas').count(),1);await page.waitForFunction(s=>window.__sealSmokeMotion.latest.sampledAt>s.sampledAt,before);
 const after=await motion(page);assert.ok(Math.hypot(after.x-before.x,after.z-before.z)<.1);return {accepted:true,before,after};
}
async function journey(page,scenario,screenshot){
 const result={fullQuest:!!scenario.fullJourney,echoes:[]};
 await travel(page,'ruines',scenario);await screenshot('ruins');
 if(scenario.fullJourney){await walk(page,{x:80,z:-2});await action(page);await page.waitForFunction(()=>/Il manque/.test(document.querySelector('[data-toast]')?.textContent||''));assert.equal((await saved(page)).progress.ancientSite.activated,false);}
 await travel(page,'rivage',scenario);if(scenario.fullJourney)result.echoes.push(await echo(page,'echo-rivage',{x:2,z:2},1));
 await travel(page,'lagune',scenario);await screenshot('lagoon');if(scenario.fullJourney)result.echoes.push(await echo(page,'echo-lagune',{x:37,z:1},2));
 result.path=await walk(page,{x:45,z:-1});await page.waitForFunction(()=>window.__sealSmokeMotion.latest.mode==='surface');await screenshot('swimming');
 if(scenario.options.hasTouch)await page.getByRole('button',{name:'Plonger sous la surface',exact:true}).tap();else{await page.locator('canvas.game-canvas').focus();await page.keyboard.press('KeyQ');}
 await page.waitForFunction(()=>window.__sealSmokeMotion.latest.mode==='underwater'&&window.__sealSmokeMotion.latest.y<-.35,undefined,{polling:100});await screenshot('underwater');
 if(scenario.fullJourney)result.echoes.push(await echo(page,'echo-profondeur',{x:45,z:-1},3));
 if(scenario.options.hasTouch)await page.getByRole('button',{name:'Remonter à la surface',exact:true}).tap();else{await page.locator('canvas.game-canvas').focus();await page.keyboard.press('Space');}
 await page.waitForFunction(()=>window.__sealSmokeMotion.latest.mode==='surface',undefined,{polling:100});
 if(scenario.fullJourney){await travel(page,'ruines',scenario);await walk(page,{x:80,z:-2});await action(page);await page.waitForFunction(()=>{try{return JSON.parse(localStorage.getItem('seal-odyssey:save')).state.progress.ancientSite.activated;}catch{return false;}},undefined,{timeout:10000});
 const state=await saved(page);assert.deepEqual([...state.progress.echoes.discovered].sort(),['echo-lagune','echo-profondeur','echo-rivage']);assert.equal(state.seals.luma.memory.echoes.length,3);await screenshot('ruins-restored');result.siteActivated=true;}
 return result;
}
async function persistence(page){
 const before=await saved(page);assert.equal(before.schemaVersion,1);assert.equal(before.progress.ancientSite.activated,true);assert.equal(before.seals.luma.memory.events.filter(e=>e?.type==='current-appeased'&&e.encounterId==='shore-remnant').length,1);
 await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Entrer dans Aqualys',exact:true}).waitFor({state:'visible',timeout:60000});await page.waitForFunction(()=>!document.querySelector('[data-start]').disabled);
 const after=await saved(page);assert.deepEqual(after.progress,before.progress);assert.deepEqual(after.seals.luma.memory,before.seals.luma.memory);await activateButton(page,page.getByRole('button',{name:'Entrer dans Aqualys',exact:true}),true);return {schemaVersion:1,threeEchoes:true,siteRestored:true,reloaded:true};
}

async function testCombat(page,screenshot,scenario) {
  const panel=page.locator('.battle-panel');
  await travel(page,'rivage',scenario);
  if(!await panel.isVisible()){const step=await axis(page,'z',5,.3,true);assert.ok(step.ok,'Shore encounter path blocked '+JSON.stringify(step));}
  if(!await panel.isVisible()){
   await page.locator('canvas.game-canvas').focus();const at=await motion(page),key=at.x<5?'ArrowRight':'ArrowLeft';await page.keyboard.down(key);
   try{await panel.waitFor({state:'visible',timeout:60000});}finally{await page.keyboard.up(key);}
  }
  const entry=await page.evaluate(()=>({...window.__sealSmokeMotion.latest}));
  assert.equal(await panel.getAttribute('data-battle-state'),'active');
  assert.equal(await panel.locator('[data-battle-action]').count(),6);
  assert.ok(await panel.locator('[data-battle-intent]').textContent());
  assert.equal(await panel.getAttribute('data-battle-art'),'illustrated','The first battle frame must use the loaded original art.');
  await page.waitForFunction(()=>{const icons=[...document.querySelectorAll('.battle-action__art')];return icons.length===6&&icons.every(n=>n.complete&&n.naturalWidth>0);});
  const icons=await panel.locator('.battle-action__art').evaluateAll(nodes=>nodes.map(n=>({loaded:n.complete&&n.naturalWidth>0,path:n.getAttribute('src')})));
  assert.equal(icons.length,6);assert.ok(icons.every(n=>n.loaded&&n.path.startsWith('/-seal-odyssey/assets/battle-icons/')));
  await assertCombatLayout(panel,'active');
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
  await assertCombatLayout(panel,'victory');
  await screenshot('combat-victory');
  if(scenario.options.hasTouch)await panel.locator('[data-battle-close]').tap();else await panel.locator('[data-battle-close]').click();
  await panel.waitFor({state:'hidden'});
  assert.equal(await page.locator('canvas.game-canvas').evaluate(c=>document.activeElement===c),true,'Exploration must regain keyboard focus.');
  await page.waitForFunction(s=>window.__sealSmokeMotion.latest.sampledAt>s.sampledAt,entry);
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
      assert.ok(pixels?.retained&&pixels.opaque>40&&pixels.lit>16,'Capture must contain the actual opaque game framebuffer: '+phase);
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
      if (['exploration','lagoon','ruins','ruins-restored','failure','care','belly-hop','swimming','underwater','combat','combat-victory'].includes(phase)) {
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
    await page.getByRole('button', { name: 'Entrer dans Aqualys', exact: true }).waitFor({ state: 'visible',timeout:60000 });
    await page.waitForFunction(()=>document.querySelector('[data-start]')?.disabled===false,undefined,{timeout:60000});
    await page.waitForFunction(() => {
      const probe = window.__sealSmokeWebGL;
      return probe?.drawCalls > 0 && ['water', 'other'].every((kind) => probe.linkedPrograms.some((program) => program.kind === kind && program.linked));
    }, undefined, { timeout: 20000 });
    result.beforeStart = await captureRuntime(page);
    assertRuntime(result.beforeStart, scenario);
    await screenshot('introduction');
    await activateButton(page, page.getByRole('button', { name: 'Entrer dans Aqualys', exact: true }), scenario.expectedQuality === 'high');
    await page.waitForFunction(() => document.querySelector('[data-intro]')?.hidden === true);
    result.sound = await testSoundToggle(page, scenario.expectedQuality === 'high');
    await screenshot('exploration');
    assert.equal(result.beforeStart.canvas.exploration,'overworld');
    assert.equal(result.beforeStart.canvas.worldArt,'overworld');
    result.nativeMovement=await nativeMove(page,scenario,captureSession);
    assert.equal((await motion(page)).mode,'land');
    result.bellyHop=await testBellyHop(page,scenario,screenshot);
    result.travelLayout=await travelLayout(page);
    result.care=await care(page,scenario,screenshot);
    result.journey=await journey(page,scenario,screenshot);
    if(scenario.fullJourney){result.combat=await testCombat(page,screenshot,scenario);result.persistence=await persistence(page);}
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
  for (const scenario of scenarios) {
    const {width,height}=scenario.options.viewport;
    browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--window-size='+width+','+height]});
    report.browserVersion=browser.version();
    await runScenario(scenario);
    await browser.close();browser=null;
  }
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
