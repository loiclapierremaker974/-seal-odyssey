import './styles.css';

import { AqualysAudio } from './audio/AqualysAudio.js';
import { CareSystem } from './care/CareSystem.js';
import { BUILD_VERSION, GameState } from './core/GameState.js';
import { SaveStore } from './persistence/SaveStore.js';
import { GuardianController } from './player/GuardianController.js';
import { InputController } from './player/InputController.js';
import { QuestSystem } from './quests/QuestSystem.js';
import { CarePanel } from './ui/CarePanel.js';
import createMobileHUD from './ui/MobileHUD.js';
import { AelysScene } from './world/AelysScene.js';
import { createLumaProxy } from './world/createLumaProxy.js';

const APP_VERSION =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.3.1';
const BUILD_ID =
  typeof __BUILD_ID__ !== 'undefined'
    ? __BUILD_ID__
    : `p0-local-${APP_VERSION}`;

const root = document.querySelector('#app');

if (!root) {
  throw new Error('Seal Odyssey: #app mount was not found.');
}

function createCanvas() {
  const canvas = document.createElement('canvas');
  canvas.className = 'game-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', "Vue 3D du Rivage d'Aelys");
  root.append(canvas);
  return canvas;
}

function readSoundPreference() {
  try { return localStorage.getItem('seal-odyssey:sound') === 'on'; }
  catch { return false; }
}

function saveSoundPreference(enabled) {
  try { localStorage.setItem('seal-odyssey:sound', enabled ? 'on' : 'off'); }
  catch { /* Audio remains usable when local storage is unavailable. */ }
}

