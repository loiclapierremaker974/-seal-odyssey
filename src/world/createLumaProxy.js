import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// A single skin, from the rear peduncle through the raised chest to the skull.
// z, centre height, horizontal radius, vertical radius; local forward is +Z.
const PROFILE = [
  [-1.78, .20, .025, .035], [-1.58, .24, .17, .20],
  [-1.24, .37, .38, .335], [-.80, .47, .55, .435],
  [-.25, .53, .64, .495], [.24, .54, .62, .505],
  [.60, .57, .51, .465], [.82, .63, .41, .385],
  [1.02, .75, .42, .37], [1.24, .79, .45, .385],
  [1.46, .75, .38, .33], [1.63, .67, .235, .22],
  [1.76, .635, .03, .035],
];
const HEAD_ANCHOR = [0, .72, .82];
const MIDDLE_ANCHOR = [0, .53, -.08];
const TAIL_ANCHOR = [0, .30, -1.15];

function sampleProfile(z) {
  let i = 0;
  while (i < PROFILE.length - 2 && z > PROFILE[i + 1][0]) i++;
  const a = PROFILE[i], b = PROFILE[i + 1];
  const t = clamp((z - a[0]) / (b[0] - a[0]));
  // Cubic Hermite slopes retain the continuous neck without radius overshoot.
  return [1, 2, 3].map((axis) => {
    const p = PROFILE[Math.max(0, i - 1)], n = PROFILE[Math.min(PROFILE.length - 1, i + 2)];
    const m0 = (b[axis] - p[axis]) / (b[0] - p[0]) * (b[0] - a[0]);
    const m1 = (n[axis] - a[axis]) / (n[0] - a[0]) * (b[0] - a[0]);
    const v = (2*t*t*t-3*t*t+1)*a[axis] + (t*t*t-2*t*t+t)*m0
      + (-2*t*t*t+3*t*t)*b[axis] + (t*t*t-t*t)*m1;
    return axis === 1 ? v : Math.max(.02, v);
  });
}

