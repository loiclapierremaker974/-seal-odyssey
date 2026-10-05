// Temporary procedural sound for the P0 prototype.
// These synthesized textures and cues are placeholders, not final music or sound design.
// No audio assets, network requests, timers, or automatic playback are used.

const CUES = {
  echo: [
    { frequency: 523.25, offset: 0, duration: 0.75, level: 0.035 },
    { frequency: 783.99, offset: 0.11, duration: 0.8, level: 0.022 },
  ],
  site: [
    { frequency: 196, offset: 0, duration: 1.5, level: 0.032 },
    { frequency: 293.66, offset: 0.1, duration: 1.35, level: 0.025 },
    { frequency: 392, offset: 0.2, duration: 1.2, level: 0.02 },
  ],
  care: [
    { frequency: 392, offset: 0, duration: 0.45, level: 0.028 },
    { frequency: 523.25, offset: 0.1, duration: 0.55, level: 0.022 },
  ],
};
function unit(value) {
  if (value === true) return 1;
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value)) : 0;
}
function ignore(operation) {
  try { Promise.resolve(operation()).catch(() => {}); } catch {}
}
function disconnect(node) {
  try { node.disconnect(); } catch {}
}
/**
 * Gesture-gated, modest Web Audio ambience for the prototype.
 * start() must be called directly in a user interaction, before unrelated awaits.
 * Muting never creates or resumes an AudioContext. resume() never creates one.
 * Call update() with normalized speed, immersion and restoration (0..1).
 */
