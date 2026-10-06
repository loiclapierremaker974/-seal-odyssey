import test from 'node:test';
import assert from 'node:assert/strict';
import { AqualysAudio } from '../src/audio/AqualysAudio.js';

class MockParameter {
  constructor(value = 0) { this.value = value; this.targets = []; }
  setTargetAtTime(value) { this.value = value; this.targets.push(value); }
  setValueAtTime(value) { this.value = value; this.targets.push(value); }
  linearRampToValueAtTime(value) { this.value = value; this.targets.push(value); }
  exponentialRampToValueAtTime(value) { this.value = value; this.targets.push(value); }
  cancelScheduledValues() {}
}
class MockNode {
  constructor(context, kind) {
    this.context = context; this.kind = kind; this.connections = [];
    this.gain = new MockParameter(1); this.frequency = new MockParameter(440);
    this.Q = new MockParameter(1); this.playbackRate = new MockParameter(1);
    this.started = false; this.stopCalls = 0; this.disconnections = 0; this.onended = null;
  }
  connect(destination) { this.connections.push(destination); }
  disconnect() { this.disconnections += 1; }
  start() {
    this.started = true;
    const output = this.context.output;
    if (output) this.context.outputLevelsAtStart.push(output.gain.value);
    if (this.context.throwOnSourceStart) throw new Error('source denied');
  }
  stop(when) { this.stopCalls += 1; if (when === undefined) this.stopped = true; }
  finish() { this.onended?.(); }
}
class MockContext {
  constructor() {
    this.state = 'suspended'; this.sampleRate = 480; this.currentTime = 1;
    this.destination = {}; this.nodes = [];
    this.resumeCalls = 0; this.suspendCalls = 0; this.closeCalls = 0;
    this.resumeModes = []; this.outputLevelsAtStart = []; this.failCreateAt = -1;
  }
  get output() { return this.nodes.find((node) => node.connections.includes(this.destination)); }
  create(kind) {
    if (this.nodes.length === this.failCreateAt) throw new Error('node unavailable');
    const node = new MockNode(this, kind); this.nodes.push(node); return node;
  }
  createBufferSource() { return this.create('source'); }
  createOscillator() { return this.create('oscillator'); }
  createBiquadFilter() { return this.create('filter'); }
  createGain() { return this.create('gain'); }
  createBuffer(channels, length) {
    const data = new Float32Array(length); return { getChannelData: () => data };
  }
  resume() {
    this.resumeCalls += 1;
    if (this.resumeHandler) return this.resumeHandler();
    const mode = this.resumeModes.shift();
    if (mode === 'throw') throw new Error('resume denied');
    if (mode === 'reject') return Promise.reject(new Error('resume denied'));
    this.state = 'running'; return Promise.resolve();
  }
  suspend() {
    this.suspendCalls += 1;
    if (this.rejectSuspend) return Promise.reject(new Error('suspend denied'));
    this.state = 'suspended'; return Promise.resolve();
  }
  close() {
    this.closeCalls += 1; this.state = 'closed';
    if (this.rejectClose) return Promise.reject(new Error('close denied'));
    return Promise.resolve();
  }
}
class VisibilityTarget {
  constructor() { this.hidden = false; this.visibilityState = 'visible'; this.listeners = new Set(); }
  addEventListener(type, listener) { this.listeners.add(listener); }
  removeEventListener(type, listener) { this.listeners.delete(listener); }
  setHidden(hidden) {
    this.hidden = hidden; this.visibilityState = hidden ? 'hidden' : 'visible';
    for (const listener of this.listeners) listener();
  }
}
function setup(options = {}) {
  const context = new MockContext(), visibility = new VisibilityTarget();
  let creations = 0;
  const audio = new AqualysAudio({
    contextFactory: () => { creations += 1; return context; },
    visibilityTarget: visibility, ...options,
  });
  return { audio, context, visibility, creations: () => creations };
}
async function settle() {
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
}
test('loading, changing mute, updating and resuming never create audio', async () => {
  const { audio, context, creations } = setup();
  assert.equal(audio.muted, true); assert.equal(audio.started, false);
  audio.setMuted(false);
  audio.update({ underwater: true, speed: 1, restored: true }, 0.016);
  assert.equal(audio.playCue('echo'), false); assert.equal(await audio.resume(), false);
  audio.pause(); assert.equal(creations(), 0); assert.equal(context.resumeCalls, 0);
  audio.dispose();
});
test('muted start stays silent even when the native context starts running', async () => {
  const { audio, context } = setup(); context.state = 'running';
  assert.equal(await audio.start(), true); assert.equal(context.resumeCalls, 0);
  assert.equal(audio.started, true); assert.deepEqual(context.outputLevelsAtStart, [0, 0, 0]);
  assert.equal(context.output.gain.value, 0);
  assert.ok(context.output.gain.targets.every((value) => value === 0));
  assert.equal(audio.playCue('care'), false);
  audio.setMuted(false); assert.ok(context.output.gain.value > 0);
  audio.setMuted(true); assert.equal(context.output.gain.value, 0); audio.dispose();
});
test('resume is requested synchronously within start and concurrent starts share a context', async () => {
  const { audio, context, creations } = setup({ muted: false }); let release;
  context.resumeHandler = () => new Promise((resolve) => { release = () => { context.state = 'running'; resolve(); }; });
  const first = audio.start(), second = audio.start();
  assert.equal(creations(), 1); assert.equal(context.resumeCalls, 1);
  assert.deepEqual(context.outputLevelsAtStart, [0, 0, 0]);
  release(); assert.equal(await first, true); assert.equal(await second, true); audio.dispose();
});
test('a denied start stays silent and another user start can retry', async () => {
  const { audio, context, creations } = setup({ muted: false });
  context.resumeModes.push('reject', 'throw', 'ok');
  assert.equal(await audio.start(), false); assert.equal(audio.started, false);
  assert.equal(context.output.gain.value, 0); audio.setMuted(false);
  assert.equal(context.resumeCalls, 1); assert.equal(await audio.resume(), false);
  assert.equal(await audio.start(), false); assert.equal(await audio.start(), true);
  assert.equal(creations(), 1); assert.equal(context.resumeCalls, 3);
  assert.equal(audio.available, true); audio.dispose();
});
test('context absence and interrupted construction degrade without escaping errors', async () => {
  const missing = new AqualysAudio({ contextFactory: () => null, visibilityTarget: null });
  assert.equal(await missing.start(), false); assert.equal(missing.available, false);
  assert.equal(missing.playCue('echo'), false); missing.dispose();
  for (const failure of ['node', 'start']) {
    const { audio, context } = setup();
    if (failure === 'node') context.failCreateAt = 5; else context.throwOnSourceStart = true;
    assert.equal(await audio.start(), false); assert.equal(audio.available, false);
    assert.equal(context.closeCalls, 1);
    assert.ok(context.nodes.every((node) => node.disconnections >= 1));
    const sources = context.nodes.filter((node) => node.kind === 'source' || node.kind === 'oscillator');
    assert.ok(sources.every((node) => node.stopCalls >= 1));
    audio.dispose(); assert.equal(context.closeCalls, 1);
  }
});
test('visibility suspends and resumes an existing session while respecting manual pause', async () => {
  const { audio, context, visibility, creations } = setup({ muted: false });
  visibility.setHidden(true); assert.equal(await audio.start(), false);
  visibility.setHidden(false); await settle(); assert.equal(creations(), 0);
  await audio.start(); visibility.setHidden(true);
  assert.equal(context.output.gain.value, 0); assert.equal(context.state, 'suspended');
  visibility.setHidden(false); await settle();
  assert.equal(context.state, 'running'); assert.equal(context.resumeCalls, 2);
  audio.pause(); visibility.setHidden(true); visibility.setHidden(false); await settle();
  assert.equal(context.resumeCalls, 2); assert.equal(context.state, 'suspended');
  assert.equal(await audio.resume(), true); audio.dispose();
  assert.equal(visibility.listeners.size, 0); visibility.setHidden(false);
  assert.equal(context.resumeCalls, 3);
});
test('pause during a pending resume cannot turn sound back on', async () => {
  const { audio, context } = setup({ muted: false }); let release;
  context.resumeHandler = () => new Promise((resolve) => { release = () => { context.state = 'running'; resolve(); }; });
  const starting = audio.start(); audio.pause(); release();
  assert.equal(await starting, false); assert.equal(context.output.gain.value, 0);
  assert.equal(context.state, 'suspended'); audio.dispose();
});
test('cue voices are bounded and released on natural end, mute, and teardown', async () => {
  const { audio, context } = setup({ muted: false }); await audio.start();
  const persistentOscillators = new Set(context.nodes.filter((node) => node.kind === 'oscillator'));
  assert.equal(audio.playCue('unknown'), false); assert.equal(audio.playCue('__proto__'), false);
  assert.equal(audio.playCue('echo'), true); assert.equal(audio.playCue('echo'), false);
  context.currentTime += 0.2; assert.equal(audio.playCue('care'), true);
  context.currentTime += 0.2; assert.equal(audio.playCue('site'), false);
  const cueOscillators = context.nodes.filter((node) => node.kind === 'oscillator' && node.onended !== null);
  cueOscillators[0].finish(); cueOscillators[1].finish();
  assert.ok(cueOscillators.slice(0, 2).every((node) => node.disconnections === 1));
  assert.equal(audio.playCue('site'), true); audio.setMuted(true);
  const allCueOscillators = context.nodes.filter((node) => node.kind === 'oscillator' && !persistentOscillators.has(node));
  assert.ok(allCueOscillators.every((node) => node.onended === null));
  assert.ok(allCueOscillators.every((node) => node.disconnections === 1));
  assert.equal(audio.playCue('echo'), false); audio.dispose();
});
test('mixing bounds hostile inputs and never allocates new audio nodes per frame', async () => {
  const { audio, context } = setup({ muted: false }); await audio.start();
  const count = context.nodes.length;
  for (let index = 0; index < 240; index += 1) audio.update({ underwater: 100000, speed: -100000, restored: NaN }, 10000);
  audio.update({ underwater: NaN, speed: Infinity, restored: true }, NaN);
  audio.update({ underwater: true, speed: 1, restored: true }, -1);
  assert.equal(context.nodes.length, count);
  for (const node of context.nodes) {
    for (const value of node.gain.targets) { assert.ok(Number.isFinite(value)); assert.ok(value >= 0 && value <= 0.42); }
    for (const value of node.frequency.targets) { assert.ok(Number.isFinite(value)); assert.ok(value >= 0 && value <= 4200); }
  }
  const finalWaterFilter = context.nodes.find((node) => node.kind === 'filter' && node.connections.includes(context.output));
  assert.ok(finalWaterFilter.frequency.value >= 580);
  assert.ok(finalWaterFilter.frequency.value < 4200); audio.dispose();
});
test('failed lifecycle promises are handled and dispose wins an in-flight start', async () => {
  const { audio, context, visibility } = setup({ muted: false }); let release;
  context.resumeHandler = () => new Promise((resolve) => { release = resolve; });
  context.rejectSuspend = true; context.rejectClose = true;
  const starting = audio.start(); audio.pause(); visibility.setHidden(true);
  audio.dispose(); audio.dispose(); release();
  assert.equal(await starting, false); await settle();
  assert.equal(audio.started, false); assert.equal(audio.available, false);
  assert.equal(await audio.start(), false); assert.equal(await audio.resume(), false);
  assert.equal(context.closeCalls, 1);
  assert.ok(context.nodes.every((node) => node.disconnections === 1));
  assert.ok(context.nodes.filter((node) => node.kind === 'source' || node.kind === 'oscillator').every((node) => node.stopCalls >= 1));
});
test('a rejected visibility resume stays silent and permits an explicit retry', async () => {
  const { audio, context, visibility } = setup({ muted: false }); await audio.start();
  visibility.setHidden(true); context.resumeModes.push('reject');
  visibility.setHidden(false); await settle();
  assert.equal(context.state, 'suspended'); assert.equal(context.output.gain.value, 0);
  assert.equal(audio.playCue('site'), false); assert.equal(await audio.start(), true);
  assert.ok(context.output.gain.value > 0); audio.dispose();
});
