import './styles.css';
import './ui/battle.css';
import './ui/islands.css';
import * as THREE from 'three';
import { IslandNavigator } from './ui/IslandNavigator.js';
import { ISLANDS, EXPLORATION_ENCOUNTERS, islandById } from './world/islandDefinitions.js';

import { BattleArena } from './combat/BattleArena.js';
import { ARENA_ILLUSTRATIONS } from './combat/arenaIllustrations.js';
import { CombatSystem } from './combat/CombatSystem.js';
const ENCOUNTERS = EXPLORATION_ENCOUNTERS;
import { EncounterDirector } from './combat/EncounterDirector.js';
import { BattlePanel } from './ui/BattlePanel.js';


import { AqualysAudio } from './audio/AqualysAudio.js';
import { CareSystem } from './care/CareSystem.js';
import { BUILD_VERSION, GameState } from './core/GameState.js';
import { SaveStore } from './persistence/SaveStore.js';
import { IslandController } from './player/IslandController.js';
import { InputController } from './player/InputController.js';
import { QuestSystem } from './quests/QuestSystem.js';
import { CarePanel } from './ui/CarePanel.js';
import createMobileHUD from './ui/MobileHUD.js';
import { IslandScene } from './world/IslandScene.js';


const APP_VERSION =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.8.0';
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
  canvas.setAttribute('aria-label', "Exploration d’Aqualys vue de haut");
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
  root.classList.add('island-exploration');
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
  let navigator;
  let worldReady = false;
  let travelling = false;
  let diveRoute = 'dive';
  let started = false;
  let pendingCare = false;
  let careActive = false;
  let battle = null;
  let battleArena = null;
  let battleBusy = false;
  let battleLoading = false;
  let disposed = false;
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
    requestFullscreen: false,
    requestLandscape: false,
    onStart: () => {
      if (started || !worldReady) return;
      started = true;
      if (!audio.muted) {
        // start() is called synchronously in the start-button user gesture.
        audio.start().then((ready) => {
          if (!ready) audio.setMuted(true);
          hud.setSoundEnabled(ready && !audio.muted);
        });
      }
      void preloadBattleIllustrations().catch(() => {});
      controller?.setEnabled(true);
      navigator?.setVisible(true);
      hud.setBuildStatus(`v${APP_VERSION}`, 'ready');
      hud.showToast('Bienvenue sur le Rivage d’Aelys. Explorez les chemins et les eaux.', { tone: 'success' });
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
      navigator?.setVisible(started);
      clearMovementInput();
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
    if(!started||!worldReady||travelling||battle||battleLoading||careActive)return;
    if (controller?.state.mode === 'land' && controller.state.jumpStage !== 'idle') {
      pendingCare = true;
      return;
    }
    pendingCare = false;
    careActive = true;
    navigator?.setVisible(false);
    clearMovementInput();
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

  function preloadBattleIllustrations() {
    battleArena??=new BattleArena({renderer:world.renderer,lowPower:world.lowPower,environment:world.scene.environment});
    return battleArena.loadIllustrations(ARENA_ILLUSTRATIONS,{baseUrl:import.meta.env.BASE_URL});
  }

  async function openCombat(encounter) {
    if(!started||!worldReady||travelling||battle||battleLoading||careActive||!controller.enabled||controller.state.jumpStage!=='idle')return;
    battleLoading=true;
    navigator?.setVisible(false);
    encounterDirector.suppressUntilExit(encounter.id);
    pendingCare=false;controller.setEnabled(false);clearMovementInput();
    setObjective('Le décor de la rencontre se prépare…');
    hud.showToast('La rencontre se prépare…',{duration:10000});
    canvas.setAttribute('aria-busy','true');
    try {
      await preloadBattleIllustrations();
      if(disposed)return;
      activeEncounter=encounter;
      hud.setVisible(false);
      canvas.tabIndex=-1;canvas.style.pointerEvents='none';
      canvas.setAttribute('aria-label','Arène de la rencontre : '+encounter.name);
      battle=new CombatSystem({encounterId:encounter.id,lumaTrust:gameState.lumaTrust});
      battleArena.open(encounter);
      battleWidth=root.clientWidth;battleHeight=root.clientHeight;
      battleArena.resize(battleWidth,battleHeight);
      battlePanel.element.dataset.battleArt=battleArena.illustrated?'illustrated':'procedural';
      battlePanel.open({encounter,state:battle.getState()});
      audio.playCue('echo');
    } catch {
      if(!disposed){
        battle=null;activeEncounter=null;controller.setEnabled(started);clearMovementInput();navigator?.setVisible(started);
        hud.setVisible(true);
        hud.showToast('Le décor n’a pas pu être chargé. Revenez vers le courant pour réessayer.',{tone:'warning',duration:6500});
        syncProgressUI();
      }
    } finally {
      battleLoading=false;canvas.removeAttribute('aria-busy');
    }
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
    world.setResolvedEncounterIds(encounterDirector.resolved);
    audio.playCue('site');
  }

  function closeCombat() {
    if(!battle||battleBusy||battle.getState().status==='active')return;
    const status=battle.getState().status;
    battlePanel.close();battleArena.close();
    battle=null;activeEncounter=null;clearMovementInput();navigator?.setVisible(started);
    canvas.tabIndex=0;canvas.style.pointerEvents='';
    canvas.setAttribute('aria-label',"Exploration d’Aqualys vue de haut");
    hud.setVisible(true);controller.setEnabled(started);
    canvas.focus({preventScroll:true});
    syncProgressUI();
    hud.showToast(status==='victory'?'Le courant est apaisé. Luma garde le souvenir de votre complicité.':
      status==='defeat'?'Luma reprend son souffle. Vous pouvez préparer une autre approche.':
      'Vous reprenez l’exploration en sécurité.',{tone:status==='victory'?'success':'info',duration:4000});
  }

  world = new IslandScene({ canvas, container: root });
  const luma = new THREE.Group();
  luma.name = 'Luma · exploration illustrée';
  world.getSpawnPosition(luma.position);
  world.add(luma);
  world.setResolvedEncounterIds(encounterDirector.resolved);
  world.setProgress({ echoIds:gameState.discoveredEchoIds,siteRestored:gameState.siteActivated });
  navigator = new IslandNavigator({mount:root,islands:ISLANDS,onTravel:travelToIsland});
  navigator.setIsland('rivage');
  navigator.setProgress({echoIds:gameState.discoveredEchoIds,siteRestored:gameState.siteActivated});
  navigator.setVisible(false);

  controller = new IslandController({
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
    onMotion: type => audio.playCue(type==='dive'||type==='surface'?'splash':type),
    onAction: handleWorldAction,
  });
  controller.state.heading=Math.PI;
  controller.setEnabled(false);

  function clearMovementInput() {
    input.setMove(0,0);input.setLook(0,0);
    for(const name of ['action','dive','ascend','sprint'])input.setAction(name,false);
    input.reset();
  }

  function travelToIsland(id) {
    if(!started||!worldReady||disposed||battle||battleLoading||careActive||travelling)return;
    const island=islandById(id);
    if(!island||world.activeIsland.id===id)return;
    travelling=true;pendingCare=false;controller.setEnabled(false);clearMovementInput();
    navigator.setBusy(true);
    if(world.setIsland(id)){
      world.getSpawnPosition(luma.position);
      controller.teleport(luma.position);
      navigator.setIsland(id);
      hud.setMovementMode(controller.state.mode);
      syncProgressUI();
      hud.showToast(island.name,{tone:'success'});
      canvas.dispatchEvent(new CustomEvent('seal:island-change',{bubbles:true,detail:{id}}));
    }
    travelling=false;navigator.setBusy(false);controller.setEnabled(started);
    canvas.focus({preventScroll:true});
  }

  const startButton=hud.refs.start;
  const startMarkup=startButton.innerHTML;
  startButton.disabled=true;
  startButton.textContent='Les îles se préparent…';
  const finishWorldLoading=()=>{
    if(disposed)return;
    worldReady=true;
    world.getSpawnPosition(luma.position);
    controller.teleport(luma.position);
    hud.setMovementMode(controller.state.mode);
    startButton.disabled=false;startButton.innerHTML=startMarkup;
    canvas.dataset.worldArt='overworld';
    hud.setBuildStatus(`v${APP_VERSION}`,'ready');
  };
  world.ready.then(finishWorldLoading).catch(()=>{
    if(disposed)return;
    startButton.disabled=false;startButton.textContent='Réessayer le chargement';
    startButton.addEventListener('click',()=>window.location.reload(),{once:true});
    hud.showToast('Une île n’a pas pu être chargée. Réessayez pour poursuivre.',{tone:'warning',duration:15000});
  });

  // Semantic movement events also support bounded browser integration checks.
  function emitMotionState(state) {
    canvas.dispatchEvent(new CustomEvent('seal:motion-state', {bubbles:true,detail:{
      islandId:world.activeIsland.id,heading:state.heading,mode:state.mode,jumpStage:state.jumpStage,jumpPhase:state.jumpPhase,
      jumpHeight:state.jumpHeight,grounded:state.grounded,
      x:luma.position.x,y:luma.position.y,z:luma.position.z,
    }}));
  }

  function handleWorldAction(result) {
    if(!result)return;
    const encounter=encounterDirector.getNearby(luma.position);
    if (!result.success) {
      if(encounter){openCombat(encounter);return;}
      const messages = {
        'out-of-range': "Aucun Echo ou Site Ancien n'est assez proche.",
        'too-far': "Approchez-vous encore un peu avant d'interagir.",
        'echoes-required': `Il manque ${result.missing ?? 3} Echo(s).`,
        'already-collected': 'Cet Echo a deja ete ecoute.',
        'already-restored': 'Le Site Ancien rayonne deja.',
        'dive-required': 'Cet Écho attend sous la surface : plongez avec Q ou le bouton Plonger.',
      };
      hud.showToast(messages[result.reason] ?? "L'interaction n'est pas encore possible.", {
        tone: 'warning',
      });
      return;
    }

    if (result.type === 'scenery') {
      hud.showToast(result.text,{duration:5000});
      if(result.travelTo)queueMicrotask(()=>travelToIsland(result.travelTo));
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
    // Coalesce continuous vitals without postponing progress indefinitely.
    if (saveTimer) return;
    saveTimer = window.setTimeout(() => {
      saveTimer = 0;
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
    navigator?.setProgress({echoIds:gameState.discoveredEchoIds,siteRestored:gameState.siteActivated});
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
      Luma: 'poses originales · exploration vue de haut',
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
  hud.setBuildStatus(`v${APP_VERSION}`, 'warning');
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
    saveTimer = 0;
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
    disposed=true;
    cancelAnimationFrame(animationFrame);
    window.clearTimeout(saveTimer);
    window.removeEventListener('pagehide', persistNow);
    document.removeEventListener('visibilitychange', persistWhenHidden);
    questSystem.dispose();
    carePanel.destroy();
    battlePanel.destroy();battleArena?.dispose();
    hud.destroy();
    controller.dispose({ disposeInput: true });
    navigator?.destroy();
    root.classList.remove('island-exploration');
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
      <h1>L’exploration ne peut pas démarrer.</h1>
      <p>Verifiez que WebGL est active, puis rechargez la page.</p>
      <pre></pre>
    </main>
  `;
  root.querySelector('pre').textContent = String(error?.message ?? error);
}
