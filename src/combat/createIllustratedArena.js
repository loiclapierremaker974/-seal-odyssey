import * as THREE from 'three';
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
function dimensions(texture,width,height){
 const w=finite(width,texture?.image?.width),h=finite(height,texture?.image?.height);
 if(!texture?.isTexture||!(w>0&&h>0))throw new TypeError('Illustrated arena requires a loaded texture and its dimensions.');
 return {width:w,height:h};
}
function frameInfo(frame,size,texture,pixelsPerUnit=1){
 const x=finite(frame.x),y=finite(frame.y),w=finite(frame.width??frame.w,size.width),h=finite(frame.height??frame.h,size.height);
 if(x<0||y<0||w<=1||h<=1||x+w>size.width||y+h>size.height)throw new RangeError('Illustrated arena frame lies outside its atlas.');
 const u=(x+.5)/size.width,du=(w-1)/size.width;
 const v=texture.flipY?1-(y+h-.5)/size.height:(y+h-.5)/size.height;
 const dv=(texture.flipY?1:-1)*(h-1)/size.height;
 const clips=(frame.clips||[]).map(r=>new THREE.Vector4(r[0]/w,1-r[3]/h,r[2]/w,1-r[1]/h));
 return {uv:new THREE.Vector4(u,v,du,dv),clips,
  pivot:new THREE.Vector2(clamp(finite(frame.pivotX,.5)),1-clamp(finite(frame.pivotY,.88))),
  size:new THREE.Vector2(w/pixelsPerUnit,h/pixelsPerUnit)};
}
function paintedMaterial(texture,{sprite=false}={}){
 const material=new THREE.ShaderMaterial({
  uniforms:{uMap:{value:texture},uRect:{value:new THREE.Vector4(0,0,1,1)},
   uCover:{value:new THREE.Vector4(0,0,1,1)},uPivot:{value:new THREE.Vector2(.5,.06)},
   uSize:{value:new THREE.Vector2(1,1)},uOpacity:{value:1},
   uClips:{value:Array.from({length:3},()=>new THREE.Vector4(-1,-1,-1,-1))}},
  vertexShader:sprite?
   'uniform vec2 uPivot;uniform vec2 uSize;varying vec2 vPaintUv;void main(){vPaintUv=uv;vec3 p=vec3((uv-uPivot)*uSize,0.0);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}':
   'varying vec2 vPaintUv;void main(){vPaintUv=uv;gl_Position=vec4(position.xy,0.9999,1.0);}',
  fragmentShader:'uniform sampler2D uMap;uniform vec4 uRect;uniform vec4 uCover;uniform vec4 uClips[3];uniform float uOpacity;varying vec2 vPaintUv;void main(){'+
   (sprite?'for(int i=0;i<3;i++){vec4 r=uClips[i];if(vPaintUv.x>=r.x&&vPaintUv.y>=r.y&&vPaintUv.x<=r.z&&vPaintUv.y<=r.w)discard;}':'')+
   'vec2 q=uCover.xy+vPaintUv*uCover.zw;vec4 texel=texture2D(uMap,uRect.xy+q*uRect.zw);'+
   (sprite?'if(texel.a<0.003)discard;gl_FragColor=vec4(texel.rgb,texel.a*uOpacity);':'gl_FragColor=vec4(texel.rgb,1.0);')+
   '\n#include <colorspace_fragment>\n}',
  transparent:sprite,depthWrite:false,depthTest:sprite,toneMapped:false,side:THREE.DoubleSide,
 });
 material.userData.illustration=true;material.userData.textureOwnership='borrowed';return material;
}
/** Original 2D environment plates and pose sprites layered with live effects.
 * Textures belong to the caller; only meshes/materials belong to this layer. */
