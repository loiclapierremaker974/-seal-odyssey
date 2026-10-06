import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// A single skin, from the rear peduncle through the raised chest to the skull.
// z, centre height, horizontal radius, vertical radius; local forward is +Z.
const PROFILE = [
  [-1.72, .24, .025, .025], [-1.52, .28, .22, .20],
  [-1.20, .37, .43, .33], [-.78, .48, .59, .45],
  [-.28, .57, .68, .54], [.18, .67, .65, .63],
  [.52, .84, .54, .73], [.78, 1.12, .45, .68],
  [1.02, 1.41, .49, .53], [1.24, 1.48, .52, .47],
  [1.46, 1.45, .42, .37], [1.64, 1.36, .25, .23],
  [1.76, 1.31, .025, .025],
];

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
    const v = r / rings, z = -1.72 + v * 3.48;
    const [centre, rx, ry] = sampleProfile(z);
    const head = smooth(.48, 1.12, z), tail = 1 - smooth(-1.45, -.72, z);
    for (let s = 0; s <= sections; s++) {
      const u = s / sections, angle = u * Math.PI * 2;
      const x = Math.sin(angle) * rx;
      let y = centre - Math.cos(angle) * ry;
      // Soft, grounded ventral plane; the chest still rises into the head.
      y = Math.max(.035, y);
      positions.push(x, y, z);
      uvs.push(u, v);
      skinIndices.push(0, 1, 2, 0);
      weights.push(1 - head - tail, head, tail, 0);
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
    skinIndices.push(0, 1, 2, 0); weights.push(r ? 0 : 0, r ? 1 : 0, r ? 0 : 1, 0);
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
  return geometry;
}

function randomGenerator(seed) {
  return () => { seed = Math.imul(seed ^ seed >>> 15, 1 | seed); seed ^= seed + Math.imul(seed ^ seed >>> 7, 61 | seed); return ((seed ^ seed >>> 14) >>> 0) / 4294967296; };
}

function makeSkinTextures(highDetail) {
  const width = highDetail ? 1024 : 512, height = width / 2;
  const albedo = new Uint8Array(width * height * 4);
  const relief = new Uint8Array(albedo.length), roughness = new Uint8Array(albedo.length);
  const random = randomGenerator(16753);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = x / width, v = y / (height - 1), i = (y * width + x) * 4;
    const ventral = Math.pow((1 + Math.cos(u * Math.PI * 2)) * .5, 2.1);
    const cream = clamp(ventral * .94 + smooth(.85, .99, v) * .30);
    const grain = random() - .5;
    const cloud = Math.sin(u * Math.PI * 14 + Math.sin(v * 19)) * Math.sin(v * 37) * 6;
    const silver = [137, 147, 153], pale = [229, 222, 207];
    for (let c = 0; c < 3; c++) albedo[i+c] = silver[c] * (1-cream) + pale[c]*cream + cloud + grain*11;
    albedo[i+3] = relief[i+3] = roughness[i+3] = 255;
    const hair = clamp(.5 + grain * .22 + Math.sin(x * .83 + y * .14) * .035);
    relief[i] = relief[i+1] = relief[i+2] = Math.round(hair*255);
    roughness[i] = roughness[i+1] = roughness[i+2] = 218 + Math.round(grain*20);
  }
  // Irregular, softly edged mottling printed into the skin, including the head.
  for (let spot = 0; spot < 190; spot++) {
    const u = random(), v = .07 + random() * .91;
    const rx = (v > .78 ? .008 : .011) + random()*.010;
    const ry = .007 + random() * .014;
    const rotation = random() * Math.PI, phase = random() * 6.28;
    const strength = .40 + random() * .32;
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
    t.needsUpdate = true; return t;
  };
  return { map:texture(albedo,true), bumpMap:texture(relief,false), roughnessMap:texture(roughness,false) };
}

