import * as THREE from 'three';
import { resolveCoastalMovement } from './coastalCollision.js';
import { createAelysBackdrop } from './createAelysBackdrop.js';
import { createAelysWater } from './createAelysWater.js';
import {
  ECHOES,
  INTERACTION,
  RENDER,
  WORLD,
} from '../config/gameplay.js';

const SKY_COLOUR = new THREE.Color(0x8dd6d5);
const DEEP_COLOUR = new THREE.Color(0x062f42);
const FOG_SURFACE = new THREE.Color(0x80cac7);
const FOG_DEEP = new THREE.Color(0x07364a);

function smoothstep(minimum, maximum, value) {
  const ratio = THREE.MathUtils.clamp((value - minimum) / (maximum - minimum), 0, 1);
  return ratio * ratio * (3 - 2 * ratio);
}

function seededRandom(seed = 1) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function disposeMaterial(material) {
  for (const value of Object.values(material)) {
    if (value?.isTexture) value.dispose();
  }
  material.dispose();
}

/**
 * Deterministic terrain query shared by rendering and player movement.
 * The broad shelf creates the Rivage d'Aelys while the outer falloff becomes
 * the Lagune des Murmures and its accessible seabed.
 */
export function getAelysTerrainHeight(x, z) {
  const dx = x - WORLD.islandCenter.x;
  const dz = z - WORLD.islandCenter.z;
  const angle = Math.atan2(dz, dx);
  const distortion = 1 + Math.sin(angle * 3 + 0.7) * 0.09 + Math.cos(angle * 5) * 0.045;
  const distance = Math.hypot(dx * 0.94, dz * 1.05) / distortion;
  const islandMask = 1 - smoothstep(5.15, 10.25, distance);
  const broadRipple = Math.sin(x * 0.31) * Math.cos(z * 0.24) * 0.13;
  const fineRipple = Math.sin((x + z) * 0.72) * 0.045;
  const relief = broadRipple * (0.25 + islandMask * 0.75) + fineRipple;
  return THREE.MathUtils.lerp(WORLD.seaFloor, 1.48, islandMask) + relief;
}

function terrainColour(height) {
  if (height > 0.82) return new THREE.Color(0xcbb992);
  if (height > 0.08) return new THREE.Color(0xd2bd92);
  if (height > -1.35) return new THREE.Color(0x698c82);
  if (height > -3.2) return new THREE.Color(0x426e6e);
  return new THREE.Color(0x294f5c);
}

function createTerrain(quality) {
  const segments = quality === 'low' ? 46 : 72;
  const geometry = new THREE.PlaneGeometry(WORLD.size, WORLD.size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colours = [];
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    const height = getAelysTerrainHeight(x, z);
    positions.setY(index, height);
    const colour = terrainColour(height);
    colours.push(colour.r, colour.g, colour.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.03,
  });
  const terrain = new THREE.Mesh(geometry, material);
  terrain.name = 'Aelys terrain and seabed';
  terrain.receiveShadow = true;
  return terrain;
}

function createWater(quality) {
  return createAelysWater({
    size: WORLD.size,
    waterLevel: WORLD.waterLevel,
    terrainHeight: getAelysTerrainHeight,
    lowPower: quality === 'low',
  });
}