export function createIllustratedArena({backgrounds={},sealTexture,currentTexture=null,atlas={},displayHeight=2.2}={}){
 const atlasSize=dimensions(sealTexture,atlas.width,atlas.height);
 const sourcePoses=atlas.poses||{},idle=sourcePoses.idle;
 if(!Array.isArray(idle)||idle.length===0)throw new TypeError('The seal atlas requires at least one idle frame.');
 const referenceHeight=finite(idle[0].height??idle[0].h,atlasSize.height);
 const pixelsPerUnit=finite(atlas.pixelsPerUnit,referenceHeight/Math.max(.1,finite(displayHeight,2.2)));
 const poses={};
 for(const [name,list] of Object.entries(sourcePoses)){
  if(!Array.isArray(list)||!list.length)continue;
  poses[name]=list.map(frame=>frameInfo(frame,atlasSize,sealTexture,pixelsPerUnit));
 }
 const backdropEntries={};
 for(const [name,input] of Object.entries(backgrounds)){
  const entry=input?.isTexture?{texture:input}:input;
  const size=dimensions(entry?.texture,entry?.width,entry?.height);
  const rect=entry.rect||{x:0,y:0,width:size.width,height:size.height};
  backdropEntries[name]={texture:entry.texture,frame:frameInfo(rect,size,entry.texture),
   aspect:finite(rect.width??rect.w,size.width)/finite(rect.height??rect.h,size.height)};
 }
 if(!Object.keys(backdropEntries).length)throw new TypeError('The illustrated arena requires a background.');
 const group=new THREE.Group();group.name='Illustrated battle presentation';group.userData.presentation='painted-2d-with-live-effects';
 const backgroundMaterial=paintedMaterial(null),background=new THREE.Mesh(new THREE.PlaneGeometry(2,2),backgroundMaterial);
 background.name='Painted arena panorama';background.renderOrder=-1000;background.frustumCulled=false;
 const sealMaterial=paintedMaterial(sealTexture,{sprite:true}),seal=new THREE.Mesh(new THREE.PlaneGeometry(1,1),sealMaterial);
 seal.name='Luma illustrated atlas';seal.frustumCulled=false;seal.userData.isIllustratedCharacter=true;
 // A camera-facing soft contact shadow remains independent of the source art.
 const shadowMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,toneMapped:false,
  uniforms:{uOpacity:{value:.24}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:'uniform float uOpacity;varying vec2 vUv;void main(){float r=length((vUv-.5)*2.0);float a=(1.0-smoothstep(0.0,1.0,r))*uOpacity;gl_FragColor=vec4(.09,.12,.10,a);}'});
 const shadow=new THREE.Mesh(new THREE.PlaneGeometry(2.7,.26),shadowMaterial);shadow.name='Luma contact shadow';shadow.frustumCulled=false;
 let current=null;
 if(currentTexture){
  dimensions(currentTexture);
  current=new THREE.Mesh(new THREE.PlaneGeometry(1,1),paintedMaterial(currentTexture,{sprite:true}));
  current.name='Original flowing current manifestation';current.frustumCulled=false;
  current.material.uniforms.uPivot.value.set(.5,.5);current.material.uniforms.uSize.value.set(2.55,2.55);
 }
 group.add(background,shadow,seal);if(current)group.add(current);
 let disposed=false,currentBackground=null,width=1280,height=720,resultPose=null,poseName='idle',frameIndex=-1,lastFrame=null;
 const fps=Math.max(1,finite(atlas.fps,8));
 const activateFrame=frame=>{
  if(lastFrame===frame)return;lastFrame=frame;
  sealMaterial.uniforms.uRect.value.copy(frame.uv);sealMaterial.uniforms.uPivot.value.copy(frame.pivot);sealMaterial.uniforms.uSize.value.copy(frame.size);
  for(let i=0;i<3;i++){const clip=sealMaterial.uniforms.uClips.value[i];if(frame.clips[i])clip.copy(frame.clips[i]);else clip.set(-1,-1,-1,-1);}
 };
 const resize=(w,h)=>{
  width=Math.max(1,finite(w,1280));height=Math.max(1,finite(h,720));if(!currentBackground)return;
  const viewAspect=width/height,aspect=currentBackground.aspect,sx=Math.min(1,viewAspect/aspect),sy=Math.min(1,aspect/viewAspect);
  backgroundMaterial.uniforms.uCover.value.set((1-sx)*.5,(1-sy)*.5,sx,sy);
 };
 const setEncounter=variant=>{
  if(disposed)throw new Error('Illustrated arena has been disposed.');
  currentBackground=backdropEntries[variant]||null;background.visible=Boolean(currentBackground);
  if(currentBackground){backgroundMaterial.uniforms.uMap.value=currentBackground.texture;backgroundMaterial.uniforms.uRect.value.copy(currentBackground.frame.uv);}
  resultPose=null;poseName='idle';frameIndex=-1;lastFrame=null;
  group.userData.variant=variant;group.userData.illustratedBackground=Boolean(currentBackground);
  shadow.visible=variant!=='lagoon';activateFrame(poses.idle[0]);resize(width,height);return Boolean(currentBackground);
 };
 const update=(time,entry,actor,camera,opponent=null,calm=0)=>{
  if(disposed||!actor||!camera)return;
  const event=entry?.event,progress=entry?clamp(entry.age/entry.duration):0;let next=resultPose||'idle';
  if(event?.type==='victory'){resultPose='happy';next='happy';}
  else if(event?.type==='defeat'){resultPose='sad';next='sad';}
  else if(event?.type==='retreat'){resultPose='idle';next='idle';}
  else if(entry?.defense==='dodge')next='dodge';
  else if(entry?.defense==='guard')next='guard';
  else if(event?.type==='hit'&&event.target==='luma')next='sad';
  else if(event?.type==='guard'&&event.actor==='luma')next='guard';
  else if(event?.type==='observe'&&event.actor==='luma')next='curious';
  else if(event?.type==='comfort'&&event.actor==='luma')next='happy';
  else if(event?.type==='action'&&event.actor==='luma'){
   const id=event.actionId;
   if(id==='swift-wave'||id==='strong-wave')next=progress<.4?'prepare':'attack';
   else if(id==='guard')next='guard';else if(id==='dodge')next='prepare';else if(id==='observe')next='curious';else if(id==='comfort')next='happy';
  }
  const frames=poses[next]||poses.idle,frameAge=entry&&next==='attack'?Math.max(0,entry.age-entry.duration*.4):(entry?entry.age:finite(time));
  const index=frames.length>1?(entry?Math.min(frames.length-1,Math.floor(frameAge*fps)):Math.floor(frameAge*fps)%frames.length):0;
  poseName=poses[next]?next:'idle';frameIndex=index;activateFrame(frames[index]);
  seal.position.copy(actor.position);seal.quaternion.copy(camera.quaternion);
  const breath=Math.sin(finite(time)*1.75)*.008;
  const prep=next==='prepare'?Math.sin(progress*Math.PI)*(event?.actionId==='strong-wave'?.055:.028):0;
  const release=next==='attack'?Math.sin(clamp((progress-.4)/.6)*Math.PI)*.026:0;
  seal.scale.set(1+prep*.4+release,1+breath-prep-release*.4-(next==='sad'?.025:0),1);
  if(next==='curious')seal.rotateZ(Math.sin(finite(time)*1.4)*.018);else if(next==='happy')seal.rotateZ(Math.sin(finite(time)*1.6)*.008);
  shadow.position.set(actor.position.x,.035,.13);shadow.quaternion.copy(camera.quaternion);
  const lift=Math.max(0,actor.position.y-.04);shadow.scale.setScalar(Math.max(.25,1-lift*.55));shadowMaterial.uniforms.uOpacity.value=clamp(.23-lift*.5,.025,.23);
  seal.userData.pose=poseName;seal.userData.requestedPose=next;seal.userData.frameIndex=frameIndex;sealMaterial.uniforms.uOpacity.value=1;
  if(current&&opponent){
   current.position.copy(opponent.position);current.quaternion.copy(camera.quaternion);
   const peace=clamp(finite(calm)),pulse=1-peace*.10+Math.sin(finite(time)*2.1)*.015;
   current.scale.setScalar(pulse);current.rotateZ(Math.sin(finite(time)*1.2)*.025*(1-peace));
   current.material.uniforms.uOpacity.value=.94-peace*.35;
  }
 };
 setEncounter('shore');
 return {group,background,seal,shadow,current,poses,hasCurrentArt:Boolean(current),get pose(){return poseName;},get frameIndex(){return frameIndex;},
  hasBackdrop:variant=>Boolean(backdropEntries[variant]),setEncounter,resize,update,
  dispose(){if(disposed)return;disposed=true;for(const object of current?[background,seal,shadow,current]:[background,seal,shadow]){object.geometry.dispose();object.material.dispose();}
   backgroundMaterial.uniforms.uMap.value=null;sealMaterial.uniforms.uMap.value=null;if(current)current.material.uniforms.uMap.value=null;group.clear();}
 };
}
/** Shared textures are loaded once; failure waits for in-flight allocations. */
export async function loadIllustratedArenaAssets(manifest,{baseUrl=''}={}){
 const loader=new THREE.TextureLoader(),loads=new Map(),owned=new Set();
 const load=url=>{
  const target=baseUrl+url;
  if(!loads.has(target))loads.set(target,loader.loadAsync(target).then(texture=>{
   texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
   texture.magFilter=THREE.LinearFilter;owned.add(texture);return texture;
  }));return loads.get(target);
 };
 try{
  const entriesPromise=Promise.all(Object.entries(manifest.backgrounds||{}).map(async([name,entry])=>{
   const texture=await load(entry.url);texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;return [name,{...entry,texture}];
  }));
  const [entries,sealTexture,currentTexture]=await Promise.all([entriesPromise,load(manifest.seal.url),manifest.current?load(manifest.current.url):Promise.resolve(null)]);
  sealTexture.minFilter=THREE.LinearFilter;sealTexture.generateMipmaps=false;let disposed=false;
  if(currentTexture){currentTexture.minFilter=THREE.LinearFilter;currentTexture.generateMipmaps=false;}
  return {backgrounds:Object.fromEntries(entries),sealTexture,currentTexture,atlas:manifest.seal.atlas,displayHeight:manifest.seal.displayHeight??2.2,
   dispose(){if(disposed)return;disposed=true;owned.forEach(texture=>texture.dispose());owned.clear();}};
 }catch(error){await Promise.allSettled(loads.values());owned.forEach(texture=>texture.dispose());throw error;}
}