export class AqualysAudio {
  constructor({
    contextFactory,
    muted = true,
    visibilityTarget = globalThis.document ?? null,
  } = {}) {
    const NativeContext = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    this._contextFactory = contextFactory ??
      (NativeContext ? () => new NativeContext() : null);
    this.available = typeof this._contextFactory === 'function';
    this.muted = Boolean(muted);
    this.started = false;
    this._context = null;
    this._disposed = false;
    this._manualPaused = false;
    this._startPromise = null;
    this._nodes = [];
    this._sources = [];
    this._cues = new Set();
    this._master = null;
    this._sea = null;
    this._wind = null;
    this._tone = null;
    this._tonePitch = null;
    this._waterFilter = null;
    this._underwater = 0;
    this._speed = 0;
    this._restored = 0;
    this._phase = 0;
    this._lastCueTime = -Infinity;
    this._visibilityTarget = visibilityTarget;
    this._hidden = this._isHidden();
    this._onVisibility = () => {
      if (this._disposed) return;
      this._hidden = this._isHidden();
      if (this._hidden) {
        this._silence();
        this._stopCues();
        this._suspend();
      } else if (this.started && !this._manualPaused) {
        void this._resumeContext();
      }
    };
    try {
      visibilityTarget?.addEventListener?.('visibilitychange', this._onVisibility);
    } catch {
      this._visibilityTarget = null;
    }
  }
  _isHidden() {
    return this._visibilityTarget?.hidden === true ||
      this._visibilityTarget?.visibilityState === 'hidden';
  }
  start() {
    if (this._disposed || !this.available || this._hidden) return Promise.resolve(false);
    this._manualPaused = false;
    if (this._startPromise) return this._startPromise;
    const operation = this._startContext();
    this._startPromise = operation;
    operation.then(() => {
      if (this._startPromise === operation) this._startPromise = null;
    }, () => {});
    return operation;
  }
  async _startContext() {
    if (!this._context) {
      try {
        const context = this._contextFactory();
        if (!context) throw new Error('Web Audio unavailable');
        this._context = context;
        this._buildGraph(context);
      } catch {
        this.available = false;
        this._destroyGraph();
        this._closeContext();
        return false;
      }
    }
    return this._resumeContext(true);
  }
  async _resumeContext(allowFirstStart = false) {
    const context = this._context;
    if (!context || this._disposed || this._hidden || this._manualPaused ||
        (!this.started && !allowFirstStart)) return false;
    try {
      if (context.state !== 'running') await context.resume();
      if (this._disposed || this._context !== context) return false;
      if (this._hidden || this._manualPaused) {
        this._silence();
        this._suspend();
        return false;
      }
      if (context.state !== 'running') return false;
      this.started = true;
      this._refreshMaster();
      return true;
    } catch {
      this._silence();
      return false;
    }
  }
  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.muted) this._stopCues();
    this._refreshMaster();
  }
  pause() {
    if (this._disposed) return;
    this._manualPaused = true;
    this._silence();
    this._stopCues();
    this._suspend();
  }
  async resume() {
    if (this._disposed || !this.started) return false;
    this._manualPaused = false;
    return this._resumeContext();
  }
  _suspend() {
    const context = this._context;
    if (context && context.state !== 'closed') ignore(() => context.suspend());
  }
  _keep(node, source = false) {
    this._nodes.push(node);
    if (source) this._sources.push(node);
    return node;
  }
  _control(parameter, initial, tolerance = 0.001) {
    parameter.value = initial;
    return { parameter, value: initial, tolerance };
  }
  _buildGraph(context) {
    const seaSource = this._keep(context.createBufferSource(), true);
    const windSource = this._keep(context.createBufferSource(), true);
    const toneSource = this._keep(context.createOscillator(), true);
    const seaFilter = this._keep(context.createBiquadFilter());
    const windHigh = this._keep(context.createBiquadFilter());
    const windLow = this._keep(context.createBiquadFilter());
    const seaGain = this._keep(context.createGain());
    const windGain = this._keep(context.createGain());
    const toneGain = this._keep(context.createGain());
    const waterFilter = this._keep(context.createBiquadFilter());
    const masterGain = this._keep(context.createGain());
    this._master = this._control(masterGain.gain, 0);
    this._sea = this._control(seaGain.gain, 0.15);
    this._wind = this._control(windGain.gain, 0.035);
    this._tone = this._control(toneGain.gain, 0.004);
    this._tonePitch = this._control(toneSource.frequency, 132, 0.15);
    this._waterFilter = this._control(waterFilter.frequency, 4200, 2);
    this._mixNode = waterFilter;
    const sampleRate = context.sampleRate;
    const buffer = context.createBuffer(1, Math.ceil(sampleRate * 2), sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) samples[index] = Math.random() * 2 - 1;
    seaSource.buffer = buffer;
    windSource.buffer = buffer;
    seaSource.loop = true;
    windSource.loop = true;
    windSource.playbackRate.value = 0.83;
    seaFilter.type = 'lowpass';
    seaFilter.frequency.value = 430;
    seaFilter.Q.value = 0.55;
    windHigh.type = 'highpass';
    windHigh.frequency.value = 650;
    windLow.type = 'lowpass';
    windLow.frequency.value = 2400;
    windLow.Q.value = 0.5;
    waterFilter.type = 'lowpass';
    waterFilter.Q.value = 0.55;
    toneSource.type = 'sine';
    seaSource.connect(seaFilter);
    seaFilter.connect(seaGain);
    windSource.connect(windHigh);
    windHigh.connect(windLow);
    windLow.connect(windGain);
    toneSource.connect(toneGain);
    seaGain.connect(waterFilter);
    windGain.connect(waterFilter);
    toneGain.connect(waterFilter);
    waterFilter.connect(masterGain);
    masterGain.connect(context.destination);
    seaSource.start();
    windSource.start(0, 0.71);
    toneSource.start();
  }
  _target(control, value, timeConstant = 0.12) {
    if (!control || !this._context ||
        Math.abs(control.value - value) < control.tolerance) return;
    try {
      control.parameter.setTargetAtTime(value, this._context.currentTime, timeConstant);
      control.value = value;
    } catch {}
  }
  _refreshMaster() {
    const audible = this.started && !this.muted && !this._hidden &&
      !this._manualPaused && !this._disposed && this._context?.state === 'running';
    this._target(this._master, audible ? 0.42 : 0, 0.06);
  }
  _silence() {
    if (!this._master || !this._context) return;
    try {
      const now = this._context.currentTime;
      this._master.parameter.cancelScheduledValues(now);
      this._master.parameter.setValueAtTime(0, now);
      this._master.value = 0;
    } catch {}
  }
  update(state, delta) {
    if (!this.started || this._disposed || this._hidden || this._manualPaused ||
        this.muted || this._context?.state !== 'running' || !state) return;
    const dt = Number.isFinite(delta) ? Math.max(0, Math.min(delta, 0.1)) : 1 / 60;
    if (!dt) return;
    const blend = 1 - Math.exp(-dt * 4);
    this._underwater += (unit(state.underwater) - this._underwater) * blend;
    this._speed += (unit(state.speed) - this._speed) * blend;
    this._restored += (unit(state.restored) - this._restored) * blend;
    this._phase = (this._phase + dt) % 1000;
    const tide = 0.86 + Math.sin(this._phase * 0.48) * 0.14;
    const gust = 0.78 + Math.sin(this._phase * 0.31 + 1.2) * 0.22;
    this._target(this._sea, (0.15 + this._underwater * 0.11 + this._speed * 0.04) * tide);
    this._target(this._wind, (0.035 + this._speed * 0.045) * (1 - this._underwater * 0.94) * gust);
    this._target(this._waterFilter, 4200 - this._underwater * 3620, 0.16);
    this._target(this._tone, 0.004 + this._restored * 0.012 + this._underwater * 0.003, 0.25);
    this._target(this._tonePitch, 132 + this._restored * 16, 0.25);
  }
  playCue(type) {
    const notes = Object.hasOwn(CUES, type) ? CUES[type] : null;
    const context = this._context;
    if (!notes || !this.started || this.muted || this._hidden || this._manualPaused ||
        this._disposed || context?.state !== 'running' ||
        this._cues.size + notes.length > 6 ||
        context.currentTime - this._lastCueTime < 0.16) return false;
    const records = [];
    try {
      for (const note of notes) {
        const record = { oscillator: null, gain: null };
        records.push(record);
        record.oscillator = context.createOscillator();
        record.gain = context.createGain();
        const start = context.currentTime + note.offset;
        record.oscillator.type = 'sine';
        record.oscillator.frequency.setValueAtTime(note.frequency, start);
        record.gain.gain.setValueAtTime(0.0001, start);
        record.gain.gain.linearRampToValueAtTime(note.level, start + 0.03);
        record.gain.gain.exponentialRampToValueAtTime(0.0001, start + note.duration);
        record.oscillator.connect(record.gain);
        record.gain.connect(this._mixNode);
        record.oscillator.onended = () => this._releaseCue(record, false);
        this._cues.add(record);
      }
      for (let index = 0; index < records.length; index += 1) {
        const record = records[index], note = notes[index];
        const start = context.currentTime + note.offset;
        record.oscillator.start(start);
        record.oscillator.stop(start + note.duration + 0.02);
      }
      this._lastCueTime = context.currentTime;
      return true;
    } catch {
      for (const record of records) this._releaseCue(record, true);
      return false;
    }
  }
  _releaseCue(record, stop) {
    this._cues.delete(record);
    if (record.oscillator) {
      record.oscillator.onended = null;
      if (stop) { try { record.oscillator.stop(); } catch {} }
      disconnect(record.oscillator);
    }
    if (record.gain) disconnect(record.gain);
  }
  _stopCues() {
    for (const record of this._cues) this._releaseCue(record, true);
  }
  _destroyGraph() {
    this._stopCues();
    for (const source of this._sources) { try { source.stop(); } catch {} }
    for (const node of this._nodes) disconnect(node);
    this._sources.length = 0;
    this._nodes.length = 0;
    this._master = null;
    this._sea = null;
    this._wind = null;
    this._tone = null;
    this._tonePitch = null;
    this._waterFilter = null;
    this._mixNode = null;
  }
  _closeContext() {
    const context = this._context;
    this._context = null;
    if (context) ignore(() => context.close());
  }
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.started = false;
    this.available = false;
    try { this._visibilityTarget?.removeEventListener?.('visibilitychange', this._onVisibility); } catch {}
    this._silence();
    this._destroyGraph();
    this._closeContext();
    this._visibilityTarget = null;
  }
}
