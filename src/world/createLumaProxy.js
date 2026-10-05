import * as THREE from 'three';

const SILVER = 0xaeb9bd;
const PALE_SILVER = 0xd4dcdb;
const CHARCOAL = 0x263238;

function makeMesh(name, geometry, material, position, scale, rotation) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createWhiskers() {
  const vertices = [];
  const roots = [
    [-0.12, 0.69, 1.72],
    [0.12, 0.69, 1.72],
  ];

  for (const root of roots) {
    const side = Math.sign(root[0]);
    for (let index = 0; index < 5; index += 1) {
      const vertical = (index - 2) * 0.065;
      vertices.push(
        ...root,
        root[0] + side * (0.48 + index * 0.035),
        root[1] + vertical,
        root[2] + 0.14 - Math.abs(index - 2) * 0.012,
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const material = new THREE.LineBasicMaterial({
    color: 0xe8eeee,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
  });
  const whiskers = new THREE.LineSegments(geometry, material);
  whiskers.name = 'Luma whiskers';
  whiskers.renderOrder = 3;
  return whiskers;
}

function addBodySpots(parent, material, detail) {
  const geometry = new THREE.SphereGeometry(1, detail ? 12 : 8, detail ? 8 : 6);
  const placements = [
    [-0.26, 1.09, 0.62, 0.12, 0.025, 0.2, -0.22],
    [0.26, 1.08, 0.48, 0.1, 0.024, 0.16, 0.35],
    [-0.43, 0.93, 0.16, 0.14, 0.025, 0.1, 0.18],
    [0.45, 0.9, 0.05, 0.1, 0.024, 0.17, -0.4],
    [-0.35, 0.86, -0.37, 0.095, 0.02, 0.14, 0.5],
    [0.3, 0.91, -0.53, 0.14, 0.022, 0.09, 0.1],
    [-0.18, 0.94, -0.84, 0.09, 0.02, 0.16, -0.35],
    [0.22, 0.87, -1.03, 0.12, 0.02, 0.08, 0.25],
    [-0.5, 0.73, -0.74, 0.08, 0.02, 0.12, 0.4],
    [0.48, 0.74, -0.3, 0.07, 0.018, 0.1, -0.2],
    [-0.31, 0.98, 1.16, 0.07, 0.018, 0.09, 0.2],
    [0.32, 1.0, 1.28, 0.065, 0.018, 0.11, -0.25],
    [-0.39, 0.86, 1.38, 0.055, 0.015, 0.075, 0.55],
    [0.39, 0.85, 1.49, 0.045, 0.014, 0.075, -0.4],
  ];

  const spots = [];
  for (const placement of placements) {
    const [x, y, z, sx, sy, sz, rz] = placement;
    const spot = makeMesh(
      'Luma natural spot',
      geometry,
      material,
      [x, y, z],
      [sx, sy, sz],
      [0, 0, rz],
    );
    spot.castShadow = false;
    parent.add(spot);
    spots.push(spot);
  }
  return spots;
}

/**
 * Builds the deliberately asset-free Luma placeholder used by the P0 slice.
 *
 * The return value is a `THREE.Group` facing local +Z.  The group exposes:
 * - `userData.update(delta, state)` for breathing/swimming animation;
 * - `userData.setMood(name)` for a small expression hint;
 * - `userData.collisionRadius` and `userData.isProceduralProxy` metadata.
 *
 * @param {object} [options]
 * @param {number} [options.scale=0.62] Overall display scale.
 * @param {boolean} [options.shadows=true] Whether meshes cast shadows.
 * @param {boolean} [options.highDetail=true] Uses slightly denser primitives.
 * @returns {THREE.Group}
 */
export function createLumaProxy({ scale = 0.62, shadows = true, highDetail = true } = {}) {
  const root = new THREE.Group();
  root.name = 'Luma - procedural seal proxy';
  root.scale.setScalar(scale);
  root.userData.kind = 'guardian';
  root.userData.sealId = 'luma';
  root.userData.isProceduralProxy = true;
  root.userData.collisionRadius = 0.62 * scale;

  const visual = new THREE.Group();
  visual.name = 'Luma anatomy';
  root.add(visual);

  const segments = highDetail ? 28 : 18;
  const fur = new THREE.MeshPhysicalMaterial({
    color: SILVER,
    roughness: 0.44,
    metalness: 0.04,
    clearcoat: 0.32,
    clearcoatRoughness: 0.48,
  });
  const paleFur = new THREE.MeshStandardMaterial({
    color: PALE_SILVER,
    roughness: 0.58,
  });
  const spotMaterial = new THREE.MeshStandardMaterial({
    color: 0x59676c,
    roughness: 0.5,
  });
  const darkWet = new THREE.MeshPhysicalMaterial({
    color: CHARCOAL,
    roughness: 0.18,
    metalness: 0.02,
    clearcoat: 0.7,
    clearcoatRoughness: 0.16,
  });

  const sphere = new THREE.SphereGeometry(1, segments, Math.max(12, segments - 8));
  const body = makeMesh(
    'Luma rounded torso',
    sphere,
    fur,
    [0, 0.56, -0.18],
    [0.68, 0.57, 1.42],
  );
  const rump = makeMesh(
    'Luma tapered rump',
    sphere,
    fur,
    [0, 0.48, -1.05],
    [0.57, 0.46, 0.75],
  );
  const neck = makeMesh(
    'Luma neck',
    sphere,
    fur,
    [0, 0.62, 0.78],
    [0.56, 0.53, 0.68],
  );
  const head = makeMesh(
    'Luma seal head',
    sphere,
    fur,
    [0, 0.72, 1.28],
    [0.51, 0.47, 0.54],
  );
  visual.add(body, rump, neck, head);

  const belly = makeMesh(
    'Luma pale belly',
    sphere,
    paleFur,
    [0, 0.29, 0.17],
    [0.54, 0.31, 1.12],
  );
  belly.castShadow = false;
  visual.add(belly);

  const frontFlipperGeometry = new THREE.SphereGeometry(
    1,
    highDetail ? 18 : 12,
    highDetail ? 10 : 8,
  );
  const leftFlipper = makeMesh(
    'Luma left fore flipper',
    frontFlipperGeometry,
    fur,
    [-0.64, 0.31, 0.28],
    [0.22, 0.095, 0.72],
    [0.1, -0.72, -0.12],
  );
  const rightFlipper = makeMesh(
    'Luma right fore flipper',
    frontFlipperGeometry,
    fur,
    [0.64, 0.31, 0.28],
    [0.22, 0.095, 0.72],
    [-0.1, 0.72, 0.12],
  );
  visual.add(leftFlipper, rightFlipper);

  const hindGeometry = new THREE.SphereGeometry(
    1,
    highDetail ? 18 : 12,
    highDetail ? 10 : 8,
  );
  const leftHind = makeMesh(
    'Luma left hind flipper',
    hindGeometry,
    fur,
    [-0.2, 0.38, -1.67],
    [0.27, 0.1, 0.68],
    [0, -0.3, -0.08],
  );
  const rightHind = makeMesh(
    'Luma right hind flipper',
    hindGeometry,
    fur,
    [0.2, 0.38, -1.67],
    [0.27, 0.1, 0.68],
    [0, 0.3, 0.08],
  );
  visual.add(leftHind, rightHind);

  const muzzleGeometry = new THREE.SphereGeometry(1, highDetail ? 18 : 12, 10);
  const leftMuzzle = makeMesh(
    'Luma left muzzle pad',
    muzzleGeometry,
    paleFur,
    [-0.125, 0.66, 1.7],
    [0.2, 0.14, 0.18],
  );
  const rightMuzzle = makeMesh(
    'Luma right muzzle pad',
    muzzleGeometry,
    paleFur,
    [0.125, 0.66, 1.7],
    [0.2, 0.14, 0.18],
  );
  const nose = makeMesh(
    'Luma nose',
    new THREE.SphereGeometry(1, 14, 10),
    darkWet,
    [0, 0.73, 1.84],
    [0.115, 0.085, 0.075],
  );
  visual.add(leftMuzzle, rightMuzzle, nose);

  const eyes = [];
  const eyeGeometry = new THREE.SphereGeometry(1, highDetail ? 18 : 12, 12);
  const glintMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const side of [-1, 1]) {
    const eye = makeMesh(
      side < 0 ? 'Luma left eye' : 'Luma right eye',
      eyeGeometry,
      darkWet,
      [side * 0.245, 0.86, 1.64],
      [0.105, 0.12, 0.07],
      [0, side * 0.16, 0],
    );
    const glint = makeMesh(
      'Luma eye catchlight',
      eyeGeometry,
      glintMaterial,
      [side * 0.218, 0.9, 1.704],
      [0.023, 0.027, 0.013],
    );
    glint.castShadow = false;
    visual.add(eye, glint);
    eyes.push(eye);
  }

  const whiskers = createWhiskers();
  visual.add(whiskers);
  addBodySpots(visual, spotMaterial, highDetail);

  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x071216,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  });
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 28), shadowMaterial);
  shadow.name = 'Luma contact shadow';
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, 0.012, -0.25);
  shadow.scale.set(0.78, 1.85, 1);
  shadow.receiveShadow = false;
  shadow.castShadow = false;
  root.add(shadow);

  if (!shadows) {
    root.traverse((object) => {
      if (object.isMesh) object.castShadow = false;
    });
  }

  const animation = {
    time: 0,
    mood: 'curious',
    blinkOffset: Math.random() * 4,
    wetness: 0,
  };
  const leftFrontRest = leftFlipper.rotation.clone();
  const rightFrontRest = rightFlipper.rotation.clone();
  const leftHindRest = leftHind.rotation.clone();
  const rightHindRest = rightHind.rotation.clone();

  root.userData.setMood = (mood = 'curious') => {
    animation.mood = mood;
  };

  root.userData.update = (delta = 0, state = {}) => {
    animation.time += Math.min(Math.max(delta, 0), 0.1);
    const mode = state.mode || 'land';
    const speed = Math.max(0, Number(state.speed) || 0);
    const motion = THREE.MathUtils.clamp(speed / 4.25, 0, 1.45);
    const swimming = mode === 'surface' || mode === 'underwater';
    // Fast wetting and gentle drying are visual state, independent of saves.
    const dt = Math.min(Math.max(Number(delta) || 0, 0), 0.1);
    animation.wetness += ((swimming ? 1 : 0) - animation.wetness)
      * (1 - Math.exp(-(swimming ? 3.2 : 0.075) * dt));
    const wet = animation.wetness;
    fur.roughness = 0.56 - wet * 0.29;
    fur.clearcoat = 0.2 + wet * 0.66;
    fur.clearcoatRoughness = 0.42 - wet * 0.24;
    paleFur.roughness = 0.64 - wet * 0.29;
    spotMaterial.roughness = 0.58 - wet * 0.27;
    const cadence = swimming ? 3.4 + motion * 3.6 : 1.4 + motion * 4.8;
    const wave = Math.sin(animation.time * cadence);
    const breath = Math.sin(animation.time * 1.75) * 0.012;

    body.scale.y = 0.57 + breath;
    neck.scale.y = 0.53 + breath * 0.65;
    visual.position.y = swimming
      ? Math.sin(animation.time * 2.1) * 0.025
      : Math.abs(Math.sin(animation.time * cadence)) * 0.018 * motion;
    visual.rotation.y = swimming ? wave * 0.035 * motion : wave * 0.012 * motion;
    visual.rotation.z = swimming ? -wave * 0.02 * motion : 0;

    leftFlipper.rotation.copy(leftFrontRest);
    rightFlipper.rotation.copy(rightFrontRest);
    leftHind.rotation.copy(leftHindRest);
    rightHind.rotation.copy(rightHindRest);

    if (swimming) {
      leftFlipper.rotation.z -= wave * (0.22 + motion * 0.17);
      rightFlipper.rotation.z += wave * (0.22 + motion * 0.17);
      leftHind.rotation.y -= wave * (0.18 + motion * 0.24);
      rightHind.rotation.y += wave * (0.18 + motion * 0.24);
    } else if (motion > 0.04) {
      leftFlipper.rotation.z -= wave * 0.12 * motion;
      rightFlipper.rotation.z -= wave * 0.12 * motion;
      leftHind.rotation.y -= wave * 0.08 * motion;
      rightHind.rotation.y += wave * 0.08 * motion;
    }

    const blinkPhase = (animation.time + animation.blinkOffset) % 4.7;
    const blinkScale = blinkPhase > 4.56 ? 0.08 : 1;
    for (const eye of eyes) eye.scale.y = 0.12 * blinkScale;

    const curiousTilt = animation.mood === 'curious' && speed < 0.12
      ? Math.sin(animation.time * 0.7) * 0.035
      : 0;
    head.rotation.z = curiousTilt;
    shadow.visible = mode === 'land';
    shadowMaterial.opacity = mode === 'land' ? 0.24 : 0;
  };

  return root;
}

/** Disposes geometries and materials allocated by `createLumaProxy`. */
export function disposeLumaProxy(proxy) {
  const geometries = new Set();
  const materials = new Set();
  proxy?.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (Array.isArray(object.material)) {
      object.material.forEach((material) => materials.add(material));
    } else if (object.material) {
      materials.add(object.material);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

export default createLumaProxy;