function boot() {
  const canvas = createCanvas();
  const saveStore = new SaveStore();
  const loadedState = saveStore.load();
  const gameState = loadedState ?? new GameState();
  const questSystem = new QuestSystem({ gameState });
  const careSystem = new CareSystem(gameState.luma);
  const audio = new AqualysAudio({ muted: !readSoundPreference() });
  let soundTogglePending = false;
  const soundState = { underwater: 0, speed: 0, restored: 0 };

  let controller;
  let world;
  let diveRoute = 'dive';
  let started = false;
  let saveTimer = 0;
  let lastObjective = '';
  let lastPromptCheck = 0;

  const input = new InputController({
    canvas,
    root,
    createTouchControls: false,
    onInputModeChange: (mode) => refreshDebug({ input: mode }),
  });
  const debugState = { input: input.getState().inputMode };

  const hud = createMobileHUD({
    mount: root,
    version: APP_VERSION,
    build: BUILD_ID,
    onStart: () => {
      if (started) return;
      started = true;
      if (!audio.muted) {
        // start() is called synchronously in the start-button user gesture.
        audio.start().then((ready) => {
          if (!ready) audio.setMuted(true);
          hud.setSoundEnabled(ready && !audio.muted);
        });
      }
      controller?.setEnabled(true);
      hud.setBuildStatus(`P0 · v${APP_VERSION}`, 'ready');
      hud.showToast("Bienvenue sur le Rivage d'Aelys", { tone: 'success' });
    },
    onSound: async () => {
      if (soundTogglePending) return;
      if (!audio.muted) {
        audio.setMuted(true);
        saveSoundPreference(false);
        hud.setSoundEnabled(false);
        return;
      }
      soundTogglePending = true;
      try {
        const ready = await audio.start();
        if (ready) {
          audio.setMuted(false);
          saveSoundPreference(true);
          hud.setSoundEnabled(true);
        } else {
          hud.showToast('Le son est indisponible. Vous pouvez continuer à explorer.', {
            tone: 'warning',
          });
        }
      } finally {
        soundTogglePending = false;
      }
    },
    onControl: (control, active, value) => {
      if (control === 'move') {
        input.setMove(value.x, value.y);
        return;
      }
      if (control === 'look') {
        input.setLook(value.x, value.y);
        return;
      }
      if (control === 'dive') {
        if (active) {
          diveRoute = controller?.getState().mode === 'underwater' ? 'ascend' : 'dive';
        }
        input.setAction(diveRoute, active);
        return;
      }
      if (control === 'action' || control === 'sprint') {
        input.setAction(control, active);
      }
    },
    onCare: (active) => {
      if (active) openCare();
    },
  });

  const carePanel = new CarePanel({
    mount: root,
    onClose: () => {
      hud.setCareMode(false);
      root.prepend(canvas);
      canvas.tabIndex = 0;
      world?.setContainer(root);
      controller?.setCameraFocus(null);
      controller?.setEnabled(started);
    },
    onInteraction: (type, payload) => {
      careSystem.syncSeal(gameState.luma);
      const result = careSystem.interact(type, payload);
      gameState.updateLuma(careSystem.seal);
      if (result.accepted) audio.playCue('care');
      carePanel.setSeal(gameState.luma);
      carePanel.setFeedback(result.feedback, { accepted: result.accepted });
      luma.userData.setMood?.(gameState.lumaMood.state);
      hud.showToast(result.feedback, {
        tone: result.accepted ? 'success' : 'warning',
        duration: 3200,
      });
      refreshDebug();
    },
  });

  function openCare() {
    controller?.setEnabled(false);
    controller?.setCameraFocus({});
    hud.setCareMode(true);
    carePanel.open(gameState.luma);
    const surface = carePanel.getSceneMount();
    surface.prepend(canvas);
    canvas.inert = false;
    canvas.removeAttribute('aria-hidden');
    canvas.tabIndex = -1;
    world.setContainer(surface);
  }

  world = new AelysScene({ canvas, container: root });
  const luma = createLumaProxy({ highDetail: !world.lowPower });
  world.getSpawnPosition(luma.position);
  world.add(luma);
  world.setProgress({
    echoIds: gameState.discoveredEchoIds,
    siteRestored: gameState.siteActivated,
  });

  controller = new GuardianController({
    object: luma,
    camera: world.camera,
    input,
    environment: world,
    initialEnergy: gameState.energy,
    initialOxygen: gameState.oxygen,
    onVitalsChange: ({ oxygen, energy, mode, forcedAscent }) => {
      hud.setVitals({
        oxygen,
        energy,
        mode: forcedAscent ? 'Remontee' : modeLabel(mode),
      });
      if (Math.abs(gameState.oxygen - oxygen) >= 0.4) gameState.setOxygen(oxygen);
      if (Math.abs(gameState.energy - energy) >= 0.4) gameState.setEnergy(energy);
    },
    onModeChange: () => refreshDebug(),
    onAction: handleWorldAction,
  });
  controller.setEnabled(false);

  function handleWorldAction(result) {
    if (!result.success) {
      const messages = {
        'out-of-range': "Aucun Echo ou Site Ancien n'est assez proche.",
        'too-far': "Approchez-vous encore un peu avant d'interagir.",
        'echoes-required': `Il manque ${result.missing ?? 3} Echo(s).`,
        'already-collected': 'Cet Echo a deja ete ecoute.',
        'already-restored': 'Le Site Ancien rayonne deja.',
      };
      hud.showToast(messages[result.reason] ?? "L'interaction n'est pas encore possible.", {
        tone: 'warning',
      });
      return;
    }

    const progress = questSystem.handleWorldInteraction(result);
    if (!progress.success) {
      hud.showToast('La progression a ete conservee, mais la quete doit etre verifiee.', {
        tone: 'warning',
      });
      return;
    }

    if (result.type === 'echo') {
      audio.playCue('echo');
      const names = {
        'echo-rivage': 'Le Rivage se souvient du premier passage.',
        'echo-lagune': 'La Lagune murmure une ancienne route.',
        'echo-profondeur': 'Une trace de la Fracture remonte des profondeurs.',
      };
      hud.showToast(names[result.id] ?? 'Un Echo rejoint la memoire de Luma.', {
        tone: 'success',
        duration: 3600,
      });
    } else if (result.type === 'site') {
      audio.playCue('site');
      hud.showToast("Le Premier Echo s'eveille. Le Grand Courant repond.", {
        tone: 'success',
        duration: 5200,
      });
    }
    syncProgressUI();
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      try {
        saveStore.save(gameState);
      } catch (error) {
        console.warn('[Seal Odyssey] Sauvegarde locale indisponible.', error);
        hud.showToast('Sauvegarde locale indisponible pour cette session.', {
          tone: 'warning',
        });
      }
    }, 650);
  }

  gameState.subscribe((change) => {
    scheduleSave();
    if (change.type === 'echo.discovered' || change.type === 'ancient-site.activated') {
      syncProgressUI();
    }
  });

  function syncProgressUI({ syncWorld = false } = {}) {
    hud.setEchoes(gameState.echoCount, gameState.requiredEchoCount);
    if (syncWorld) {
      world.setProgress({
        echoIds: gameState.discoveredEchoIds,
        siteRestored: gameState.siteActivated,
      });
    }
    const quest = questSystem.getQuest('onde-premiere');
    let objective = quest.currentStage?.title ?? 'Explorer Aqualys';
    if (gameState.siteActivated) objective = 'Le Premier Echo est restaure';
    setObjective(objective);
    refreshDebug();
  }

  function setObjective(label) {
    if (label === lastObjective) return;
    lastObjective = label;
    hud.setObjective(label);
  }

  function refreshDebug(patch = {}) {
    Object.assign(debugState, patch);
    const state = controller?.getState();
    hud.setDebug({
      Build: BUILD_ID,
      Domaine: BUILD_VERSION,
      Rendu: world?.quality ?? 'initialisation',
      Mode: state ? modeLabel(state.mode) : 'chargement',
      Entree: debugState.input,
      Sauvegarde: saveStore.usingFallback ? 'memoire temporaire' : 'locale versionnee',
      Luma: 'modèle procédural · fiche Luma',
      Confiance: `${Math.round(gameState.lumaTrust)}%`,
    });
  }

  function updateContextPrompt(elapsed) {
    if (elapsed - lastPromptCheck < 0.18 || !controller.enabled) return;
    lastPromptCheck = elapsed;
    const interaction = world.findInteraction(luma.position);
    if (interaction) {
      setObjective(interaction.label);
      return;
    }
    const quest = questSystem.getQuest('onde-premiere');
    if (gameState.siteActivated) setObjective('Le Premier Echo est restaure');
    else setObjective(quest.currentStage?.title ?? 'Explorer Aqualys');
  }

  hud.setSoundEnabled(!audio.muted);
  syncProgressUI({ syncWorld: true });
  luma.userData.setMood?.(gameState.lumaMood.state);
  hud.setBuildStatus(`P0 · v${APP_VERSION}`, 'warning');
  if (loadedState) {
    hud.showToast('Progression locale restauree.', { tone: 'success' });
  } else if (saveStore.lastError) {
    hud.showToast('Ancienne sauvegarde illisible : nouvelle partie locale.', {
      tone: 'warning',
    });
  }

  let previousTime = performance.now();
  let elapsed = 0;
  let animationFrame = 0;

  const frame = (time) => {
    const delta = Math.min((time - previousTime) / 1000, 0.05);
    previousTime = time;
    elapsed += delta;
    controller.update(delta);
    world.update(delta, elapsed);
    // Reuse a small payload: no audio nodes or buffers are allocated per frame.
    world.getAmbienceState(soundState);
    soundState.speed = controller.state.normalizedSpeed;
    audio.update(soundState, delta);
    updateContextPrompt(elapsed);
    world.render();
    animationFrame = requestAnimationFrame(frame);
  };
  animationFrame = requestAnimationFrame(frame);

  const persistNow = () => {
    window.clearTimeout(saveTimer);
    try {
      saveStore.save(gameState);
    } catch {
      // pagehide must remain best-effort and synchronous.
    }
  };
  window.addEventListener('pagehide', persistNow);
  const persistWhenHidden = () => {
    if (document.visibilityState === 'hidden') persistNow();
  };
  document.addEventListener('visibilitychange', persistWhenHidden);

  return () => {
    cancelAnimationFrame(animationFrame);
    window.clearTimeout(saveTimer);
    window.removeEventListener('pagehide', persistNow);
    document.removeEventListener('visibilitychange', persistWhenHidden);
    questSystem.dispose();
    carePanel.destroy();
    hud.destroy();
    controller.dispose({ disposeInput: true });
    audio.dispose();
    world.dispose();
    canvas.remove();
  };
}

function modeLabel(mode) {
  return {
    land: 'Rivage',
    surface: 'Surface',
    underwater: 'Plongee',
  }[mode] ?? 'Exploration';
}

try {
  const dispose = boot();
  if (import.meta.hot) import.meta.hot.dispose(dispose);
} catch (error) {
  console.error('[Seal Odyssey] Echec du demarrage.', error);
  root.innerHTML = `
    <main class="fatal-error" role="alert">
      <p>Fondation P0</p>
      <h1>La scene 3D ne peut pas demarrer.</h1>
      <p>Verifiez que WebGL est active, puis rechargez la page.</p>
      <pre></pre>
    </main>
  `;
  root.querySelector('pre').textContent = String(error?.message ?? error);
}