function createSkinGeometry(highDetail) {
  const rings = highDetail ? 88 : 52, sections = highDetail ? 56 : 32;
  const positions = [], uvs = [], indices = [], skinIndices = [], weights = [];
  for (let r = 0; r <= rings; r++) {
    const v = r / rings, z = THREE.MathUtils.lerp(PROFILE[0][0], PROFILE.at(-1)[0], v);
    const [centre, rx, ry] = sampleProfile(z);
    const head = smooth(.70, 1.05, z), tail = 1 - smooth(-1.48, -.92, z);
    const remaining = 1 - head - tail;
    const middle = remaining * smooth(-1.10, -.45, z) * (1 - smooth(.50, .80, z));
    for (let s = 0; s <= sections; s++) {
      const u = s / sections, angle = u * Math.PI * 2;
      const x = Math.sin(angle) * rx;
      let y = centre - Math.cos(angle) * ry;
      // The ventral contact belongs to the torso; the skull stays round and low.
      y = Math.max(.035, y);
      positions.push(x, y, z);
      uvs.push(u, v);
      skinIndices.push(0, 1, 2, 3);
      weights.push(remaining - middle, head, tail, middle);
    }
  }
  const stride = sections + 1;
  for (let r = 0; r < rings; r++) for (let s = 0; s < sections; s++) {
    const a = r * stride + s, b = a + stride;
    indices.push(a, a + 1, b, b, a + 1, b + 1);
  }
  // Cap the small rear and nose rings, rather than leaving open tubes.
  for (const [r, forward] of [[0, false], [rings, true]]) {
    const base = positions.length / 3, station = r === 0 ? PROFILE[0] : PROFILE.at(-1);
    positions.push(0, station[1], station[0]); uvs.push(.5, r / rings);
    skinIndices.push(0, 1, 2, 3); weights.push(r ? 0 : 0, r ? 1 : 0, r ? 0 : 1, 0);
    for (let s = 0; s < sections; s++) {
      const a = r * stride + s;
      indices.push(...(forward ? [base, a, a + 1] : [base, a + 1, a]));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  geometry.setIndex(indices);
  
  geometry.computeVertexNormals();
  // Both UV sides share a surface normal, avoiding a line under the belly.
  const normals=geometry.attributes.normal;
  const normal=new THREE.Vector3();
  for(let r=0;r<=rings;r++){
    const a=r*stride,b=a+sections;
    normal.set(normals.getX(a)+normals.getX(b),normals.getY(a)+normals.getY(b),normals.getZ(a)+normals.getZ(b)).normalize();
    normals.setXYZ(a,normal.x,normal.y,normal.z);normals.setXYZ(b,normal.x,normal.y,normal.z);
  }
  geometry.computeBoundingSphere();
  Object.assign(geometry.userData, { rings, sections });
  return geometry;
}

function randomGenerator(seed) {
  return () => { seed = Math.imul(seed ^ seed >>> 15, 1 | seed); seed ^= seed + Math.imul(seed ^ seed >>> 7, 61 | seed); return ((seed ^ seed >>> 14) >>> 0) / 4294967296; };
}

function makeSkinTextures(highDetail) {
  const width = highDetail ? 2048 : 1024, height = width / 2;
  const albedo = new Uint8Array(width * height * 4);
  const relief = new Uint8Array(albedo.length), roughness = new Uint8Array(albedo.length);
  const random = randomGenerator(16753);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = x / width, v = y / (height - 1), i = (y * width + x) * 4;
    const ventral = Math.pow((1 + Math.cos(u * Math.PI * 2)) * .5, 2.1);
    const cream = clamp(ventral * .94 + smooth(.85, .99, v) * .30);
    const grain = random() - .5;
    const cloud = Math.sin(u * Math.PI * 14 + Math.sin(v * 19)) * Math.sin(v * 37) * 6;
    const silver = [157, 163, 166], pale = [227, 229, 220];
    for (let c = 0; c < 3; c++) albedo[i+c] = silver[c] * (1-cream) + pale[c]*cream + cloud + grain*11;
    albedo[i+3] = relief[i+3] = roughness[i+3] = 255;
    const flow=x*.53+Math.sin(y*.018)*2.0;
    const hair=clamp(.51+grain*.18+Math.sin(flow+y*.09)*.09+Math.sin(flow*2.1+y*.17)*.045);
    relief[i] = relief[i+1] = relief[i+2] = Math.round(hair*255);
    roughness[i] = roughness[i+1] = roughness[i+2] = 218 + Math.round(grain*20);
  }
  // Irregular, softly edged mottling printed into the skin, including the head.
  for (let spot = 0; spot < 310; spot++) {
    const u = random(), v = .07 + random() * .91;
    const rx = (v > .78 ? .004 : .006) + random()*.009;
    const ry = .005 + random() * .012;
    const rotation = random() * Math.PI, phase = random() * 6.28;
    const strength = .26 + random() * .34;
    const extentX = Math.ceil((rx+ry)*width), extentY = Math.ceil((rx+ry)*height);
    const cx = Math.floor(u*width), cy = Math.floor(v*height);
    for (let dy = -extentY; dy <= extentY; dy++) for (let dx = -extentX; dx <= extentX; dx++) {
      const y = cy+dy; if (y < 0 || y >= height) continue;
      const x = ((cx+dx)%width+width)%width, px=dx/width, py=dy/height;
      const a=(px*Math.cos(rotation)-py*Math.sin(rotation))/rx;
      const b=(px*Math.sin(rotation)+py*Math.cos(rotation))/ry;
      const angle=Math.atan2(b,a), radius=Math.hypot(a,b);
      const boundary=1+.16*Math.sin(angle*3+phase)+.11*Math.sin(angle*5-phase);
      const edge=1-smooth(boundary*.66,boundary,radius);
      const belly=Math.pow((1+Math.cos(x/width*Math.PI*2))*.5,2);
      const dark=edge*strength*(1-belly*.82), i=(y*width+x)*4;
      for (let c=0;c<3;c++) albedo[i+c]=Math.round(albedo[i+c]*(1-dark)+[47,53,59][c]*dark);
    }
  }
  const texture = (data, colour) => {
    const t = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy=4;t.needsUpdate = true; return t;
  };
  return { map:texture(albedo,true), bumpMap:texture(relief,false), roughnessMap:texture(roughness,false) };
}


/** Shared alpha coverage: fine longitudinal hairs, rather than white noise. */
function makeFurCoverage() {
  const size=256,data=new Uint8Array(size*size*4),random=randomGenerator(89412);
  for(let i=0;i<size*size;i++){data[i*4+3]=255;}
  for(let hair=0;hair<1550;hair++){
    const x=Math.floor(random()*size),y=Math.floor(random()*size);
    const length=5+Math.floor(random()*9),strength=150+random()*105,lean=(random()-.5)*.36;
    for(let row=0;row<length;row++)for(let side=-1;side<=1;side++){
      const xx=(x+Math.round(row*lean)+side+size)%size,yy=(y+row)%size;
      const i=(yy*size+xx)*4;
      const coverage=strength*(side===0?1:.30)*Math.pow(1-row/length,.35);
      data[i]=data[i+1]=data[i+2]=Math.max(data[i+1],Math.round(coverage));
    }
  }
  const map=new THREE.DataTexture(data,size,size);
  map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(6,4);
  map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearMipmapLinearFilter;
  map.generateMipmaps=true;map.anisotropy=4;map.needsUpdate=true;return map;
}


/** Opaque alpha-tested shells share the body rig and geometry (no second rig). */
function createShortFur(body,textures,parent,highDetail) {
  const coverage=makeFurCoverage(),count=highDetail?6:3,layers=[];
  for(let i=1;i<=count;i++){
    const fraction=i/count,lengthUniform={value:.006*fraction};
    const material=new THREE.MeshStandardMaterial({
      color:0xffffff,...textures,alphaMap:coverage,alphaTest:.16+fraction*.74,
      roughness:.86,bumpScale:.010,metalness:0,envMapIntensity:.45,
      transparent:false,depthWrite:true,
    });
    material.userData.furFraction=fraction;
    material.userData.furLength=lengthUniform;
    material.onBeforeCompile=shader=>{
      shader.uniforms.uLumaFurLength=lengthUniform;
      const marker='#include <begin_vertex>';
      if(!shader.vertexShader.includes(marker))throw new Error('Luma fur: unsupported vertex shader.');
      shader.vertexShader='uniform float uLumaFurLength;\n'+shader.vertexShader.replace(marker,
        marker+'\ntransformed += normalize(normal) * uLumaFurLength * smoothstep(0.02, 0.15, position.y);');
    };
    material.customProgramCacheKey=()=> 'luma-short-fur-v1';
    const coat=new THREE.SkinnedMesh(body.geometry,material);
    coat.name='Luma short fur '+i;coat.frustumCulled=false;
    coat.castShadow=false;coat.receiveShadow=true;coat.renderOrder=-i;
    coat.bindMode=body.bindMode;coat.position.copy(body.position);coat.quaternion.copy(body.quaternion);coat.scale.copy(body.scale);
    parent.add(coat);coat.bind(body.skeleton,body.bindMatrix);
    layers.push({mesh:coat,material,fraction,lengthUniform});
  }
  return layers;
}

function flipperGeometry(highDetail, hind = false) {
  const rings=highDetail?22:14, sides=highDetail?24:16, length=hind?.76:.74;
  const profile=hind
    ? [[0,.055,.025],[.23,.11,.024],[.55,.22,.021],[.78,.285,.019],[.93,.245,.014],[1,.045,.009]]
    : [[0,.055,.030],[.15,.095,.030],[.42,.17,.026],[.72,.20,.021],[.90,.155,.016],[1,.032,.010]];
  const positions=[],uvs=[],indices=[],stride=sides+1;
  for(let ring=0;ring<=rings;ring++){
    const t=ring/rings;
    let station=0;
    while(station<profile.length-2 && t>profile[station+1][0])station++;
    const a=profile[station],b=profile[station+1],blend=smooth(a[0],b[0],t);
    const breadth=THREE.MathUtils.lerp(a[1],b[1],blend);
    const thickness=THREE.MathUtils.lerp(a[2],b[2],blend);
    for(let side=0;side<=sides;side++){
      const angle=side/sides*Math.PI*2;
      // Positive distal radii and monotonic stations prevent crossed tips.
      positions.push(Math.sin(angle)*breadth,Math.cos(angle)*thickness,length*t);
      uvs.push(.27+Math.sin(angle)*breadth*.32,.16+t*.57);
    }
  }
  for(let ring=0;ring<rings;ring++)for(let side=0;side<sides;side++){
    const a=ring*stride+side,b=a+stride;
    indices.push(a,b,a+1,b,b+1,a+1);
  }
  for(const [ring,forward] of [[0,false],[rings,true]]){
    const centre=positions.length/3;
    positions.push(0,0,forward?length:0);uvs.push(.27,forward?.73:.16);
    for(let side=0;side<sides;side++){
      const a=ring*stride+side;
      indices.push(...(forward?[centre,a+1,a]:[centre,a,a+1]));
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  const normals=geometry.attributes.normal,normal=new THREE.Vector3();
  for(let ring=0;ring<=rings;ring++){
    const a=ring*stride,b=a+sides;
    normal.set(normals.getX(a)+normals.getX(b),normals.getY(a)+normals.getY(b),normals.getZ(a)+normals.getZ(b)).normalize();
    normals.setXYZ(a,normal.x,normal.y,normal.z);normals.setXYZ(b,normal.x,normal.y,normal.z);
  }
  geometry.computeBoundingSphere();
  Object.assign(geometry.userData,{rings,sections:sides,length,hind});
  return geometry;
}

function addMesh(parent,name,geometry,material,position,scale) {
  const m=new THREE.Mesh(geometry,material);m.name=name;
  m.position.set(...position);if(scale)m.scale.set(...scale);
  m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
}

function curveMesh(points,radius,material,highDetail) {
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
  return new THREE.Mesh(new THREE.TubeGeometry(curve,highDetail?24:12,radius,highDetail?5:3,false),material);
}

/**
 * Reference-directed procedural Luma. A continuous skinned surface replaces
 * the primitive proxy while retaining the controller's local +Z contract.
 * No external model, texture or prerecorded animation is required.
 */
export function createLumaProxy({scale=.62,shadows=true,highDetail=true}={}) {
  const root=new THREE.Group();root.name='Luma — phoque gris d’Aqualys';
  root.scale.setScalar(scale);
  Object.assign(root.userData,{kind:'guardian',sealId:'luma',isProceduralProxy:true,modelRevision:'luma-anatomy-v2',collisionRadius:.68*scale});
  const visual=new THREE.Group();visual.name='Luma anatomical visual';root.add(visual);
  const textures=makeSkinTextures(highDetail);
  const fur=new THREE.MeshPhysicalMaterial({color:0xffffff,...textures,metalness:0,roughness:.78,bumpScale:.014,clearcoat:.08,clearcoatRoughness:.38,envMapIntensity:.65});
  const muzzleMaterial=new THREE.MeshPhysicalMaterial({color:0xe2e5dd,roughness:.69,metalness:0,bumpMap:textures.bumpMap,bumpScale:.004,clearcoat:.12});
  const noseMaterial=new THREE.MeshPhysicalMaterial({color:0x252220,roughness:.3,clearcoat:.3});
  const eyeMaterial=new THREE.MeshPhysicalMaterial({color:0x17100d,roughness:.065,metalness:0,clearcoat:1,clearcoatRoughness:.03,envMapIntensity:1.4});
  const lidMaterial=new THREE.MeshStandardMaterial({color:0x79817f,roughness:.73});
  const mouthMaterial=new THREE.MeshStandardMaterial({color:0x473731,roughness:.7});
  const sphere=new THREE.SphereGeometry(1,highDetail?32:20,highDetail?24:14);
  const body=new THREE.SkinnedMesh(createSkinGeometry(highDetail),fur);
  body.name='Luma continuous skin';body.castShadow=shadows;body.receiveShadow=true;body.frustumCulled=false;
  const core=new THREE.Bone(),head=new THREE.Bone(),tail=new THREE.Bone(),middle=new THREE.Bone();
  core.name='Luma spine';head.name='Luma head';tail.name='Luma rear propulsion';middle.name='Luma middle spine';
  head.position.set(...HEAD_ANCHOR);tail.position.set(...TAIL_ANCHOR);middle.position.set(...MIDDLE_ANCHOR);
  core.add(head,tail,middle);body.add(core);visual.add(body);body.bind(new THREE.Skeleton([core,head,tail,middle]));
  const furLayers=createShortFur(body,textures,visual,highDetail);
  root.userData.furLayers=furLayers.length;

  const face=new THREE.Group();face.name='Luma expression';head.add(face);
  const facePos=(x,y,z)=>[x,y-HEAD_ANCHOR[1],z-HEAD_ANCHOR[2]];
  for(const side of [-1,1])addMesh(face,'Luma soft muzzle',sphere,muzzleMaterial,facePos(side*.13,.665,1.70),[.19,.12,.125]);
  const chin=addMesh(face,'Luma chin',sphere,muzzleMaterial,facePos(0,.57,1.57),[.205,.075,.15]);
  const chinRestY=chin.position.y;
  const noseGeometry=sphere.clone(),noseVertices=noseGeometry.attributes.position;
  for(let i=0;i<noseVertices.count;i++){
    noseVertices.setX(i,noseVertices.getX(i)*(.78+.22*smooth(-.9,.4,noseVertices.getY(i))));
  }
  noseGeometry.computeVertexNormals();
  const nose=addMesh(face,'Luma seal nose',noseGeometry,noseMaterial,facePos(0,.735,1.765),[.10,.070,.061]);
  // Two recessed nostrils in the fleshy triangular nose.
  for(const side of [-1,1]) {
    const nostril=addMesh(face,'Luma nostril',sphere,eyeMaterial,facePos(side*.036,.751,1.824),[.017,.022,.006]);
    nostril.rotation.z=side*.35;
  }
  const mouth=curveMesh([[-.19,.612,1.813],[-.10,.598,1.810],[-.05,.596,1.796],[0,.595,1.763],[.05,.596,1.796],[.10,.598,1.810],[.19,.612,1.813]].map(p=>facePos(...p)),.007,mouthMaterial,highDetail);
  mouth.name='Luma gentle mouth';face.add(mouth);
  const philtrum=curveMesh([[0,.710,1.830],[0,.659,1.800],[0,.603,1.773]].map(p=>facePos(...p)),.005,mouthMaterial,highDetail);face.add(philtrum);

  const eyes=[];
  for(const side of [-1,1]) {
    const socket=new THREE.Group();socket.position.set(...facePos(side*.29,.875,1.475));socket.rotation.y=side*.42;face.add(socket);
    addMesh(socket,'Luma eyelid rim',sphere,lidMaterial,[0,0,0],[.115,.125,.043]);
    const blink=new THREE.Group();socket.add(blink);
    const eye=addMesh(blink,side<0?'Luma left eye':'Luma right eye',sphere,eyeMaterial,[0,0,.016],[.098,.106,.052]);
    // Small reflected sky patches move and close with the cornea.
    const glintMaterial=new THREE.MeshBasicMaterial({color:0xf1f5f0,transparent:true,opacity:.82});
    addMesh(blink,'Luma corneal reflection',sphere,glintMaterial,[-.027,.035,.063],[.014,.010,.003]).castShadow=false;
    addMesh(blink,'Luma small eye reflection',sphere,glintMaterial,[.036,-.025,.064],[.006,.004,.002]).castShadow=false;
    eyes.push(blink);eye.userData.cornea=true;
  }

  const whiskerMaterial=new THREE.MeshStandardMaterial({color:0xeee4d2,roughness:.58});
  const whiskerGeometries=[], follicles=[];
  for(const side of [-1,1])for(let i=0;i<(highDetail?12:8);i++){
    const band=i%3, row=Math.floor(i/3);
    const [x,y,z]=facePos(side*(.10+band*.046),.638+row*.027,1.817-band*.012);
    follicles.push([x,y,z]);
    const reach=.40+(i%4)*.035;
    const whisker=curveMesh([[x,y,z],[side*(.26+band*.02),y+.012,z+.035],[side*(.40+reach*.25),y+(i-5)*.020,z+.025],[side*(.18+reach),y+(i-5)*.031,z-.055]],highDetail?.0027:.0031,whiskerMaterial,highDetail);
    whiskerGeometries.push(whisker.geometry);
  }

  const whiskers=new THREE.Mesh(mergeGeometries(whiskerGeometries),whiskerMaterial);
  whiskers.name='Luma curved whiskers';face.add(whiskers);whiskerGeometries.forEach(g=>g.dispose());
  const roots=new THREE.InstancedMesh(sphere,mouthMaterial,follicles.length);
  const placement=new THREE.Object3D();
  follicles.forEach((p,i)=>{placement.position.set(...p);placement.scale.set(.008,.007,.005);placement.updateMatrix();roots.setMatrixAt(i,placement.matrix);});
  roots.name='Luma whisker follicles';face.add(roots);

  const flippers=[];
  for(const side of [-1,1])for(const hind of [false,true]){
    const pivot=new THREE.Group();pivot.name=hind?'Luma hind flipper joint':'Luma shoulder joint';
    // Hind flippers and peduncle move as one assembly during propulsion.
    if(hind){pivot.position.set(side*.12,.22-TAIL_ANCHOR[1],-1.54-TAIL_ANCHOR[2]);tail.add(pivot);}
    else{pivot.position.set(side*.44,.27-MIDDLE_ANCHOR[1],.38-MIDDLE_ANCHOR[2]);middle.add(pivot);}
    const blade=addMesh(pivot,hind?'Luma webbed hind flipper':'Luma tapered fore flipper',flipperGeometry(highDetail,hind),fur,[0,0,0]);
    pivot.rotation.set(hind?-.18:-.48,side*(hind?Math.PI-.24:2.12),0);
    flippers.push({pivot,side,hind,rest:pivot.rotation.clone(),blade});
  }

  // Radial contact shadow with a feathered edge, never an opaque black disc.
  const shadowSize=64,data=new Uint8Array(shadowSize*shadowSize*4);
  for(let y=0;y<shadowSize;y++)for(let x=0;x<shadowSize;x++){
    const i=(y*shadowSize+x)*4,r=Math.hypot((x+.5)/shadowSize*2-1,(y+.5)/shadowSize*2-1);
    data[i]=data[i+1]=data[i+2]=10;data[i+3]=Math.round((1-smooth(.18,1,r))*85);
  }
  const shadowMap=new THREE.DataTexture(data,shadowSize,shadowSize);shadowMap.needsUpdate=true;
  const shadowMaterial=new THREE.MeshBasicMaterial({map:shadowMap,transparent:true,depthWrite:false});
  const shadow=addMesh(root,'Luma soft contact shadow',new THREE.PlaneGeometry(1,1),shadowMaterial,[0,.016,-.12],[1.8,3.6,1]);
  shadow.rotation.x=-Math.PI/2;shadow.castShadow=false;shadow.receiveShadow=false;
  if(!shadows)root.traverse(o=>{if(o.isMesh)o.castShadow=false;});


  const animation={time:0,mood:'curious',swim:0,wet:0,gaitPhase:0,air:0,airPitch:0};
  const motion={revision:'luma-motion-v1',gaitPhase:0,groundPush:0,jumpStage:'idle',jumpHeight:0};
  root.userData.motion=motion;
  root.userData.setMood=(mood='curious')=>{animation.mood=mood;};
  root.userData.update=(delta=0,state={})=>{
    const dt=clamp(finite(delta),0,.1);animation.time+=dt;
    const airborne=Boolean(state.airborne),stage=state.jumpStage||'idle';
    const phase=clamp(finite(state.jumpPhase)),jumpHeight=Math.max(0,finite(state.jumpHeight));
    const swimming=state.mode==='surface'||state.mode==='underwater';
    const horizontalSpeed=Math.max(0,finite(state.horizontalSpeed??state.speed));
    const m=clamp(horizontalSpeed/4.25,0,1.5),turn=clamp(finite(state.turn),-1,1);
    animation.swim+=(((swimming&&!airborne)?1:0)-animation.swim)*(1-Math.exp(-5*dt));
    animation.wet+=((swimming?1:0)-animation.wet)*(1-Math.exp(-(swimming?3.2:.075)*dt));
    animation.air+=((airborne?1:0)-animation.air)*(1-Math.exp(-11*dt));
    const pitch=airborne?Math.sin((phase-.5)*Math.PI)*.08:0;
    animation.airPitch+=(pitch-animation.airPitch)*(1-Math.exp(-9*dt));
    if(Number.isFinite(state.gaitPhase))animation.gaitPhase=state.gaitPhase;
    else if(!swimming&&!airborne)animation.gaitPhase+=horizontalSpeed*dt*2.8;
    const t=animation.time,s=animation.swim,wet=animation.wet,air=animation.air;
    const swimFlex=s*(airborne?0:1),wave=Math.sin(t*(2.8+m*3.6));
    const gait=Math.sin(animation.gaitPhase),breath=Math.sin(t*1.65)*.005*(1-air);
    const anticipation=stage==='anticipation'?smooth(0,1,phase):0;
    const landing=airborne?0:clamp(finite(state.landing));
    const groundPush=(airborne||swimming)?0:(1-s)*(1-anticipation*.9)*(1-landing*.8);
    const squash=(anticipation*.045+landing*.060)*(1-s);
    const torsoY=1+breath-squash,volume=1/Math.sqrt(torsoY);
    const bank=-turn*swimFlex*clamp(m)*.065;
    fur.roughness=.78-wet*.34;fur.clearcoat=.08+wet*.43;fur.bumpScale=.014-wet*.008;
    muzzleMaterial.roughness=.69-wet*.27;muzzleMaterial.clearcoat=.12+wet*.30;
    for(const layer of furLayers){
      layer.lengthUniform.value=(.006-wet*.0048)*layer.fraction;
      layer.material.roughness=.86-wet*.32;
      layer.material.alphaTest=.16+layer.fraction*.74+wet*.055;
    }
    // Keep the skull rigid while the soft torso compresses.
    core.scale.set(1,1,1);
    middle.scale.set(volume,torsoY,volume);
    core.rotation.set(animation.airPitch+gait*m*groundPush*.012,0,bank);
    middle.rotation.set(gait*m*groundPush*.035+
      Math.sin(t*(2.8+m*3.6)+.45)*swimFlex*m*.015,
      -wave*swimFlex*m*.018+turn*swimFlex*m*.012,0);
    head.position.set(...HEAD_ANCHOR);
    head.rotation.set(swimFlex*.012,
      Math.sin(t*.57)*.018*(1-s)*(1-air)+turn*swimFlex*m*.012,
      animation.mood==='curious'?Math.sin(t*.63)*.012*(1-s)*(1-air):0);
    tail.rotation.set(wave*swimFlex*m*.022,
      wave*swimFlex*m*.10+turn*swimFlex*m*.018,0);
    visual.position.y=Math.abs(gait)*m*groundPush*.012+swimFlex*Math.sin(t*1.9)*.005;
    for(const f of flippers){
      f.pivot.rotation.copy(f.rest);
      // Local attachments remain on their weighted skin.
      if(f.hind){
        f.pivot.rotation.x+=s*.14+wave*swimFlex*m*.045;
        f.pivot.rotation.y+=f.side*wave*swimFlex*m*.07;
        f.pivot.rotation.z+=f.side*wave*swimFlex*m*.025;
      }else{
        f.pivot.rotation.x+=s*.40+gait*m*groundPush*.055;
        f.pivot.rotation.y+=f.side*(s*.25+air*.06-gait*m*groundPush*.035);
        f.pivot.rotation.z+=f.side*(swimFlex*wave*m*.055+gait*m*groundPush*.050+air*.04);
      }
    }
    const blinkPhase=t%5.3,blink=blinkPhase>5.12?Math.max(.055,Math.abs(blinkPhase-5.21)/.09):1;
    const soft=(animation.mood==='calm'||animation.mood==='happy')?.94:1;
    for(const eye of eyes)eye.scale.y=blink*soft;
    chin.position.y=chinRestY+(animation.mood==='happy'?Math.sin(t*2)*.004:0);
    shadow.position.y=.016-jumpHeight/scale;
    shadow.visible=!swimming&&!state.overWater;
    shadowMaterial.opacity=(1-s)*Math.exp(-jumpHeight*1.4);
    Object.assign(motion,{gaitPhase:animation.gaitPhase,groundPush,jumpStage:stage,jumpHeight,
      airborne,anticipation,landing,airPitch:animation.airPitch,bank,coreY:1,torsoY});
    root.userData.wetness=wet;root.userData.swimBlend=s;
  };
  root.userData.update(0,{mode:'land'});
  return root;
}

/** Release geometry, skeleton and shared maps exactly once. */
export function disposeLumaProxy(proxy) {
  const geometries=new Set(),materials=new Set(),textures=new Set(),skeletons=new Set();
  proxy?.traverse(o=>{
    if(o.geometry)geometries.add(o.geometry);if(o.skeleton)skeletons.add(o.skeleton);
    const list=Array.isArray(o.material)?o.material:[o.material];
    for(const m of list)if(m){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}
  });
  skeletons.forEach(s=>s.dispose());geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());
}
export default createLumaProxy;