function createSky() {
  const geometry = new THREE.SphereGeometry(78, 24, 14);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x548caf) },
      uHorizon: { value: new THREE.Color(0xd4e1df) },
      uWarm: { value: new THREE.Color(0xf3c28f) },
    },
    vertexShader: `
      varying vec3 vPosition;
      void main() {
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uWarm;
      varying vec3 vPosition;
      void main() {
        float height = normalize(vPosition).y;
        float blend = smoothstep(-.08, .72, height);
        vec3 colour = mix(uHorizon, uTop, blend);
        float sunset = pow(max(0.0, 1.0 - abs(height) * 3.2), 5.0) * .22;
        gl_FragColor = vec4(mix(colour, uWarm, sunset), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const sky = new THREE.Mesh(geometry, material);
  sky.name = 'Aelys procedural sky';
  sky.frustumCulled = false;
  return sky;
}

function createEcho(definition, lowPower) {
  const group = new THREE.Group();
  group.name = definition.name;
  group.position.set(
    definition.position.x,
    definition.position.y,
    definition.position.z,
  );
  if (getAelysTerrainHeight(group.position.x, group.position.z) > WORLD.waterLevel) {
    group.position.y = Math.max(
      group.position.y,
      getAelysTerrainHeight(group.position.x, group.position.z) + 0.78,
    );
  }

  const colour = new THREE.Color(definition.colour);
  const coreMaterial = new THREE.MeshStandardMaterial({
    color: colour.clone().multiplyScalar(0.78),
    emissive: colour,
    emissiveIntensity: 1.7,
    roughness: 0.24,
    metalness: 0.12,
  });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), coreMaterial);
  core.name = `${definition.name} core`;
  group.add(core);

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: colour,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.026, 7, 30), ringMaterial);
  const ringB = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.018, 7, 26), ringMaterial.clone());
  ringA.rotation.x = Math.PI / 2;
  ringB.rotation.y = Math.PI / 2;
  group.add(ringA, ringB);

  const haloMaterial = new THREE.MeshBasicMaterial({
    color: colour,
    transparent: true,
    opacity: 0.12,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.66, 16, 10), haloMaterial);
  group.add(halo);

  if (!lowPower) {
    const light = new THREE.PointLight(colour, 1.25, 4.2, 2);
    light.name = `${definition.name} light`;
    group.add(light);
  }

  group.userData = {
    ...group.userData,
    kind: 'echo',
    id: definition.id,
    label: definition.name,
    collected: false,
    collectProgress: 0,
    baseY: group.position.y,
    phase: definition.position.x * 0.7 + definition.position.z * 0.31,
    core,
    ringA,
    ringB,
    halo,
  };
  return group;
}

function createAncientSite(lowPower) {
  const site = new THREE.Group();
  site.name = 'Site Ancien - Onde Premiere';
  site.position.set(
    WORLD.ancientSite.x,
    getAelysTerrainHeight(WORLD.ancientSite.x, WORLD.ancientSite.z) + 0.06,
    WORLD.ancientSite.z,
  );

  const stoneMaterial = new THREE.MeshStandardMaterial({
    color: 0x355f62,
    emissive: 0x143f42,
    emissiveIntensity: 0.16,
    roughness: 0.78,
    metalness: 0.12,
  });
  const glyphMaterial = new THREE.MeshBasicMaterial({
    color: 0x7cf6e3,
    transparent: true,
    opacity: 0.2,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(2.75, 3.05, 0.32, 12),
    stoneMaterial,
  );
  platform.name = 'Ancient Site living-stone platform';
  platform.position.y = 0.06;
  platform.receiveShadow = true;
  site.add(platform);

  const floorRing = new THREE.Mesh(
    new THREE.TorusGeometry(2.13, 0.085, 8, 56),
    glyphMaterial,
  );
  floorRing.rotation.x = Math.PI / 2;
  floorRing.position.y = 0.25;
  site.add(floorRing);

  const innerRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.22, 0.055, 7, 44),
    glyphMaterial.clone(),
  );
  innerRing.rotation.x = Math.PI / 2;
  innerRing.position.y = 0.27;
  site.add(innerRing);

  const pillars = [];
  const pillarGeometry = new THREE.CylinderGeometry(0.16, 0.34, 2.9, 7, 2);
  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * Math.PI * 2;
    const targetPosition = new THREE.Vector3(
      Math.cos(angle) * 2.12,
      1.52,
      Math.sin(angle) * 2.12,
    );
    const restoredQuaternion = new THREE.Quaternion();
    const brokenPosition = targetPosition.clone().setY(0.48 + (index % 2) * 0.18);
    brokenPosition.x += Math.sin(index * 2.3) * 0.28;
    brokenPosition.z += Math.cos(index * 1.7) * 0.24;
    const brokenEuler = new THREE.Euler(
      Math.sin(index) * 0.62,
      angle * 0.18,
      (index % 2 ? 1 : -1) * (0.64 + index * 0.035),
    );
    const brokenQuaternion = new THREE.Quaternion().setFromEuler(brokenEuler);
    const pillar = new THREE.Mesh(pillarGeometry, stoneMaterial);
    pillar.name = `Ancient Site current rib ${index + 1}`;
    pillar.position.copy(brokenPosition);
    pillar.quaternion.copy(brokenQuaternion);
    pillar.castShadow = true;
    pillar.userData.brokenPosition = brokenPosition;
    pillar.userData.restoredPosition = targetPosition;
    pillar.userData.brokenQuaternion = brokenQuaternion;
    pillar.userData.restoredQuaternion = restoredQuaternion;
    pillars.push(pillar);
    site.add(pillar);
  }

  const crown = new THREE.Mesh(
    new THREE.TorusGeometry(2.14, 0.13, 8, 56),
    stoneMaterial,
  );
  crown.name = 'Ancient Site restored crown';
  crown.rotation.x = Math.PI / 2;
  crown.position.y = 2.92;
  crown.scale.setScalar(0.72);
  site.add(crown);

  const coreMaterial = new THREE.MeshStandardMaterial({
    color: 0x478b8a,
    emissive: 0x62ffe6,
    emissiveIntensity: 0.18,
    roughness: 0.3,
  });
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.43, 1), coreMaterial);
  core.name = 'Onde Premiere resonator';
  core.position.y = 0.78;
  site.add(core);

  const beamMaterial = new THREE.MeshBasicMaterial({
    color: 0x8fffea,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.72, 8, lowPower ? 12 : 20, 1, true),
    beamMaterial,
  );
  beam.name = 'Restored current beam';
  beam.position.y = 4.4;
  site.add(beam);

  site.userData = {
    ...site.userData,
    kind: 'ancient-site',
    id: WORLD.ancientSiteId,
    restored: false,
    restoration: 0,
    restorationTarget: 0,
    pillars,
    floorRing,
    innerRing,
    crown,
    core,
    beam,
    stoneMaterial,
    glyphMaterials: [floorRing.material, innerRing.material],
  };
  return site;
}

function createFish(random, index) {
  const group = new THREE.Group();
  group.name = `Lagoon fish ${index + 1}`;
  const colour = new THREE.Color().setHSL(0.48 + random() * 0.1, 0.44, 0.45 + random() * 0.16);
  const material = new THREE.MeshStandardMaterial({
    color: colour,
    roughness: 0.45,
    metalness: 0.12,
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), material);
  body.scale.set(0.34, 0.14, 0.13);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.28, 3), material);
  tail.position.x = -0.37;
  tail.rotation.z = -Math.PI / 2;
  tail.scale.z = 0.42;
  group.add(body, tail);
  group.userData = {
    orbitRadius: 2.2 + random() * 3.9,
    orbitSpeed: 0.16 + random() * 0.19,
    orbitOffset: random() * Math.PI * 2,
    baseY: -1.1 - random() * 2.6,
    centreX: (random() - 0.5) * 7,
    centreZ: -3 - random() * 8,
    tail,
  };
  return group;
}

/**
 * Owns the complete no-asset Aelys P0 scene and its interaction state.
 *
 * Construction exposes `scene`, `camera`, `renderer`, and `canvas`.  Main-loop
 * consumers call `update(delta, elapsed)` then `render()`.  Gameplay consumers
 * use `getEnvironmentAt`, `findInteraction`, `interact`, `setProgress`, and
 * `getProgress`.  `dispose()` releases GPU resources and resize observers.
 */
export class AelysScene {
  constructor({
    canvas,
    container,
    quality = 'auto',
    pixelRatioCap,
    onEchoCollected,
    onSiteActivated,
    onProgressChange,
  } = {}) {
    const documentRef = canvas?.ownerDocument || globalThis.document;
    if (!canvas && !documentRef) {
      throw new Error('AelysScene requires a canvas or browser document.');
    }
    this.container = container || canvas?.parentElement || documentRef.body;
    this.canvas = canvas || documentRef.createElement('canvas');
    this._ownsCanvas = !canvas;
    if (this._ownsCanvas) this.container.append(this.canvas);

    this.window = documentRef.defaultView || globalThis.window;
    const coarsePointer = this.window?.matchMedia?.('(pointer: coarse)').matches;
    const navigatorRef = this.window?.navigator || globalThis.navigator;
    const lowHardware = (navigatorRef?.deviceMemory && navigatorRef.deviceMemory <= 4)
      || (navigatorRef?.hardwareConcurrency && navigatorRef.hardwareConcurrency <= 4);
    this.isMobile = Boolean(coarsePointer || /iPhone|iPad|Android/i.test(navigatorRef?.userAgent || ''));
    this.quality = quality === 'auto'
      ? (this.isMobile || lowHardware ? 'low' : 'high')
      : quality;
    this.lowPower = this.quality === 'low';
    this.pixelRatioCap = pixelRatioCap || (
      lowHardware
        ? RENDER.lowPowerPixelRatioCap
        : this.isMobile
          ? RENDER.mobilePixelRatioCap
          : RENDER.desktopPixelRatioCap
    );

    this.callbacks = { onEchoCollected, onSiteActivated, onProgressChange };
    this.elapsed = 0;
    this._disposed = false;
    this._underwaterMix = 0;
    this._kelp = [];
    this._fish = [];

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.lowPower ? RENDER.mobileAntialias : RENDER.desktopAntialias,
      alpha: false,
      depth: true,
      stencil: false,
      powerPreference: this.lowPower ? 'default' : 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(this.window?.devicePixelRatio || 1, this.pixelRatioCap));
    if ('outputColorSpace' in this.renderer && THREE.SRGBColorSpace) {
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = !this.lowPower;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.name = 'Aelys - Onde Premiere vertical slice';
    this.scene.background = SKY_COLOUR.clone();
    this.scene.fog = new THREE.FogExp2(FOG_SURFACE.clone(), 0.017);
    this.camera = new THREE.PerspectiveCamera(
      RENDER.fieldOfView,
      1,
      RENDER.cameraNear,
      RENDER.cameraFar,
    );
    this.camera.name = 'Guardian follow camera';

    this._buildWorld();
    this.resize();
    if (globalThis.ResizeObserver && this.container) {
      this._resizeObserver = new ResizeObserver(() => this.resize());
      this._resizeObserver.observe(this.container);
    } else {
      this._resizeHandler = () => this.resize();
      this.window?.addEventListener('resize', this._resizeHandler);
    }
  }

  _buildWorld() {
    this.sky = createSky();
    
    this.scene.add(this.sky);
    const reflectionScene = new THREE.Scene();
    const reflectionSky = createSky();
    reflectionScene.add(reflectionSky);
    const reflectedSun = new THREE.Mesh(new THREE.SphereGeometry(3.8, 12, 8),
      new THREE.MeshBasicMaterial({color:0xffe8be}));
    reflectedSun.position.set(-35,25,-54);reflectionScene.add(reflectedSun);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this._reflectionTarget = pmrem.fromScene(reflectionScene, .025, .1, 150);
    this.scene.environment = this._reflectionTarget.texture;
    pmrem.dispose();
    reflectionScene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
    this.backdrop = createAelysBackdrop({highDetail:!this.lowPower});
    this.scene.add(this.backdrop);


    const hemisphere = new THREE.HemisphereLight(0xc8e5ed, 0x605543, 1.65);
    hemisphere.name = 'Aelys sky fill';
    this.scene.add(hemisphere);

    const sunlight = new THREE.DirectionalLight(0xffe2b3, 2.45);
    sunlight.name = 'Aelys low sun';
    sunlight.position.set(-14, 10, -21.6);
    sunlight.castShadow = !this.lowPower;
    sunlight.shadow.mapSize.set(RENDER.shadowMapSize, RENDER.shadowMapSize);
    sunlight.shadow.camera.left = -14;
    sunlight.shadow.camera.right = 14;
    sunlight.shadow.camera.top = 14;
    sunlight.shadow.camera.bottom = -14;
    sunlight.shadow.camera.near = 2;
    sunlight.shadow.camera.far = 45;
    this.scene.add(sunlight);
    this.sunlight = sunlight;

    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(2.4, 16, 10),
      new THREE.MeshBasicMaterial({ color: 0xffdfad, fog: false }),
    );
    sun.name = 'Aelys sun';
    sun.position.set(-35, 25, -54);
    this.scene.add(sun);

    this.terrain = createTerrain(this.quality);
    this.scene.add(this.terrain);
    this._createRocksAndPlants();
    this._createMarineLife();

    this.water = createWater(this.quality);
    this.scene.add(this.water);

    this.echoes = new Map();
    for (const definition of ECHOES) {
      const echo = createEcho(definition, this.lowPower);
      this.echoes.set(definition.id, echo);
      this.scene.add(echo);
    }

    this.ancientSite = createAncientSite(this.lowPower);
    this.scene.add(this.ancientSite);
  }

  _createRocksAndPlants() {
    const random = seededRandom(1087);
    const rockMaterial = new THREE.MeshStandardMaterial({
      color: 0x556d68,
      roughness: 0.92,
      metalness: 0.03,
    });
    const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
    const rockCount = this.lowPower ? 17 : 29;
    const rockMesh = new THREE.InstancedMesh(rockGeometry, rockMaterial, rockCount);
    rockMesh.name = 'Aelys shoreline rocks';
    const transform = new THREE.Object3D();
    for (let index = 0; index < rockCount; index += 1) {
      const angle = random() * Math.PI * 2;
      const radius = 5.6 + random() * 5.8;
      const x = Math.cos(angle) * radius;
      const z = WORLD.islandCenter.z + Math.sin(angle) * radius;
      transform.position.set(x, getAelysTerrainHeight(x, z) + 0.2, z);
      transform.rotation.set(random() * 0.45, random() * Math.PI, random() * 0.3);
      const size = 0.28 + random() * 0.8;
      transform.scale.set(size * (0.7 + random() * 0.65), size, size * (0.65 + random() * 0.7));
      transform.updateMatrix();
      rockMesh.setMatrixAt(index, transform.matrix);
    }
    rockMesh.castShadow = !this.lowPower;
    rockMesh.receiveShadow = true;
    this.scene.add(rockMesh);

    const kelpMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d8c75,
      emissive: 0x0b3e36,
      emissiveIntensity: 0.18,
      roughness: 0.82,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.88,
    });
    const kelpGeometry = new THREE.PlaneGeometry(0.22, 1.5, 1, 3);
    kelpGeometry.translate(0, 0.75, 0);
    const patchCount = this.lowPower ? 12 : 22;
    for (let index = 0; index < patchCount; index += 1) {
      const angle = random() * Math.PI * 2;
      const radius = 7 + random() * 14;
      const x = Math.cos(angle) * radius;
      const z = WORLD.islandCenter.z + Math.sin(angle) * radius;
      const ground = getAelysTerrainHeight(x, z);
      if (ground > -0.35) continue;
      const patch = new THREE.Group();
      patch.name = 'Lumiflore kelp patch';
      patch.position.set(x, ground, z);
      for (let bladeIndex = 0; bladeIndex < 3; bladeIndex += 1) {
        const blade = new THREE.Mesh(kelpGeometry, kelpMaterial);
        blade.position.x = (bladeIndex - 1) * 0.19;
        blade.rotation.y = random() * Math.PI;
        blade.scale.y = 0.62 + random() * 0.75;
        patch.add(blade);
      }
      patch.userData.phase = random() * Math.PI * 2;
      patch.userData.strength = 0.04 + random() * 0.09;
      this._kelp.push(patch);
      this.scene.add(patch);

      if (!this.lowPower && index % 3 === 0) {
        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.08, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0x6af7d0 }),
        );
        bulb.position.set(x + 0.17, ground + 1.25, z - 0.12);
        this.scene.add(bulb);
      }
    }

    const shrubMaterial = new THREE.MeshStandardMaterial({
      color: 0x6d9270,
      roughness: 0.88,
    });
    const shrubGeometry = new THREE.ConeGeometry(0.22, 0.74, 5);
    const shrubCount = this.lowPower ? 16 : 30;
    const shrubs = new THREE.InstancedMesh(shrubGeometry, shrubMaterial, shrubCount);
    shrubs.name = 'Rivage d Aelys vegetation';
    let written = 0;
    while (written < shrubCount) {
      const angle = random() * Math.PI * 2;
      const radius = 1.1 + random() * 5.2;
      const x = Math.cos(angle) * radius;
      const z = WORLD.islandCenter.z + Math.sin(angle) * radius;
      const y = getAelysTerrainHeight(x, z);
      if (y < 0.25) continue;
      transform.position.set(x, y + 0.3, z);
      transform.rotation.set(0, random() * Math.PI, (random() - 0.5) * 0.2);
      const size = 0.62 + random() * 0.9;
      transform.scale.set(size, size, size);
      transform.updateMatrix();
      shrubs.setMatrixAt(written, transform.matrix);
      written += 1;
    }
    shrubs.castShadow = !this.lowPower;
    this.scene.add(shrubs);
  }

  _createMarineLife() {
    const random = seededRandom(4021);
    const fishCount = this.lowPower ? 5 : 10;
    for (let index = 0; index < fishCount; index += 1) {
      const fish = createFish(random, index);
      this._fish.push(fish);
      this.scene.add(fish);
    }

    const bubbleCount = this.lowPower ? 70 : 150;
    const bubblePositions = new Float32Array(bubbleCount * 3);
    const bubbleSpeeds = new Float32Array(bubbleCount);
    for (let index = 0; index < bubbleCount; index += 1) {
      bubblePositions[index * 3] = (random() - 0.5) * 33;
      bubblePositions[index * 3 + 1] = -4.5 + random() * 4.25;
      bubblePositions[index * 3 + 2] = -18 + random() * 30;
      bubbleSpeeds[index] = 0.12 + random() * 0.32;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(bubblePositions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xa9fff3,
      size: this.lowPower ? 0.045 : 0.065,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.bubbles = new THREE.Points(geometry, material);
    this.bubbles.name = 'Underwater motes and bubbles';
    this.bubbles.userData.speeds = bubbleSpeeds;
    this.scene.add(this.bubbles);
  }

  _updateMarineLife(delta) {
    for (const patch of this._kelp) {
      patch.rotation.z = Math.sin(this.elapsed * 0.85 + patch.userData.phase)
        * patch.userData.strength;
    }
    for (const fish of this._fish) {
      const data = fish.userData;
      const angle = data.orbitOffset + this.elapsed * data.orbitSpeed;
      fish.position.set(
        data.centreX + Math.cos(angle) * data.orbitRadius,
        data.baseY + Math.sin(this.elapsed * 1.2 + data.orbitOffset) * 0.13,
        data.centreZ + Math.sin(angle) * data.orbitRadius,
      );
      fish.rotation.y = -angle - Math.PI / 2;
      data.tail.rotation.y = Math.sin(this.elapsed * 9 + data.orbitOffset) * 0.42;
    }

    const positions = this.bubbles.geometry.attributes.position;
    const speeds = this.bubbles.userData.speeds;
    for (let index = 0; index < positions.count; index += 1) {
      let y = positions.getY(index) + speeds[index] * delta;
      if (y > -0.14) y = -4.45;
      positions.setY(index, y);
    }
    positions.needsUpdate = true;
  }

  _updateEchoes(delta) {
    for (const echo of this.echoes.values()) {
      const data = echo.userData;
      const pulse = 1 + Math.sin(this.elapsed * 2.8 + data.phase) * 0.085;
      data.core.rotation.y += delta * 0.75;
      data.core.rotation.x += delta * 0.28;
      data.ringA.rotation.z += delta * 0.54;
      data.ringB.rotation.x -= delta * 0.43;
      echo.position.y = data.baseY + Math.sin(this.elapsed * 1.55 + data.phase) * 0.12;
      if (data.collected) {
        data.collectProgress = Math.min(1, data.collectProgress + delta * 2.25);
        const scale = Math.max(0.001, 1 - data.collectProgress);
        echo.scale.setScalar(scale * pulse);
        echo.position.y += data.collectProgress * 1.4;
        echo.visible = data.collectProgress < 0.995;
      } else {
        echo.scale.setScalar(pulse);
      }
    }
  }

  _applySiteRestoration(progress) {
    const data = this.ancientSite.userData;
    const eased = progress * progress * (3 - 2 * progress);
    for (const pillar of data.pillars) {
      pillar.position.lerpVectors(
        pillar.userData.brokenPosition,
        pillar.userData.restoredPosition,
        eased,
      );
      pillar.quaternion.slerpQuaternions(
        pillar.userData.brokenQuaternion,
        pillar.userData.restoredQuaternion,
        eased,
      );
    }
    data.crown.scale.setScalar(0.72 + eased * 0.28);
    data.crown.position.y = 2.3 + eased * 0.62;
    data.core.position.y = 0.78 + eased * 1.03;
    data.core.scale.setScalar(1 + eased * 0.42);
    data.core.material.emissiveIntensity = 0.18 + eased * 2.7;
    data.stoneMaterial.emissiveIntensity = 0.16 + eased * 0.34;
    for (const material of data.glyphMaterials) material.opacity = 0.2 + eased * 0.68;
    data.beam.material.opacity = eased * 0.27;
    data.beam.scale.set(0.4 + eased * 0.6, 0.2 + eased * 0.8, 0.4 + eased * 0.6);
  }

  _updateAncientSite(delta) {
    const data = this.ancientSite.userData;
    data.restoration += (
      data.restorationTarget - data.restoration
    ) * (1 - Math.exp(-1.65 * delta));
    if (Math.abs(data.restorationTarget - data.restoration) < 0.0005) {
      data.restoration = data.restorationTarget;
    }
    this._applySiteRestoration(data.restoration);
    data.floorRing.rotation.z += delta * (0.08 + data.restoration * 0.55);
    data.innerRing.rotation.z -= delta * (0.12 + data.restoration * 0.8);
    data.core.rotation.y += delta * (0.3 + data.restoration * 1.4);
  }

  _updateAtmosphere(delta) {
    const depth = THREE.MathUtils.clamp((WORLD.waterLevel - this.camera.position.y) / 3.3, 0, 1);
    this._underwaterMix += (depth - this._underwaterMix) * (1 - Math.exp(-4 * delta));
    this.scene.background.copy(SKY_COLOUR).lerp(DEEP_COLOUR, this._underwaterMix);
    this.scene.fog.color.copy(FOG_SURFACE).lerp(FOG_DEEP, this._underwaterMix);
    this.scene.fog.density = THREE.MathUtils.lerp(0.017, 0.078, this._underwaterMix);
    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(1.05, 0.84, this._underwaterMix);
    this.sky.visible = this._underwaterMix < 0.82;
  }

  /** Returns terrain, water, current and region data at a world position. */
  getEnvironmentAt(position) {
    const x = Number(position?.x) || 0;
    const y = Number(position?.y) || 0;
    const z = Number(position?.z) || 0;
    const groundHeight = getAelysTerrainHeight(x, z);
    const submerged = y < WORLD.waterLevel - 0.16;
    const currentStrength = submerged ? 0.12 : 0;
    const current = new THREE.Vector3(
      Math.sin(z * 0.13 + this.elapsed * 0.18) * currentStrength,
      Math.sin(x * 0.09 + this.elapsed * 0.24) * currentStrength * 0.16,
      Math.cos(x * 0.11 - this.elapsed * 0.14) * currentStrength,
    );
    const islandDistance = Math.hypot(
      x - WORLD.islandCenter.x,
      z - WORLD.islandCenter.z,
    );
    return {
      groundHeight,
      waterLevel: WORLD.waterLevel,
      current,
      submerged,
      region: groundHeight > -0.1
        ? 'rivage-aelys'
        : islandDistance < 13
          ? 'lagune-murmures'
          : 'large-aelys',
    };
  }

  /** Writes camera immersion and restoration into a reusable audio payload. */
  getAmbienceState(target = {}) {
    target.underwater = this._underwaterMix;
    target.restored = this.ancientSite.userData.restoration;
    return target;
  }

  getSpawnPosition(target = new THREE.Vector3()) {
    const x = WORLD.spawn.x;
    const z = WORLD.spawn.z;
    return target.set(x, getAelysTerrainHeight(x, z) + 0.05, z);
  }

  /** Finds the nearest Echo or Ancient Site prompt without changing state. */
  findInteraction(position, maximumDistance = INTERACTION.promptRadius) {
    let nearest = null;
    for (const echo of this.echoes.values()) {
      if (echo.userData.collected) continue;
      const distance = position.distanceTo(echo.position);
      if (distance <= maximumDistance && (!nearest || distance < nearest.distance)) {
        nearest = {
          type: 'echo',
          id: echo.userData.id,
          label: `Ecouter ${echo.userData.label}`,
          distance,
          available: true,
          position: echo.position,
        };
      }
    }

    const siteDistance = position.distanceTo(this.ancientSite.position);
    if (siteDistance <= maximumDistance && (!nearest || siteDistance < nearest.distance)) {
      const progress = this.getProgress();
      nearest = {
        type: 'site',
        id: WORLD.ancientSiteId,
        label: progress.siteRestored
          ? 'Site Ancien restaure'
          : progress.echoesCollected === progress.echoesTotal
            ? 'Reveiller le Site Ancien'
            : `${progress.echoesTotal - progress.echoesCollected} Echo(s) requis`,
        distance: siteDistance,
        available: progress.echoesCollected === progress.echoesTotal && !progress.siteRestored,
        position: this.ancientSite.position,
      };
    }
    return nearest;
  }

  /** Performs the closest in-range interaction and returns a structured result. */
  interact(position) {
    const interaction = this.findInteraction(position, INTERACTION.promptRadius);
    if (!interaction) return { success: false, reason: 'out-of-range' };
    if (interaction.type === 'echo') {
      if (interaction.distance > INTERACTION.echoRadius) {
        return { success: false, reason: 'too-far', ...interaction };
      }
      return this.collectEcho(interaction.id);
    }
    if (interaction.distance > INTERACTION.siteRadius) {
      return { success: false, reason: 'too-far', ...interaction };
    }
    return this.activateAncientSite();
  }

  collectEcho(id, { silent = false, immediate = false } = {}) {
    const echo = this.echoes.get(id);
    if (!echo) return { success: false, reason: 'unknown-echo', id };
    if (echo.userData.collected) return { success: false, reason: 'already-collected', id };
    echo.userData.collected = true;
    if (immediate) {
      echo.userData.collectProgress = 1;
      echo.visible = false;
    }
    const progress = this.getProgress();
    const result = {
      success: true,
      type: 'echo',
      id,
      collected: progress.echoesCollected,
      total: progress.echoesTotal,
    };
    if (!silent) {
      this.callbacks.onEchoCollected?.(result);
      this.callbacks.onProgressChange?.(progress);
    }
    return result;
  }

  activateAncientSite({ silent = false, immediate = false } = {}) {
    const progress = this.getProgress();
    if (progress.siteRestored) {
      return { success: false, reason: 'already-restored', id: WORLD.ancientSiteId };
    }
    if (progress.echoesCollected < progress.echoesTotal) {
      return {
        success: false,
        reason: 'echoes-required',
        missing: progress.echoesTotal - progress.echoesCollected,
        id: WORLD.ancientSiteId,
      };
    }
    const data = this.ancientSite.userData;
    data.restored = true;
    data.restorationTarget = 1;
    if (immediate) {
      data.restoration = 1;
      this._applySiteRestoration(1);
    }
    const result = {
      success: true,
      type: 'site',
      id: WORLD.ancientSiteId,
      restored: true,
    };
    if (!silent) {
      this.callbacks.onSiteActivated?.(result);
      this.callbacks.onProgressChange?.(this.getProgress());
    }
    return result;
  }

  /** Restores visual state from either echo IDs or an echo count. */
  setProgress({
    echoes,
    echoIds,
    echoesCollected,
    siteRestored = false,
  } = {}) {
    const ids = new Set(Array.isArray(echoes) ? echoes : Array.isArray(echoIds) ? echoIds : []);
    if (!ids.size && Number.isFinite(echoesCollected)) {
      ECHOES.slice(0, echoesCollected).forEach((echo) => ids.add(echo.id));
    }
    for (const echo of this.echoes.values()) {
      const collected = ids.has(echo.userData.id);
      echo.userData.collected = collected;
      echo.userData.collectProgress = collected ? 1 : 0;
      echo.visible = !collected;
      echo.scale.setScalar(collected ? 0.001 : 1);
    }
    const data = this.ancientSite.userData;
    data.restored = Boolean(siteRestored);
    data.restoration = siteRestored ? 1 : 0;
    data.restorationTarget = data.restoration;
    this._applySiteRestoration(data.restoration);
    return this.getProgress();
  }

  getProgress() {
    const echoIds = [];
    for (const echo of this.echoes.values()) {
      if (echo.userData.collected) echoIds.push(echo.userData.id);
    }
    return {
      echoIds,
      echoesCollected: echoIds.length,
      echoesTotal: this.echoes.size,
      siteId: WORLD.ancientSiteId,
      siteRestored: Boolean(this.ancientSite.userData.restored),
      restoration: this.ancientSite.userData.restoration,
    };
  }

  setCallbacks(callbacks = {}) {
    Object.assign(this.callbacks, callbacks);
  }

  add(object) {
    this.scene.add(object);
    return object;
  }

  remove(object) {
    this.scene.remove(object);
    return object;
  }

  resize(width, height) {
    if (this._disposed) return;
    const bounds = this.container?.getBoundingClientRect?.();
    const nextWidth = Math.max(1, Math.floor(width || bounds?.width || this.window?.innerWidth || 1));
    const nextHeight = Math.max(1, Math.floor(height || bounds?.height || this.window?.innerHeight || 1));
    const ratio = Math.min(this.window?.devicePixelRatio || 1, this.pixelRatioCap);
    if (this.renderer.getPixelRatio() !== ratio) this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(nextWidth, nextHeight, false);
    this.camera.aspect = nextWidth / nextHeight;
    this.camera.updateProjectionMatrix();
  }

  /** Updates environmental animation; rendering remains an explicit call. */
  update(delta, elapsed) {
    if (this._disposed) return;
    const dt = THREE.MathUtils.clamp(Number(delta) || 0, 0, 0.08);
    this.elapsed = Number.isFinite(elapsed) ? elapsed : this.elapsed + dt;
    this.water.material.uniforms.uTime.value = this.elapsed;
    this._updateMarineLife(dt);
    this._updateEchoes(dt);
    this._updateAncientSite(dt);
    this._updateAtmosphere(dt);
  }

  render() {
    if (!this._disposed) this.renderer.render(this.scene, this.camera);
  }


  /** Resolve solid distant coastline before the camera and animation update. */
  resolveMovement(position, previous, radius = .4) {
    return resolveCoastalMovement(position, previous, radius, this.backdrop.userData.blockers || []);
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._resizeObserver?.disconnect();
    if (this._resizeHandler) this.window?.removeEventListener('resize', this._resizeHandler);

    const geometries = new Set();
    const materials = new Set();
    this.scene.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (Array.isArray(object.material)) {
        object.material.forEach((material) => materials.add(material));
      } else if (object.material) {
        materials.add(object.material);
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    this.water.material.uniforms.uSeabed.value.dispose();
    
    const textures = new Set();
    materials.forEach(material => {
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      material.dispose();
    });
    textures.forEach(texture=>texture.dispose());
    const skeletons = new Set();
    this.scene.traverse(o=>{if(o.skeleton)skeletons.add(o.skeleton);});
    skeletons.forEach(s=>s.dispose());
    this._reflectionTarget?.dispose();

    this.renderer.dispose();
    if (this._ownsCanvas) this.canvas.remove();
  }
}

export default AelysScene;