function flipperGeometry(highDetail, hind = false) {
  const rings = highDetail ? 22 : 14, sides = highDetail ? 24 : 16;
  const p=[], uv=[], idx=[], length=hind ? .79 : .96;
  for(let r=0;r<=rings;r++) {
    const t=r/rings, breadth=(hind?.28:.21)*Math.pow(Math.sin(Math.PI*t),.58)+.025*(1-t);
    for(let s=0;s<=sides;s++) {
      const a=s/sides*Math.PI*2;
      const fingertip=Math.pow(t,8)*.045*Math.sin(s/sides*Math.PI*10);
      p.push(Math.sin(a)*breadth, Math.cos(a)*(.012+.035*Math.sin(Math.PI*t)), length*t+fingertip);
      uv.push(.27+Math.sin(a)*breadth*.32,.16+t*.57);
    }
  }
  for(let r=0;r<rings;r++)for(let s=0;s<sides;s++){
    const a=r*(sides+1)+s,b=a+sides+1;idx.push(a,b,a+1,b,b+1,a+1);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);
  g.computeVertexNormals();g.computeBoundingSphere();return g;
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
  Object.assign(root.userData,{kind:'guardian',sealId:'luma',isProceduralProxy:true,modelRevision:'luma-reference-v1',collisionRadius:.68*scale});
  const visual=new THREE.Group();root.add(visual);
  const textures=makeSkinTextures(highDetail);
  const fur=new THREE.MeshPhysicalMaterial({color:0xffffff,...textures,metalness:0,roughness:.72,bumpScale:.009,clearcoat:.15,clearcoatRoughness:.38,envMapIntensity:.8});
  const muzzleMaterial=new THREE.MeshPhysicalMaterial({color:0xe6ddc9,roughness:.69,metalness:0,bumpMap:textures.bumpMap,bumpScale:.004,clearcoat:.12});
  const noseMaterial=new THREE.MeshPhysicalMaterial({color:0x382c29,roughness:.3,clearcoat:.3});
  const eyeMaterial=new THREE.MeshPhysicalMaterial({color:0x080c10,roughness:.065,metalness:0,clearcoat:1,clearcoatRoughness:.03,envMapIntensity:1.4});
  const lidMaterial=new THREE.MeshStandardMaterial({color:0x665f5c,roughness:.65});
  const mouthMaterial=new THREE.MeshStandardMaterial({color:0x473731,roughness:.7});
  const sphere=new THREE.SphereGeometry(1,highDetail?32:20,highDetail?24:14);
  const body=new THREE.SkinnedMesh(createSkinGeometry(highDetail),fur);
  body.name='Luma continuous skin';body.castShadow=shadows;body.receiveShadow=true;body.frustumCulled=false;
  const core=new THREE.Bone(),head=new THREE.Bone(),tail=new THREE.Bone();
  core.name='Luma spine';head.name='Luma head';tail.name='Luma rear propulsion';
  head.position.set(0,1.10,.65);tail.position.set(0,.30,-1.15);
  core.add(head,tail);body.add(core);visual.add(body);body.bind(new THREE.Skeleton([core,head,tail]));

  const face=new THREE.Group();face.name='Luma expression';head.add(face);
  const facePos=(x,y,z)=>[x,y-1.10,z-.65];
  for(const side of [-1,1])addMesh(face,'Luma soft muzzle',sphere,muzzleMaterial,facePos(side*.135,1.315,1.70),[.235,.165,.162]);
  const chin=addMesh(face,'Luma chin',sphere,muzzleMaterial,facePos(0,1.19,1.60),[.245,.10,.17]);
  const nose=addMesh(face,'Luma seal nose',sphere,noseMaterial,facePos(0,1.43,1.80),[.12,.082,.065]);
  // Two recessed nostrils in the fleshy triangular nose.
  for(const side of [-1,1]) {
    const nostril=addMesh(face,'Luma nostril',sphere,eyeMaterial,facePos(side*.046,1.438,1.852),[.023,.028,.008]);
    nostril.rotation.z=side*.35;
  }
  const mouth=curveMesh([[-.23,.138,.99],[-.12,.114,1.07],[0,.145,1.095],[.12,.114,1.07],[.23,.138,.99]],.009,mouthMaterial,highDetail);
  mouth.name='Luma gentle mouth';face.add(mouth);
  const philtrum=curveMesh([[0,.31,1.19],[0,.23,1.20],[0,.145,1.095]],.007,mouthMaterial,highDetail);face.add(philtrum);

  const eyes=[];
  for(const side of [-1,1]) {
    const socket=new THREE.Group();socket.position.set(...facePos(side*.30,1.61,1.50));socket.rotation.y=side*.36;face.add(socket);
    addMesh(socket,'Luma eyelid rim',sphere,lidMaterial,[0,0,0],[.148,.167,.087]);
    const blink=new THREE.Group();socket.add(blink);
    const eye=addMesh(blink,side<0?'Luma left eye':'Luma right eye',sphere,eyeMaterial,[0,0,.032],[.128,.147,.087]);
    // Small reflected sky patches move and close with the cornea.
    const glintMaterial=new THREE.MeshBasicMaterial({color:0xf1f5f0,transparent:true,opacity:.82});
    addMesh(blink,'Luma corneal reflection',sphere,glintMaterial,[-.041,.061,.109],[.033,.021,.009]).castShadow=false;
    addMesh(blink,'Luma small eye reflection',sphere,glintMaterial,[.052,-.042,.110],[.012,.010,.005]).castShadow=false;
    eyes.push(blink);eye.userData.cornea=true;
  }

  const whiskerMaterial=new THREE.MeshStandardMaterial({color:0xeee4d2,roughness:.58});
  const whiskerGeometries=[], follicles=[];
  for(const side of [-1,1])for(let i=0;i<(highDetail?12:8);i++){
    const band=i%3, row=Math.floor(i/3), x=side*(.12+band*.058);
    const y=.205+row*.038, z=1.178-band*.011;
    follicles.push([x,y,z]);
    const reach=.52+(i%4)*.052;
    const whisker=curveMesh([[x,y,z],[side*(.33+band*.02),y+.018,z+.075],[side*(.55+reach*.3),y+(i-5)*.025,z+.048],[side*(.30+reach),y+(i-5)*.043,z-.075]],highDetail?.0027:.0031,whiskerMaterial,highDetail);
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
    pivot.position.set(side*(hind?.15:.51),hind?.24:.24,hind?-1.52:.42);
    visual.add(pivot);
    const blade=addMesh(pivot,hind?'Luma webbed hind flipper':'Luma tapered fore flipper',flipperGeometry(highDetail,hind),fur,[0,0,0]);
    pivot.rotation.set(hind?-.06:.19,side*(hind?2.82:1.01),0);
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

  const animation={time:0,mood:'curious',swim:0,wet:0};
  root.userData.setMood=(mood='curious')=>{animation.mood=mood;};
  root.userData.update=(delta=0,state={})=>{
    const dt=clamp(Number(delta)||0,0,.1);animation.time+=dt;
    const swimming=state.mode==='surface'||state.mode==='underwater';
    animation.swim+=((swimming?1:0)-animation.swim)*(1-Math.exp(-5*dt));
    animation.wet+=((swimming?1:0)-animation.wet)*(1-Math.exp(-(swimming?3.2:.075)*dt));
    const t=animation.time,s=animation.swim,m=clamp((Number(state.speed)||0)/4.25,0,1.5),wet=animation.wet;
    const wave=Math.sin(t*(3.2+m*4)),breath=Math.sin(t*1.65)*.009;
    fur.roughness=.72-wet*.30;fur.clearcoat=.15+wet*.39;fur.bumpScale=.009-wet*.004;
    muzzleMaterial.roughness=.69-wet*.27;muzzleMaterial.clearcoat=.12+wet*.30;
    head.position.set(0,1.10-s*.57,.65+s*.08);
    head.rotation.set(s*.12,Math.sin(t*.57)*.026*(1-m*.4),animation.mood==='curious'?Math.sin(t*.63)*.038*(1-s):0);
    tail.rotation.y=wave*s*(.05+m*.18);tail.rotation.z=wave*s*.045;
    core.scale.y=1+breath;
    visual.position.y=(1-s)*Math.abs(wave)*m*.025+s*Math.sin(t*1.9)*.015;
    for(const f of flippers){
      f.pivot.rotation.copy(f.rest);
      if(f.hind){f.pivot.rotation.y+=f.side*wave*s*(.12+m*.31);f.pivot.rotation.x+=wave*s*.1;}
      else{
        f.pivot.position.y=.24+s*.14;
        f.pivot.rotation.y+=f.side*s*.71;
        f.pivot.rotation.z+=f.side*(s*.16+s*wave*.07+(1-s)*wave*m*.06);
        f.pivot.rotation.x-=s*.18;
      }
    }
    const phase=t%5.3,blink=phase>5.12?Math.max(.055,Math.abs(phase-5.21)/.09):1;
    const soft=animation.mood==='calm'||animation.mood==='happy'?.9:1;
    for(const eye of eyes)eye.scale.y=blink*soft;
    chin.position.y=.09+(animation.mood==='happy'?Math.sin(t*2)*.006:0);
    shadow.visible=!swimming;shadowMaterial.opacity=1-s;
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
