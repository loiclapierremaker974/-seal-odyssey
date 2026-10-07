import './styles.css';
import './ui/battle.css';

import { BattleArena } from './combat/BattleArena.js';
import { CombatSystem } from './combat/CombatSystem.js';
import { ENCOUNTERS } from './combat/encounters.js';
import { EncounterDirector } from './combat/EncounterDirector.js';
import { BattlePanel } from './ui/BattlePanel.js';
import { createEncounterMarkers } from './world/createEncounterMarkers.js';

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
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.6.0';
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
  let pendingCare = false;
  let careActive = false;
  let battle = null;
  let battleArena = null;
  let battleBusy = false;
  let activeEncounter = null;
  let battleWidth = 0, battleHeight = 0;
  const encounterDirector = new EncounterDirector({encounters:ENCOUNTERS,
    resolvedIds:gameState.luma.memory.events.filter(e=>e?.type==='current-appeased').map(e=>e.encounterId),
  });
  let motionTimer = 0;
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
      careActive = false;
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
    if(battle)return;
    if (controller?.state.mode === 'land' && controller.state.jumpStage !== 'idle') {
      pendingCare = true;
      return;
    }
    pendingCare = false;
    careActive = true;
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

  const battlePanel = new BattlePanel({
    mount:root,
    onAction:actionId=>{
      if(!battle||battleBusy)return;
      presentCombatResult(battle.act(actionId));
    },
    onRetreat:()=>{
      if(!battle||battleBusy)return;
      presentCombatResult(battle.retreat());
    },
    onClose:closeCombat,
  });

  function openCombat(encounter) {
    if(!started||battle||careActive||!controller.enabled||controller.state.jumpStage!=='idle')return;
    activeEncounter=encounter;
    encounterDirector.suppressUntilExit(encounter.id);
    pendingCare=false;
    controller.setEnabled(false);input.reset();
    hud.setVisible(false);
    canvas.tabIndex=-1;canvas.style.pointerEvents='none';
    canvas.setAttribute('aria-label','Arène de la rencontre : '+encounter.name);
    battle=new CombatSystem({encounterId:encounter.id,lumaTrust:gameState.lumaTrust});
    battleArena??=new BattleArena({renderer:world.renderer,lowPower:world.lowPower,environment:world.scene.environment});
    battleArena.open(encounter);
    battleWidth=root.clientWidth;battleHeight=root.clientHeight;
    battleArena.resize(battleWidth,battleHeight);
    battlePanel.open({encounter,state:battle.getState()});
    audio.playCue('echo');
  }

  function presentCombatResult(result) {
    if(!result.accepted){
      battlePanel.setState(battle.getState(),{feedback:'Cette action est indisponible pour ce tour.'});
      return;
    }
    battleBusy=true;
    const feedback=result.events.map(e=>e.message||e.text||'').filter(Boolean).slice(-2).join(' ');
    battlePanel.setState(result.state,{busy:true,feedback,events:result.events});
    const action=result.events.find(e=>e.actor==='luma'&&e.actionId)?.actionId;
    audio.playCue(['swift-wave','strong-wave'].includes(action)?'splash':'care');
    battleArena.play(result.events,()=>{
      if(!battle)return;
      battleBusy=false;
      if(result.state.status==='victory')rememberEncounter();
      battlePanel.setState(result.state,{busy:false,feedback,events:result.events});
    });
  }

  function rememberEncounter() {
    const data=gameState.luma;
    if(data.memory.events.some(e=>e?.type==='current-appeased'&&e.encounterId===activeEncounter.id))return;
    data.memory.events.push({type:'current-appeased',encounterId:activeEncounter.id});
    data.relationships.guardianTrust=Math.min(100,data.relationships.guardianTrust+(activeEncounter.reward?.trust??3));
    data.mood.confidence=Math.min(100,data.mood.confidence+(activeEncounter.reward?.confidence??4));
    data.mood.state='determined';
    gameState.updateLuma(data);
    luma.userData.setMood?.(gameState.lumaMood.state);
    encounterDirector.markResolved(activeEncounter.id);
    encounterMarkers.userData.setResolved(encounterDirector.resolved);
    audio.playCue('site');
  }

  function closeCombat() {
    if(!battle||battleBusy||battle.getState().status==='active')return;
    const status=battle.getState().status;
    battlePanel.close();battleArena.close();
    battle=null;activeEncounter=null;input.reset();
    canvas.tabIndex=0;canvas.style.pointerEvents='';
    canvas.setAttribute('aria-label',"Vue 3D du Rivage d'Aelys");
    hud.setVisible(true);controller.setEnabled(started);
    canvas.focus({preventScroll:true});
    syncProgressUI();
    hud.showToast(status==='victory'?'Le courant est apaisé. Luma garde le souvenir de votre complicité.':
      status==='defeat'?'Luma reprend son souffle. Vous pouvez préparer une autre approche.':
      'Vous reprenez l’exploration en sécurité.',{tone:status==='victory'?'success':'info',duration:4000});
  }

  world = new AelysScene({ canvas, container: root });
  const luma = createLumaProxy({ highDetail: !world.lowPower });
  world.getSpawnPosition(luma.position);
  world.add(luma);
  const encounterMarkers=createEncounterMarkers(ENCOUNTERS,{sampleEnvironment:p=>world.getEnvironmentAt(p)});
  encounterMarkers.userData.setResolved(encounterDirector.resolved);
  world.scene.add(encounterMarkers);
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
    onModeChange: mode => { hud.setMovementMode(mode); refreshDebug(); },
    onStateChange: state => { hud.setMovementMode(state.mode); emitMotionState(state); },
    onMotion: type => audio.playCue(type),
    onAction: handleWorldAction,
  });
  controller.setEnabled(false);

  // Semantic movement events also support bounded browser integration checks.
  function emitMotionState(state) {
    canvas.dispatchEvent(new CustomEvent('seal:motion-state', {bubbles:true,detail:{
      mode:state.mode,jumpStage:state.jumpStage,jumpPhase:state.jumpPhase,
      jumpHeight:state.jumpHeight,grounded:state.grounded,
      x:luma.position.x,y:luma.position.y,z:luma.position.z,
    }}));
  }

  function handleWorldAction(result) {
    const encounter=encounterDirector.getNearby(luma.position);
    if (!result.success) {
      if(encounter){openCombat(encounter);return;}
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
    if(encounter)openCombat(encounter);
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
    const encounter=encounterDirector.getNearby(luma.position);
    if(encounter){setObjective('Rencontre : '+encounter.name);return;}
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
    if(battle){
      const width=root.clientWidth,height=root.clientHeight;
      if(width!==battleWidth||height!==battleHeight){
        battleWidth=width;battleHeight=height;battleArena.resize(width,height);
      }
      battleArena.update(delta);battlePanel.setFloatingNumbers?.(battleArena.floats);battleArena.render();
      soundState.speed=0;audio.update(soundState,delta);
      animationFrame=requestAnimationFrame(frame);
      return;
    }
    elapsed += delta;
    controller.update(delta);
    motionTimer += delta;
    if ((controller.state.jumpStage !== 'idle' || controller.state.moving) && motionTimer >= .08) {
      motionTimer = 0;
      emitMotionState(controller.state);
    }
    if (pendingCare && controller.state.jumpStage === 'idle') openCare();
    const encounter=encounterDirector.update(luma.position,{enabled:started&&controller.enabled,
      airborne:controller.state.airborne,jumpStage:controller.state.jumpStage});
    if(encounter)openCombat(encounter);
    encounterMarkers.userData.update(elapsed);
    world.update(delta, elapsed);
    world.updateLumaMotion(luma.position, controller.state, delta, controller.enabled);
    // Reuse a small payload: no audio nodes or buffers are allocated per frame.
    world.getAmbienceState(soundState);
    soundState.speed = controller.enabled ? controller.state.normalizedSpeed : 0;
    audio.update(soundState, delta);
    updateContextPrompt(elapsed);
    if(battle){battleArena.update(delta);battleArena.render();}else world.render();
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
    battlePanel.destroy();battleArena?.dispose();
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
