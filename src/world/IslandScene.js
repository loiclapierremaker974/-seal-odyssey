import {sampleLumaPresentation} from './lumaPresentation.js';
import {createOverworld,sampleOverworld,facingDirection,TILE} from './overworldData.js';
import {extractSpriteComponents} from './overworldAtlas.js';
import {loadOverworldAssets,DIRECTIONS,PROP_KINDS,propMaterial} from './overworldSprites.js';
import {createTerrainMesh,createComponentMask,makeObjectTexture} from './overworldRender.js';
import * as THREE from 'three';
import { INTERACTION, WORLD } from '../config/gameplay.js';
import { ISLANDS, EXPLORATION_ENCOUNTERS, ISLAND_PLANE_SIZE, isIslandFallbackLand } from './islandDefinitions.js';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const TAU=Math.PI*2;
export const OVERHEAD_POSES=Object.freeze(['idle','slide','swim','hop','landing','happy']);
/** RGBA channels are source PNG bytes, not linearised shader colours. */
export function classifyPixel(r,g,b,a=255){
 const water=a<32||(b>r*1.18&&g>r*1.16&&b>g*.78&&b>48&&g>42)||(b>r*1.35&&b>g*.91&&b>35&&r<170);
 return {isLand:!water,blocked:!water&&a>150&&g>48&&g>r*1.35&&g>b*1.4};
}
export function buildIslandMask(pixels,width,height){
 const data=pixels?.data||pixels;
 if(!data||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||data.length<width*height*4)throw new TypeError('Invalid island pixel buffer.');
 const flags=new Uint8Array(width*height);
 for(let i=0;i<flags.length;i++){const pixel=classifyPixel(data[i*4],data[i*4+1],data[i*4+2],data[i*4+3]);flags[i]=(pixel.isLand?2|(pixel.blocked?4:0):1)|(data[i*4+3]>=128?8:0);}
 return {width,height,flags};
}
export function sampleIslandMask(mask,island,x,z,size=ISLAND_PLANE_SIZE){
 if(!mask)return null;
 const u=(x-island.center.x)/size+.5,v=(z-island.center.z)/size+.5;
 if(u<0||u>1||v<0||v>1)return {isLand:false,blocked:false};
 const ix=clamp(Math.floor(u*mask.width),0,mask.width-1),iy=clamp(Math.floor(v*mask.height),0,mask.height-1),flag=mask.flags[iy*mask.width+ix];let green=0,count=0;
 for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const xx=ix+dx,yy=iy+dz;if(xx<0||yy<0||xx>=mask.width||yy>=mask.height)continue;count++;if(mask.flags[yy*mask.width+xx]&4)green++;}
 const stoneGlyph=island.id==='ruines'&&island.site&&(flag&8)&&!(flag&4)&&Math.hypot(x-island.site.x,z-island.site.z)<=3;
 return {isLand:Boolean(flag&2)||Boolean(stoneGlyph),blocked:Boolean(flag&4)&&green>=Math.ceil(count*.55)};
}
export function cropOverheadFrames(pixels,width,height){
 const data=pixels?.data||pixels;if(!data||width<3||height<2||data.length<width*height*4)throw new TypeError('Invalid Luma atlas pixels.');
 let transparent=0;for(let i=3;i<width*height*4;i+=4)if(data[i]<16)transparent++;
 if(transparent<width*height*.3)throw new Error('Luma atlas must have a genuine transparent background.');
 const frames={};let maximum=1;
 for(let i=0;i<6;i++){
  const left=Math.floor((i%3)*width/3),right=Math.floor(((i%3)+1)*width/3),top=Math.floor(Math.floor(i/3)*height/2),bottom=Math.floor((Math.floor(i/3)+1)*height/2);
  let minX=right,minY=bottom,maxX=-1,maxY=-1,count=0;
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)if(data[(y*width+x)*4+3]>=128){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);count++;}
  if(count<4)throw new Error('Luma pose is empty: '+OVERHEAD_POSES[i]);
  minX=Math.max(left,minX-2);minY=Math.max(top,minY-2);maxX=Math.min(right-1,maxX+2);maxY=Math.min(bottom-1,maxY+2);
  const w=maxX-minX+1,h=maxY-minY+1;frames[OVERHEAD_POSES[i]]={x:minX,y:minY,width:w,height:h,uv:[(minX+.5)/width,1-(minY+h-.5)/height,(w-1)/width,(h-1)/height]};maximum=Math.max(maximum,w,h);
 }
 return {frames,pixelsPerUnit:maximum/2.35,width,height};
}
export async function loadIslandAssets({islands=ISLANDS,baseUrl='/',loader=new THREE.TextureLoader()}={}){
 const pending=new Map(),owned=new Set();
 const load=path=>{const url=baseUrl.replace(/\/?$/,'/')+path.replace(/^\//,'');
  if(!pending.has(url))pending.set(url,loader.loadAsync(url).then(texture=>{owned.add(texture);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;texture.magFilter=THREE.LinearFilter;return texture;}));return pending.get(url);
 };
 try{
  const tasks=islands.map(async island=>[island.id,await load(island.texture)]),atlasTask=load('assets/exploration/luma-overhead.png');
  const [entries,atlasTexture]=await Promise.all([Promise.all(tasks),atlasTask]);
  for(const [,t]of entries){t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;}atlasTexture.generateMipmaps=false;atlasTexture.minFilter=THREE.LinearFilter;let disposed=false;
  return {maps:new Map(entries),atlasTexture,dispose(){if(disposed)return;disposed=true;for(const t of owned)t.dispose();owned.clear();}};
 }catch(error){await Promise.allSettled(pending.values());for(const t of owned)t.dispose();owned.clear();throw error;}
}
function readPixels(image,documentRef,maximum=null){
 const sw=image?.naturalWidth||image?.width,sh=image?.naturalHeight||image?.height;if(!(sw>0&&sh>0))throw new Error('An exploration image has no dimensions.');
 const scale=maximum?Math.min(1,maximum/Math.max(sw,sh)):1,width=Math.max(1,Math.round(sw*scale)),height=Math.max(1,Math.round(sh*scale));
 const canvas=documentRef.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d',{willReadFrequently:true});
 if(!context)throw new Error('Exploration collision decoding requires a 2D canvas.');
 context.drawImage(image,0,0,width,height);const pixels=context.getImageData(0,0,width,height);canvas.width=canvas.height=1;return {pixels,width,height};
}
const WORLD_VERTEX='varying vec2 vUv;varying vec2 vWorld;void main(){vUv=uv;vec4 p=modelMatrix*vec4(position,1.0);vWorld=p.xz;gl_Position=projectionMatrix*viewMatrix*p;}';
const RIPPLE_GLSL='uniform vec4 uRipples[16];float ripple(vec2 p){float value=0.0;for(int i=0;i<16;i++){vec4 r=uRipples[i];float age=uTime-r.z;if(r.w>0.0&&age>=0.0&&age<1.8){float d=length(p-r.xy);float ring=1.0-smoothstep(.08,.25,abs(d-age*1.8));value+=ring*(1.0-age/1.8)*r.w;}}return value;}';
function seaMaterial(clock,ripples){
 return new THREE.ShaderMaterial({uniforms:{uTime:clock,uRipples:{value:ripples}},vertexShader:WORLD_VERTEX,fragmentShader:'uniform float uTime;varying vec2 vUv;varying vec2 vWorld;'+RIPPLE_GLSL+'void main(){float waves=sin(vWorld.x*.62+vWorld.y*.94-uTime*.44)*sin(vWorld.y*.71-uTime*.29);float glint=pow(max(0.0,sin(vWorld.x*3.7+sin(vWorld.y*2.9-uTime*.35))*cos(vWorld.y*4.1+sin(vWorld.x*2.3+uTime*.29))),18.0);vec3 color=mix(vec3(.014,.155,.205),vec3(.035,.27,.29),.5+waves*.25);color+=vec3(.05,.11,.105)*glint*.22+vec3(.12,.22,.20)*ripple(vWorld);gl_FragColor=vec4(color,1.0);\n#include <colorspace_fragment>\n}',depthWrite:false,depthTest:false,toneMapped:false});
}
function mapMaterial(texture,clock,ripples){
 return new THREE.ShaderMaterial({uniforms:{uMap:{value:texture},uTime:clock,uRipples:{value:ripples}},vertexShader:WORLD_VERTEX,fragmentShader:'uniform sampler2D uMap;uniform float uTime;varying vec2 vUv;varying vec2 vWorld;'+RIPPLE_GLSL+'void main(){vec4 base=texture2D(uMap,vUv);if(base.a<.012)discard;float green=step(base.r*1.26,base.g)*step(base.b*1.2,base.g);vec2 drift=vec2(sin(uTime*.83+vWorld.x*.63),cos(uTime*.67+vWorld.y*.5))*.00065*green;vec4 color=texture2D(uMap,clamp(vUv+drift,vec2(.0001),vec2(.9999)));float water=step(base.r*1.18,base.b)*step(base.r*1.16,base.g)*step(base.g*.78,base.b);float shine=sin(uTime*.9+vWorld.x*1.3+vWorld.y*.6)*.017;float response=water>.5?ripple(vWorld):0.0;color.rgb+=water*(shine+response*.10);gl_FragColor=color;\n#include <colorspace_fragment>\n}',transparent:true,depthWrite:false,depthTest:false,toneMapped:false});
}
function sealMaterial(texture){
 return new THREE.ShaderMaterial({uniforms:{uMap:{value:texture},uMask:{value:null},uComponent:{value:1},uRect:{value:new THREE.Vector4(0,0,1,1)},uSize:{value:new THREE.Vector2(2,2)},uStride:{value:0},uFacing:{value:new THREE.Vector2(0,-1)},uDrive:{value:0},uBody:{value:0},uOpacity:{value:1},uTint:{value:new THREE.Color(1,1,1)}},vertexShader:"uniform vec2 uSize;uniform vec2 uFacing;uniform float uStride;uniform float uDrive;uniform float uBody;varying vec2 vUv;void main(){vUv=uv;vec3 p=position;vec2 side=vec2(-uFacing.y,uFacing.x);float axial=dot(p.xy,uFacing);float lateral=dot(p.xy,side);float tail=1.0-smoothstep(-.32,.12,axial);float flipper=smoothstep(.18,.40,abs(lateral));p.xy+=side*(sin(uStride+axial*4.0)*.023*tail+sign(lateral)*sin(uStride*2.0)*.012*flipper)*uDrive;p.xy+=uFacing*axial*uBody;p.xy*=uSize;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}",fragmentShader:'uniform sampler2D uMap;uniform sampler2D uMask;uniform float uComponent;uniform vec4 uRect;uniform vec3 uTint;uniform float uOpacity;varying vec2 vUv;void main(){vec2 a=uRect.xy+vUv*uRect.zw;vec4 c=texture2D(uMap,a);float id=texture2D(uMask,vec2(a.x,1.0-a.y)).r*255.0;if(abs(id-uComponent)>.25||c.a<.012)discard;gl_FragColor=vec4(c.rgb*uTint,c.a*uOpacity);\n#include <colorspace_fragment>\n}',transparent:true,depthTest:false,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});
}
function glyphMaterial(kind,color){
 return new THREE.ShaderMaterial({uniforms:{uColor:{value:new THREE.Color(color)},uOpacity:{value:1},uPhase:{value:0},uKind:{value:kind}},vertexShader:WORLD_VERTEX,fragmentShader:'uniform vec3 uColor;uniform float uOpacity;uniform float uPhase;uniform float uKind;varying vec2 vUv;void main(){vec2 p=(vUv-.5)*2.0;float d=length(p);float a=atan(p.y,p.x);float ring=1.0-smoothstep(.035,.075,abs(d-.67));float rays=(1.0-smoothstep(.035,.08,abs(sin(a*4.0))))*smoothstep(.14,.23,d)*(1.0-smoothstep(.43,.61,d));float core=1.0-smoothstep(.08,.16,d);float spiral=(1.0-smoothstep(.05,.13,abs(sin(a*2.0-d*7.0-uPhase*.45))))*smoothstep(.13,.24,d)*(1.0-smoothstep(.43,.57,d));float shape=ring*.62+core+rays;if(uKind>1.5)shape=ring*.6+spiral+core*.3;float alpha=clamp(shape,0.0,1.0)*uOpacity;if(alpha<.005)discard;gl_FragColor=vec4(uColor,alpha);\n#include <colorspace_fragment>\n}',transparent:true,depthWrite:false,depthTest:false,toneMapped:false,side:THREE.DoubleSide});
}
function effectMaterial(){
 return new THREE.ShaderMaterial({uniforms:{uColor:{value:new THREE.Color(0xc7f6e5)},uProgress:{value:1},uStrength:{value:0},uKind:{value:0}},vertexShader:WORLD_VERTEX,fragmentShader:'uniform vec3 uColor;uniform float uProgress;uniform float uStrength;uniform float uKind;varying vec2 vUv;void main(){vec2 p=(vUv-.5)*2.0;float d=length(p);float ring=1.0-smoothstep(.025,.12,abs(d-(.12+uProgress*.7)));float dust=(1.0-smoothstep(.12,.92,d))*(.4+.6*sin(p.x*31.0+p.y*23.0)*sin(p.y*29.0));float bubbles=0.0;for(int i=0;i<6;i++){float f=float(i);vec2 center=vec2(sin(f*2.4)*.45,cos(f*1.8)*.35+uProgress*.35);bubbles+=1.0-smoothstep(.01,.035,abs(length(p-center)-(.035+uProgress*.025)));}float alpha=(uKind>1.5?bubbles:uKind>.5?dust:ring)*(1.0-uProgress)*uStrength;if(alpha<.003)discard;gl_FragColor=vec4(uColor,alpha);\n#include <colorspace_fragment>\n}',transparent:true,depthWrite:false,depthTest:false,toneMapped:false,side:THREE.DoubleSide});
}
/** Original island plates with a live overhead Luma. */
export class IslandScene{
 constructor({canvas,container,onEchoCollected,onSiteActivated,onProgressChange,baseUrl=import.meta.env?.BASE_URL??'/'}={}){
  this.document=canvas?.ownerDocument||globalThis.document;if(!this.document||!canvas)throw new Error('IslandScene requires its browser canvas.');
  this.canvas=canvas;this.container=container||canvas.parentElement||this.document.body;this.window=this.document.defaultView||globalThis.window;
  const nav=this.window?.navigator||globalThis.navigator;
  this.isMobile=Boolean(this.window?.matchMedia?.('(pointer:coarse)')?.matches||/Android|iPhone|iPad/i.test(nav?.userAgent||''));
  this.lowPower=Boolean(this.isMobile||(nav?.deviceMemory&&nav.deviceMemory<=4)||(nav?.hardwareConcurrency&&nav.hardwareConcurrency<=4));
  this.quality=this.lowPower?'low':'high';this.canvas.dataset.quality=this.quality;this.canvas.dataset.exploration='overworld';this.canvas.dataset.activeIsland=ISLANDS[0].id;
  this.elapsed=0;this.loaded=false;this._disposed=false;this.callbacks={onEchoCollected,onSiteActivated,onProgressChange};this.data=ISLANDS;this.activeIsland=ISLANDS[0];
  this.encounters=EXPLORATION_ENCOUNTERS.filter(e=>e.islandId===this.activeIsland.id);this._collected=new Set();this._resolved=new Set();this._siteRestored=false;this._restoration=0;
  this._geometries=new Set();this._materials=new Set();this._maps=new Map();this._masks=new Map();this._markers=[];this._islandGroups=new Map();this._spawnPoints=new Map();
  this._worlds=new Map(ISLANDS.map(i=>[i.id,createOverworld(i)]));this._props=[];this._textures=new Set();
  this._player=null;this._seal=null;this._motionState=null;this._care=false;this._mood='curious';this._happyTime=0;
  this._focus=new THREE.Vector3(this.activeIsland.spawn.x,0,this.activeIsland.spawn.z);this._cameraTarget=new THREE.Vector3();this._cameraPosition=new THREE.Vector3(this._focus.x,60,this._focus.z);
  this._clock={value:0};this._ripples=Array.from({length:16},()=>new THREE.Vector4(0,0,-100,0));this._rippleCursor=0;this._fxCursor=0;this._wakeTimer=0;this._moteTime=0;
  this.renderer=new THREE.WebGLRenderer({canvas,alpha:false,antialias:!this.lowPower,stencil:false,powerPreference:this.lowPower?'default':'high-performance'});
  this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.NoToneMapping;this.renderer.setPixelRatio(Math.min(this.window?.devicePixelRatio||1,this.lowPower?1.25:1.75));this.renderer.shadowMap.enabled=false;
  this.scene=new THREE.Scene();this.scene.name='Aqualys — illustrated living islands';this.scene.background=new THREE.Color(0x1d687a);
  this.camera=new THREE.OrthographicCamera(-16,16,10,-10,.1,180);this.camera.up.set(0,0,-1);this.camera.position.copy(this._cameraPosition);this.camera.lookAt(this._focus.x,0,this._focus.z);
  this._quadGeometry=this._geometry(new THREE.PlaneGeometry(1,1));this._buildSea();this._buildEffects();this._buildMarkers();this._buildMotes();this._syncMarkers();
  this._resizeHandler=()=>this.resize();this.window?.addEventListener('resize',this._resizeHandler);
  const Observer=this.window?.ResizeObserver||globalThis.ResizeObserver;if(Observer){this._resizeObserver=new Observer(this._resizeHandler);this._resizeObserver.observe(this.container);}
  this.resize();this.focusOn(this._focus,true);
  this.ready=loadOverworldAssets({baseUrl}).then(assets=>{
   if(this._disposed){assets.dispose();throw Error('World disposed during loading');}this._assets=assets;
   try{
    const lumaPixels=readPixels(assets.atlasTexture.image,this.document);
    this._atlas=extractSpriteComponents(lumaPixels.pixels,lumaPixels.width,lumaPixels.height,4,3,[0,1,2].flatMap(row=>DIRECTIONS.map(d=>d+row)),2.5);
    const propPixels=readPixels(assets.props.image,this.document);
    this._propAtlas=extractSpriteComponents(propPixels.pixels,propPixels.width,propPixels.height,3,2,PROP_KINDS,1);
    assets.lumaMask=createComponentMask(this._atlas);assets.propsMask=createComponentMask(this._propAtlas);this._textures.add(assets.lumaMask);this._textures.add(assets.propsMask);
    this._buildOverworld(assets);
    this.loaded=true;this.scene.userData.islandsLoaded=true;this.scene.userData.directionalFrames=12;
    if(this._seal){this._seal.material.uniforms.uMap.value=assets.atlasTexture;this._seal.material.uniforms.uMask.value=assets.lumaMask;this._seal.visible=true;this._applyPose('south0');}
    this.focusOn(this._player?.position||this.getSpawnPosition(),true);return this;
   }catch(error){assets.dispose();this._assets=null;for(const t of this._textures)t.dispose();this._textures.clear();throw error;}
  });
 }
 _buildOverworld(assets){
  const pointTextures=new Map();
  for(const island of ISLANDS){
   const data=this._worlds.get(island.id),group=new THREE.Group();group.name=island.name;group.visible=island.id===this.activeIsland.id;
   const terrain=createTerrainMesh(data,assets.terrain,this._clock,this._ripples);this._geometry(terrain.geometry);this._material(terrain.material);group.add(terrain);this._maps.set(island.id,terrain);
   for(const p of data.props){
    const f=this._propAtlas.frames[p.kind],material=this._material(propMaterial(assets.props,f));
    material.uniforms.uMask={value:assets.propsMask};material.uniforms.uComponent={value:f.component};material.uniforms.uTime=this._clock;material.uniforms.uWind.value=['tree','palm','bush','reeds'].includes(p.kind)?1:0;
    const mesh=new THREE.Mesh(this._quadGeometry,material);mesh.quaternion.copy(this.camera.quaternion);mesh.frustumCulled=false;
    const factor=p.size/(Math.max(f.width,f.height)),w=f.width*factor,h=f.height*factor;
    mesh.scale.set(w,h,1);mesh.position.set(p.x,.27,p.z-h*.5+.22);mesh.renderOrder=1000+p.z*10;mesh.name='Original '+p.kind;
    group.add(mesh);this._props.push({mesh,data:p,islandId:island.id});
    if(p.kind!=='reeds'){
     const shadow=this._plane(this._material(new THREE.ShaderMaterial({uniforms:{uOpacity:{value:p.kind==='tree'||p.kind==='palm'?.17:.11}},vertexShader:WORLD_VERTEX,fragmentShader:'uniform float uOpacity;varying vec2 vUv;void main(){float d=length((vUv-.5)*vec2(2.4,2.8));float a=(1.0-smoothstep(.1,1.0,d))*uOpacity;if(a<.003)discard;gl_FragColor=vec4(.035,.075,.045,a);}',transparent:true,depthTest:false,depthWrite:false,toneMapped:false})),p.size*.65);
     shadow.position.set(p.x,.15,p.z+.12);shadow.renderOrder=-20;group.add(shadow);
    }
   }
   for(const p of data.points){
    if(!pointTextures.has(p.kind)){const t=makeObjectTexture(this.document,p.kind);pointTextures.set(p.kind,t);this._textures.add(t);}
    const material=this._material(new THREE.MeshBasicMaterial({map:pointTextures.get(p.kind),transparent:true,depthTest:false,depthWrite:false,toneMapped:false}));
    const mesh=new THREE.Mesh(this._quadGeometry,material);mesh.quaternion.copy(this.camera.quaternion);const size=p.kind==='shell'?.55:p.kind==='dock'?.75:1.05;
    mesh.scale.setScalar(size);mesh.position.set(p.x,.29,p.z-(p.kind==='sign'?.30:0));mesh.renderOrder=1001+p.z*10;mesh.frustumCulled=false;mesh.name=p.label;group.add(mesh);
   }
   this._islandGroups.set(island.id,group);this.scene.add(group);
  }
 }

 _geometry(g){this._geometries.add(g);return g;}
 _material(m){this._materials.add(m);return m;}
 _plane(material,size=1){const mesh=new THREE.Mesh(this._quadGeometry,material);mesh.rotation.x=-Math.PI/2;mesh.scale.setScalar(size);mesh.frustumCulled=false;return mesh;}
 _buildSea(){this.water=new THREE.Mesh(this._geometry(new THREE.PlaneGeometry(220,180)),this._material(seaMaterial(this._clock,this._ripples)));this.water.name='Animated open Aqualys sea';this.water.position.set(40,-.3,0);this.water.rotation.x=-Math.PI/2;this.water.renderOrder=-100;this.water.userData.surfaceHeight=()=>.06;this.scene.add(this.water);}
 _buildEffects(){this._effects=Array.from({length:this.lowPower?8:16},()=>{const material=this._material(effectMaterial()),mesh=this._plane(material);mesh.visible=false;mesh.renderOrder=32;this.scene.add(mesh);return {mesh,age:1,duration:1,kind:0,strength:0,x:0,z:0,size:1};});}
 _buildMarkers(){
  for(const island of ISLANDS){for(const echo of island.echoes||[])this._marker('echo',echo,island,echo.requiresDive?0x8fcde9:0xf6d69a);if(island.site)this._marker('site',island.site,island,0xbff0c5);}
  for(const encounter of EXPLORATION_ENCOUNTERS){const island=ISLANDS.find(i=>i.id===encounter.islandId);if(island)this._marker('encounter',{...encounter,x:encounter.position.x,z:encounter.position.z},island,0x96e8e4);}
 }
 _marker(type,data,island,color){const material=this._material(glyphMaterial(type==='encounter'?2:type==='site'?1:0,color)),mesh=this._plane(material,type==='site'?1.35:1.05);mesh.name=type+' '+data.id;mesh.position.set(data.x,.22,data.z);mesh.renderOrder=20;this.scene.add(mesh);this._markers.push({type,data,islandId:island.id,mesh,baseSize:type==='site'?1.35:1.05});}
 _buildMotes(){const material=this._material(glyphMaterial(0,0xd6edd0));this._motes=Array.from({length:this.lowPower?8:14},(_,i)=>{const mesh=this._plane(material,.11);mesh.renderOrder=15;mesh.visible=false;this.scene.add(mesh);return {mesh,seed:i*2.399};});}
 add(object){
  if(this._disposed)throw new Error('IslandScene has been disposed.');if(this._player&&this._player!==object){this.scene.add(object);return object;}if(this._player===object)return object;
  this._player=object;this.scene.add(object);object.name=object.name||'Luma';const material=this._material(sealMaterial(this._assets?.atlasTexture||null));
  this._seal=new THREE.Mesh(this._geometry(new THREE.PlaneGeometry(1,1,12,12)),material);this._seal.name='Luma original overhead animation';this._seal.frustumCulled=false;this._seal.renderOrder=40;this._seal.visible=this.loaded;this._seal.rotation.x=-Math.PI/2;object.add(this._seal);
  const shadowMaterial=this._material(new THREE.ShaderMaterial({uniforms:{uOpacity:{value:.18}},vertexShader:WORLD_VERTEX,fragmentShader:'uniform float uOpacity;varying vec2 vUv;void main(){float d=length((vUv-.5)*vec2(2.5,2.0));float a=(1.0-smoothstep(.1,1.0,d))*uOpacity;if(a<.002)discard;gl_FragColor=vec4(.018,.035,.032,a);}',transparent:true,depthWrite:false,depthTest:false,toneMapped:false}));
  this._shadow=this._plane(shadowMaterial,2.2);this._shadow.renderOrder=30;this._shadow.name='Luma live contact shadow';this.scene.add(this._shadow);
  this._previousHooks={setMood:object.userData.setMood,update:object.userData.update,updateAnimation:object.userData.updateAnimation};
  object.userData.setMood=mood=>{this._mood=String(mood||'curious');if(['happy','joyful','playful'].includes(this._mood))this._happyTime=2.2;};
  object.userData.update=(_dt,state)=>{if(state)this._motionState=state;};object.userData.updateAnimation=object.userData.update;object.userData.isIllustratedLuma=true;
  if(this._atlas)this._applyPose('idle');this.focusOn(object.position,true);return object;
 }
 remove(object){
  this.scene.remove(object);if(object===this._player){object.remove(this._seal);this.scene.remove(this._shadow);
   for(const mesh of [this._seal,this._shadow])if(mesh){if(mesh.geometry!==this._quadGeometry){mesh.geometry.dispose();this._geometries.delete(mesh.geometry);}mesh.material.dispose();this._materials.delete(mesh.material);}
   Object.assign(object.userData,this._previousHooks);delete object.userData.isIllustratedLuma;this._seal=this._shadow=this._player=null;
  }return object;
 }
 _applyPose(name){
  if(!this._atlas||!this._seal)return;
  const f=this._atlas.frames[name]||this._atlas.frames.south0,u=this._seal.material.uniforms;
  u.uRect.value.fromArray(f.uv);u.uComponent.value=f.component;u.uSize.value.set(f.width/this._atlas.pixelsPerUnit,f.height/this._atlas.pixelsPerUnit);
  this._seal.userData.pose=name;this.canvas.dataset.direction=name.replace(/[0-9]/g,'');this.canvas.dataset.spriteFrame=name;
 }
 getEnvironmentAt(position={}){
  const x=finite(position.x),z=finite(position.z),y=finite(position.y),island=ISLANDS.find(i=>Math.abs(x-i.center.x)<=15&&Math.abs(z-i.center.z)<=15)||this.activeIsland;
  const sample=sampleOverworld(this._worlds.get(island.id),x,z);let depth=2.7;
  for(const pool of island.deepPools||[])if(((x-pool.x)/pool.rx)**2+((z-pool.z)/pool.rz)**2<=1)depth=Math.max(depth,finite(pool.depth,3.5));
  return {isLand:sample.isLand,blocked:sample.blocked,groundHeight:sample.isLand?.10:-depth,terrainHeight:sample.isLand?.10:-depth,waterLevel:0,surfaceHeight:.06,floatY:.06,submerged:!sample.isLand&&y<-.35,current:this._zeroCurrent||(this._zeroCurrent=new THREE.Vector3()),region:island.id,tileType:sample.type};
 }
 _passable(x,z,radius){
  return !this._worlds.get(this.activeIsland.id).colliders.some(p=>Math.hypot(x-p.x,z-p.z)<p.radius+radius);
 }
 resolveMovement(next,previous,radius=.3){
  const b=this.activeIsland.bounds,r=clamp(finite(radius,.3),0,.75),tx=clamp(finite(next.x),b.minX+r,b.maxX-r),tz=clamp(finite(next.z),b.minZ+r,b.maxZ-r);
  let x=finite(previous?.x,tx),z=finite(previous?.z,tz);const steps=Math.min(512,Math.max(1,Math.ceil(Math.hypot(tx-x,tz-z)/.12))),dx=(tx-x)/steps,dz=(tz-z)/steps;
  for(let i=0;i<steps;i++){const xx=x+dx,zz=z+dz;if(this._passable(xx,zz,r)){x=xx;z=zz;continue;}const canX=this._passable(xx,z,r),canZ=this._passable(x,zz,r);if(canX&&canZ){if(Math.abs(dx)>=Math.abs(dz))x=xx;else z=zz;}else if(canX)x=xx;else if(canZ)z=zz;else break;}
  next.x=clamp(x,b.minX+r,b.maxX-r);next.z=clamp(z,b.minZ+r,b.maxZ-r);return next;
 }
 getSpawnPosition(target=new THREE.Vector3()){
  const island=this.activeIsland;let spawn=this._spawnPoints.get(island.id);
  if(!spawn){const wanted=island.spawn;if(this.getEnvironmentAt(wanted).isLand&&this._passable(wanted.x,wanted.z,.3))spawn={x:wanted.x,z:wanted.z};
   else{outer:for(let r=.35;r<=6;r+=.35)for(let j=0;j<24;j++){const a=j*TAU/24,x=wanted.x+Math.sin(a)*r,z=wanted.z+Math.cos(a)*r,b=island.bounds;if(x<b.minX+.4||x>b.maxX-.4||z<b.minZ+.4||z>b.maxZ-.4)continue;if(this.getEnvironmentAt({x,z}).isLand&&this._passable(x,z,.3)){spawn={x,z};break outer;}}}
   if(!spawn)spawn={x:wanted.x,z:wanted.z};if(this.loaded)this._spawnPoints.set(island.id,spawn);
  }
  const sample=this.getEnvironmentAt(spawn);return target.set(spawn.x,sample.isLand?sample.groundHeight:sample.floatY,spawn.z);
 }
 setIsland(id){
  const i=ISLANDS.find(i=>i.id===id);if(!i||this._disposed)return false;this.activeIsland=i;this.encounters=EXPLORATION_ENCOUNTERS.filter(e=>e.islandId===id);this.canvas.dataset.activeIsland=id;
  for(const [key,group]of this._islandGroups)group.visible=key===id;for(const e of this._effects)e.mesh.visible=false;for(const r of this._ripples)r.w=0;
  this._wakeTimer=0;this._syncMarkers();this.focusOn(this.getSpawnPosition(),true);return true;
 }
 getNearbyMapData(position=this._player?.position||this.activeIsland.spawn){const i=this.activeIsland;return {id:i.id,name:i.name,kicker:i.kicker,description:i.description,echoes:(i.echoes||[]).map(e=>({...e,collected:this._collected.has(e.id),distance:Math.hypot(e.x-position.x,e.z-position.z)})),site:i.site?{...i.site,restored:this._siteRestored}:null,encounters:this.encounters.map(e=>({...e,resolved:this._resolved.has(e.id),distance:Math.hypot(e.position.x-position.x,e.position.z-position.z)}))};}
 findQuestInteraction(position,maximumDistance=INTERACTION.promptRadius){
  if(!position)return null;let nearest=null;
  for(const e of this.activeIsland.echoes||[]){if(this._collected.has(e.id))continue;const distance=Math.hypot(position.x-e.x,position.z-e.z);if(distance>maximumDistance||(nearest&&distance>=nearest.distance))continue;const available=!e.requiresDive||position.y<-.45;
   nearest={type:'echo',id:e.id,label:available?'Écouter '+e.name:'Plongez pour écouter '+e.name,distance,available,requiresDive:Boolean(e.requiresDive),position:new THREE.Vector3(e.x,e.requiresDive?-1:.1,e.z)};
  }
  const site=this.activeIsland.site;if(site){const distance=Math.hypot(position.x-site.x,position.z-site.z),p=this.getProgress();if(distance<=maximumDistance&&(!nearest||distance<nearest.distance))nearest={type:'site',id:site.id,label:p.siteRestored?'Site Ancien restauré':p.echoesCollected===p.echoesTotal?'Réveiller le Site Ancien':(p.echoesTotal-p.echoesCollected)+' Écho(s) requis',distance,available:p.echoesCollected===p.echoesTotal&&!p.siteRestored,position:new THREE.Vector3(site.x,.1,site.z)};}return nearest;
 }
 findInteraction(position,maximumDistance=INTERACTION.promptRadius){
  const quest=this.findQuestInteraction(position,maximumDistance);if(quest)return quest;
  let nearest=null;
  for(const p of this._worlds.get(this.activeIsland.id).points){const distance=Math.hypot(position.x-p.x,position.z-p.z);if(distance<=maximumDistance&&(!nearest||distance<nearest.distance))nearest={...p,type:'scenery',distance,available:true};}
  return nearest;
 }
 interact(position){const i=this.findInteraction(position);if(!i)return {success:false,reason:'out-of-range'};if(i.type==='scenery'){if(i.distance>1.8)return {success:false,reason:'too-far',...i};this._happyTime=1;this._emitEffect(i.x,i.z,0,.35,1.2,0xf4dba6);return {success:true,...i};}const r=i.type==='echo'?INTERACTION.echoRadius:INTERACTION.siteRadius;if(i.distance>r)return {success:false,reason:'too-far',...i};if(i.requiresDive&&!i.available)return {success:false,reason:'dive-required',...i};return i.type==='echo'?this.collectEcho(i.id):this.activateAncientSite();}
 collectEcho(id,{silent=false,immediate=false}={}){
  const e=ISLANDS.flatMap(i=>i.echoes||[]).find(e=>e.id===id);if(!e)return {success:false,reason:'unknown-echo',id};if(this._collected.has(id))return {success:false,reason:'already-collected',id};
  this._collected.add(id);this._happyTime=1.1;this._syncMarkers();if(!immediate)this._emitEffect(e.x,e.z,0,.7,1.8,0xf8dea3);
  const p=this.getProgress(),result={success:true,type:'echo',id,collected:p.echoesCollected,total:p.echoesTotal};if(!silent){this.callbacks.onEchoCollected?.(result);this.callbacks.onProgressChange?.(p);}return result;
 }
 activateAncientSite({silent=false,immediate=false}={}){
  const p=this.getProgress();if(this._siteRestored)return {success:false,reason:'already-restored',id:WORLD.ancientSiteId};if(p.echoesCollected<p.echoesTotal)return {success:false,reason:'echoes-required',missing:p.echoesTotal-p.echoesCollected,id:WORLD.ancientSiteId};
  this._siteRestored=true;if(immediate)this._restoration=1;this._happyTime=2.5;this._syncMarkers();const site=ISLANDS.find(i=>i.site)?.site;if(site&&!immediate)this._emitEffect(site.x,site.z,0,1,3,0xbff8de);
  const result={success:true,type:'site',id:WORLD.ancientSiteId,restored:true};if(!silent){this.callbacks.onSiteActivated?.(result);this.callbacks.onProgressChange?.(this.getProgress());}return result;
 }
 setProgress({echoIds,echoes,echoesCollected,siteRestored=false}={}){
  const all=ISLANDS.flatMap(i=>i.echoes||[]).map(e=>e.id),ids=Array.isArray(echoIds)?echoIds:Array.isArray(echoes)?echoes:Number.isFinite(echoesCollected)?all.slice(0,echoesCollected):[];
  this._collected=new Set(ids.filter(id=>all.includes(id)));this._siteRestored=Boolean(siteRestored);this._restoration=this._siteRestored?1:0;this._syncMarkers();return this.getProgress();
 }
 getProgress(){const all=ISLANDS.flatMap(i=>i.echoes||[]).map(e=>e.id),echoIds=all.filter(id=>this._collected.has(id));return {echoIds,echoesCollected:echoIds.length,echoesTotal:all.length,siteId:WORLD.ancientSiteId,siteRestored:this._siteRestored,restoration:this._restoration};}
 setCallbacks(callbacks={}){Object.assign(this.callbacks,callbacks);}
 setResolvedEncounterIds(ids=[]){this._resolved=new Set(ids);this._syncMarkers();}
 _syncMarkers(){for(const m of this._markers)m.mesh.visible=m.islandId===this.activeIsland.id&&(m.type==='echo'?!this._collected.has(m.data.id):m.type==='encounter'?!this._resolved.has(m.data.id):true);}
 getAmbienceState(target={}){target.underwater=this._underwaterMix||0;target.restored=this._restoration;return target;}

 resize(width,height){
  if(this._disposed)return;
  const bounds=this.container?.getBoundingClientRect?.(),w=Math.max(1,Math.round(width||bounds?.width||this.window?.innerWidth||1)),h=Math.max(1,Math.round(height||bounds?.height||this.window?.innerHeight||1));
  const ratio=Math.min(this.window?.devicePixelRatio||1,this.lowPower?1.25:1.75);
  if(this.renderer.getPixelRatio()!==ratio)this.renderer.setPixelRatio(ratio);
  if(this._width!==w||this._height!==h){this.renderer.setSize(w,h,false);this._width=w;this._height=h;}
  this._aspect=w/h;this._wantedHalfH=this._care?Math.max(2.15,1.65/this._aspect):(h>w?7.4/this._aspect:10)*.90;
  if(!Number.isFinite(this._halfH))this._halfH=this._wantedHalfH;this._projectCamera();
 }
 _projectCamera(){
  const halfH=this._halfH,halfW=halfH*(this._aspect||1);this.canvas.dataset.cameraSpan=(halfH*2).toFixed(3);this.canvas.dataset.cameraZoom=(1/halfH).toFixed(4);
  Object.assign(this.camera,{left:-halfW,right:halfW,top:halfH,bottom:-halfH});this.camera.updateProjectionMatrix();
 }
 focusOn(position,immediate=false){
  if(!position||this._disposed)return;
  this._focus.set(finite(position.x),0,finite(position.z));if(immediate)this._updateCamera(0,true);
 }
 setCareFocus(active){
  this._care=Boolean(active);if(this._care)this._happyTime=Math.max(this._happyTime,1.2);
  this.resize();this.focusOn(this._player?.position||this._focus);
 }
 _updateCamera(dt,immediate=false){
  const bounds=this.activeIsland.bounds;
  this._cameraTarget.set(clamp(this._focus.x,bounds.minX,bounds.maxX),60,clamp(this._focus.z,bounds.minZ,bounds.maxZ)+(this._care?0:this._halfH*.14));
  const blend=immediate?1:1-Math.exp(-Math.max(0,dt)*7.5);this._cameraPosition.lerp(this._cameraTarget,blend);
  const zoom=immediate?1:1-Math.exp(-Math.max(0,dt)*8);
  const previous=this._halfH;this._halfH=THREE.MathUtils.lerp(this._halfH,this._wantedHalfH,zoom);
  if(Math.abs(previous-this._halfH)>.0001)this._projectCamera();
  this.camera.position.copy(this._cameraPosition);this.camera.lookAt(this._cameraPosition.x,0,this._cameraPosition.z);this.camera.updateMatrixWorld(true);
 }
 setContainer(container){
  if(!container||this._disposed)return;this.container=container;
  this._resizeObserver?.disconnect();this._resizeObserver?.observe(container);this.resize();
 }
 _emitEffect(x,z,kind,strength,size=1.8,color=0xc8f1e4){
  if(this._disposed)return;
  const slot=this._effects[this._fxCursor++%this._effects.length];
  Object.assign(slot,{age:0,duration:kind===2 ? 1.25 : kind ? .55 : .95,kind,strength:clamp(strength,.04,1),x,z,size});
  slot.mesh.visible=true;slot.mesh.position.set(x,.24,z);slot.mesh.scale.setScalar(size);slot.mesh.material.uniforms.uColor.value.set(color);
 }
 _impact(x,z,strength){
  const count=this.lowPower?8:16,slot=this._ripples[this._rippleCursor++%count];slot.set(x,z,this.elapsed,clamp(strength,.03,1));
 }
 emitLumaMotion(type,position,strength=.4){
  if(!position||this._disposed)return;
  const x=position.x,z=position.z;
  if(type==='splash'){this._impact(x,z,strength);this._emitEffect(x,z,0,strength,2.5);}
  else if(type==='land')this._emitEffect(x,z,1,strength,1.9,0xe8d1a1);
  else if(type==='dive'||type==='surface'){this._impact(x,z,strength*.8);this._emitEffect(x,z,2,strength,1.7,0xc6f6ef);}
  else if(type==='hop')this._emitEffect(x,z,1,strength*.35,1.1,0xe9d4b1);
 }
 updateLumaMotion(position,state,delta,enabled=true){
  if(this._disposed||!position||!state)return;
  this._motionState=state;this._motionEnabled=enabled;
  const dt=clamp(finite(delta),0,.1);this._happyTime=Math.max(0,this._happyTime-dt);
  this._underwaterMix=THREE.MathUtils.lerp(this._underwaterMix||0,state.mode==='underwater'?1:0,1-Math.exp(-dt*4));
  if(!this._seal||!this._atlas)return;
  const speed=enabled?finite(state.horizontalSpeed,finite(state.speed)):0;
  const water=state.mode!=='land',under=state.mode==='underwater';
  const direction=this._care?'south':facingDirection(finite(state.heading));
  const pose=sampleLumaPresentation(state,this.elapsed,{enabled,care:this._care});
  this._applyPose(direction+pose.frame);
  const material=this._seal.material,uniforms=material.uniforms;
  uniforms.uStride.value=pose.stride;
  uniforms.uDrive.value=THREE.MathUtils.lerp(uniforms.uDrive.value,pose.drive,1-Math.exp(-dt*10));
  uniforms.uFacing.value.set(direction==='east'?1:direction==='west'?-1:0,direction==='north'?1:direction==='south'?-1:0);
  uniforms.uBody.value=pose.body;
  const immersion=this._underwaterMix;
  uniforms.uTint.value.setRGB(1-immersion*.50,1-immersion*.16,1+immersion*.12);
  uniforms.uOpacity.value=1-immersion*.22;
  const heading=this._care?0:finite(state.heading);
  this._bank=THREE.MathUtils.lerp(this._bank||0,pose.bank,1-Math.exp(-dt*8));
  this._seal.quaternion.copy(this.camera.quaternion);this._seal.rotateZ(this._bank);this._seal.renderOrder=1001+position.z*10;
  const underwaterScale=1-immersion*.08;
  this._seal.scale.set(pose.scaleX*underwaterScale,pose.scaleY*underwaterScale,1);this._seal.position.set(0,.35-position.y,-pose.lift);
  this._shadow.position.set(position.x,.2,position.z);this._shadow.quaternion.copy(this.camera.quaternion);this._shadow.rotateZ(-heading);
  this._shadow.scale.set(1.75*pose.shadowScale,2.1*pose.shadowScale,1);this._shadow.material.uniforms.uOpacity.value=pose.shadowOpacity*pose.shadowScale;
  this._wakeTimer+=dt;
  if(enabled&&water&&!state.airborne&&speed>.16&&this._wakeTimer>(this.lowPower?.28:.18)){
   this._wakeTimer=0;this._impact(position.x,position.z,.08+clamp(speed/5)*.09);
   this._emitEffect(position.x-Math.sin(heading)*.6,position.z+Math.cos(heading)*.6,0,.18,1.5);
  }
  this._syncMarkers();
  for(const p of this._props){if(p.islandId!==this.activeIsland.id)continue;const behind=position.z<p.data.z+.15&&position.z>p.data.z-p.data.size*.85;const cover=behind&&Math.abs(position.x-p.data.x)<p.data.size*.38;const u=p.mesh.material.uniforms;u.uOpacity.value=THREE.MathUtils.lerp(u.uOpacity.value,cover?.48:1,1-Math.exp(-dt*9));}
 }
 update(delta,elapsed){
  if(this._disposed)return;
  const dt=clamp(finite(delta),0,.1);this.elapsed=Number.isFinite(elapsed)?elapsed:this.elapsed+dt;this._clock.value=this.elapsed;
  this._restoration=THREE.MathUtils.lerp(this._restoration,this._siteRestored?1:0,1-Math.exp(-dt*2));this._updateCamera(dt);
  for(const slot of this._effects){
   if(!slot.mesh.visible)continue;slot.age+=dt;const progress=clamp(slot.age/slot.duration);
   slot.mesh.visible=progress<1;slot.mesh.material.uniforms.uProgress.value=progress;slot.mesh.material.uniforms.uStrength.value=slot.strength;slot.mesh.material.uniforms.uKind.value=slot.kind;
  }
  for(let i=0;i<this._markers.length;i++){
   const marker=this._markers[i];if(!marker.mesh.visible)continue;
   const pulse=1+Math.sin(this.elapsed*1.7+i*.9)*.045;marker.mesh.scale.setScalar(marker.baseSize*pulse);
   marker.mesh.material.uniforms.uPhase.value=this.elapsed;
   marker.mesh.material.uniforms.uOpacity.value=marker.type==='site' ? .67+this._restoration*.25 : .76+Math.sin(this.elapsed*1.7+i)*.12;
  }
  const center=this.activeIsland.center;
  for(let i=0;i<this._motes.length;i++){
   const mote=this._motes[i],a=mote.seed,t=this.elapsed;
   const x=center.x+Math.sin(a)*7.8+Math.sin(t*.27+a)*.32,z=center.z+Math.cos(a*1.1)*6.5+Math.cos(t*.31+a)*.27;
   const sample=sampleOverworld(this._worlds.get(this.activeIsland.id),x,z);mote.mesh.visible=this.loaded&&sample.isLand;
   if(mote.mesh.visible){mote.mesh.position.set(x,.28,z);mote.mesh.scale.setScalar(.07+.055*(.5+.5*Math.sin(t*1.3+a)));}
  }
 }
 render(){if(!this._disposed)this.renderer.render(this.scene,this.camera);}
 dispose(){
  if(this._disposed)return;this._disposed=true;
  this._resizeObserver?.disconnect();this.window?.removeEventListener('resize',this._resizeHandler);
  if(this._player){if(this._seal)this._player.remove(this._seal);Object.assign(this._player.userData,this._previousHooks);delete this._player.userData.isIllustratedLuma;}
  for(const geometry of this._geometries)geometry.dispose();for(const material of this._materials)material.dispose();
  for(const texture of this._textures)texture.dispose();this._textures.clear();this._worlds.clear();this._props.length=0;
  this._assets?.dispose();this._assets=null;this._geometries.clear();this._materials.clear();
  this.scene.clear();this._masks.clear();this._maps.clear();this._islandGroups.clear();this._markers.length=0;this.renderer.dispose();
 }
}
export default IslandScene;
