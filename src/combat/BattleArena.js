import * as THREE from 'three';
import { createLumaProxy, disposeLumaProxy } from '../world/createLumaProxy.js';
import { createArenaLandscape, createArenaWaveRibbon, createCurrentVeils, createArenaImpactPool } from './createArenaArt.js';

const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const ACTION_TIME={'swift-wave':.44,'strong-wave':.56,guard:.42,dodge:.46,observe:.40,comfort:.50};
const COLORS={water:0x54dfe0,light:0xffdda0,current:0x86b8ff,calm:0xa0f5d3};

/** A lateral, fixed arena rendered through the exploration renderer and canvas. */
export class BattleArena {
  constructor({renderer,lowPower=false,environment=null}={}){
    if(!renderer?.render)throw new Error('BattleArena requires the existing renderer.');
    this.renderer=renderer;this.lowPower=lowPower;this.environment=environment;
    this.scene=new THREE.Scene();this.scene.environment=environment;this.scene.environmentIntensity=.32;
    this.scene.background=new THREE.Color(0x86c8d6);
    this.scene.fog=new THREE.Fog(0xa2d4dc,18,40);
    this.camera=new THREE.OrthographicCamera(-7,7,4,-4,.1,70);
    this.camera.position.set(0,3,12);this.camera.lookAt(0,1,0);
    this.active=false;this.time=0;this.calm=0;this._calmTarget=0;this._disposed=false;
    this._queue=[];this._current=null;this._complete=null;this._playing=false;
    this._matrix=new THREE.Object3D();this._point=new THREE.Vector3();
    this._lumaBase=new THREE.Vector3(-3.1,.04,.15);
    this._opponentBase=new THREE.Vector3(3.05,1.03,.05);
    this._poseState={mode:'land',horizontalSpeed:0,gaitPhase:0,airborne:false,jumpHeight:0,
      jumpStage:'idle',jumpPhase:0,landing:0,turn:0,overWater:false};
    this._palette=Object.fromEntries(Object.entries(COLORS).map(([key,color])=>[key,new THREE.Color(color)]));
    this.floats=Array.from({length:6},()=>({active:false,text:'',amount:0,actor:'opponent',
      age:0,duration:.85,screenX:.5,screenY:.5,worldX:0,worldY:1.65}));
    this._floatCursor=0;this._shieldLife=0;this._focusLife=0;
    this._buildScene();this._buildActors();this._buildEffects();
    const size=new THREE.Vector2(1280,720);renderer.getSize?.(size);this.resize(size.x,size.y);
  }

  _mesh(parent,geometry,material,x,y,z,sx=1,sy=1,sz=1){
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);
    parent.add(mesh);return mesh;
  }

  _buildScene(){
    this.scene.add(new THREE.HemisphereLight(0xc9edf4,0x8a7955,1.15));
    const sun=new THREE.DirectionalLight(0xffe2b7,2.35);sun.position.set(-5,10,7);
    sun.castShadow=!this.lowPower;sun.shadow.mapSize.set(512,512);
    Object.assign(sun.shadow.camera,{left:-8,right:8,top:6,bottom:-3,near:1,far:30});
    sun.shadow.normalBias=.025;this.scene.add(sun);
    const fill=new THREE.DirectionalLight(0x96d9e2,.52);fill.position.set(5,3,3);this.scene.add(fill);
    const skyGeometry=new THREE.PlaneGeometry(32,18),colors=[];
    const top=new THREE.Color(0x4b94b4),bottom=new THREE.Color(0xe1e8ce),shade=new THREE.Color();
    for(let i=0;i<skyGeometry.attributes.position.count;i++){
      shade.copy(bottom).lerp(top,(skyGeometry.attributes.position.getY(i)+9)/18);colors.push(shade.r,shade.g,shade.b);
    }
    skyGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    this._mesh(this.scene,skyGeometry,new THREE.MeshBasicMaterial({vertexColors:true,fog:false}),0,4,-12);
    this._backdrops={};
    for(const variant of ['shore','lagoon','ruins']){
      const group=createArenaLandscape({variant,lowPower:this.lowPower});group.visible=false;this.scene.add(group);this._backdrops[variant]=group;
    }
  }

  _buildActors(){
    this.luma=createLumaProxy({scale:.78,highDetail:!this.lowPower,shadows:!this.lowPower});
    this.luma.rotation.y=Math.PI/2;this.luma.position.copy(this._lumaBase);this.scene.add(this.luma);
    this._head=this.luma.getObjectByName('Luma head');
    this._middle=this.luma.getObjectByName('Luma middle spine');
    this._tail=this.luma.getObjectByName('Luma rear propulsion');
    this._fore=[];this.luma.traverse(o=>{if(o.name==='Luma shoulder joint')this._fore.push(o);});
    this.opponent=new THREE.Group();this.opponent.name='Manifestation de courant instable';
    this.opponent.position.copy(this._opponentBase);this.scene.add(this.opponent);
    this._coreMaterial=new THREE.MeshPhysicalMaterial({color:COLORS.current,emissive:COLORS.current,
      emissiveIntensity:.28,roughness:.35,clearcoat:.48});
    this._core=this._mesh(this.opponent,new THREE.IcosahedronGeometry(.22,2),this._coreMaterial,0,0,0);
    this._ringMaterial=new THREE.MeshBasicMaterial({color:COLORS.current,transparent:true,opacity:.24,depthWrite:false});
    this._opponentRings=[];
    for(const [radius,angle] of [[.65,.18],[.83,-.32]]){
      const ring=this._mesh(this.opponent,new THREE.TorusGeometry(radius,.028,5,this.lowPower?28:44),
        this._ringMaterial,0,0,0);ring.rotation.y=angle;this._opponentRings.push(ring);
    }
    this._haloMaterial=new THREE.MeshBasicMaterial({color:COLORS.current,side:THREE.BackSide,
      transparent:true,opacity:.016,depthWrite:false});
    this._mesh(this.opponent,new THREE.SphereGeometry(.92,16,10),this._haloMaterial,0,0,0);
    this._orbit=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.045,0),
      new THREE.MeshBasicMaterial({color:0xc1fbf0}),this.lowPower?8:14);
    this._orbit.frustumCulled=false;this.opponent.add(this._orbit);
    this._veils=createCurrentVeils({lowPower:this.lowPower});this.opponent.add(this._veils);
  }

  _buildEffects(){
    this._waves=[];this._waveCursor=0;
    const ringGeo=new THREE.TorusGeometry(1,.035,5,this.lowPower?24:36);
    for(let i=0;i<2;i++){
      const group=new THREE.Group(),material=new THREE.MeshBasicMaterial({color:COLORS.water,
        transparent:true,opacity:0,depthWrite:false});
      for(const radius of [1,.72]){
        const ring=this._mesh(group,ringGeo,material,0,0,0,radius,radius,radius);
        ring.rotation.y=.35;
      }
      const ribbon=createArenaWaveRibbon({lowPower:this.lowPower});
      ribbon.material.uniforms.uColor.value=material.color;group.add(ribbon.mesh);
      this.scene.add(group);group.visible=false;
      this._waves.push({group,material,ribbon,age:1,duration:.32,from:0,to:0,y:1,strong:false});
    }
    const shieldMat=new THREE.MeshBasicMaterial({color:0x9df8e8,transparent:true,opacity:.10,
      side:THREE.BackSide,depthWrite:false});
    this._shield=this._mesh(this.scene,new THREE.SphereGeometry(1,16,10),shieldMat,-2.75,.90,.14,.85,.90,.62);
    this._shield.visible=false;
    this._focusMaterial=new THREE.MeshBasicMaterial({color:COLORS.light,transparent:true,opacity:0,depthWrite:false});
    this._focus=this._mesh(this.scene,ringGeo,this._focusMaterial,3.05,1.03,.2);
    this._focus.visible=false;
    this._impacts=createArenaImpactPool({lowPower:this.lowPower});this.scene.add(this._impacts.group);
    const count=this.lowPower?30:56;
    this._particleData={count,p:new Float32Array(count*3),v:new Float32Array(count*3),
      life:new Float32Array(count),duration:new Float32Array(count),cursor:0};
    this._particles=new THREE.InstancedMesh(new THREE.SphereGeometry(.038,8,5),
      new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.75,depthWrite:false}),count);
    this._particles.frustumCulled=false;this.scene.add(this._particles);
    this._matrix.scale.setScalar(0);this._matrix.updateMatrix();
    for(let i=0;i<count;i++)this._particles.setMatrixAt(i,this._matrix.matrix);
  }

  open(encounter={}){
    if(this._disposed)throw new Error('BattleArena has been disposed.');
    this.close();this.active=true;this.time=0;this.calm=0;this._calmTarget=0;
    this.encounter=encounter;this.variant=this._backdrops[encounter.arena]?encounter.arena:'shore';
    const opponent=encounter.opponent||{};
    this.name=String(opponent.name||encounter.name||'Courant instable');
    this.maxResolve=Math.max(1,finite(opponent.maxResolve,100));
    this.element=this._palette[opponent.element]?opponent.element:'current';
    this._focus.position.copy(this._opponentBase);this._focus.position.z=.2;
    for(const [variant,group] of Object.entries(this._backdrops))group.visible=variant===this.variant;
    this.scene.background.set(this.variant==='shore'?0x91cbd7:0x3d8da8);
    this.luma.position.copy(this._lumaBase);this.opponent.position.copy(this._opponentBase);
    this.luma.userData.setMood('curious');this.opponent.scale.setScalar(1);
    Object.assign(this.opponent.userData,{name:this.name,maxResolve:this.maxResolve});
    this._particleData.life.fill(0);this._impacts.reset();for(const f of this.floats)f.active=false;
    for(const wave of this._waves)wave.group.visible=false;
    this._shieldLife=this._focusLife=0;this.update(0);return this;
  }

  resize(width,height){
    this.width=Math.max(1,finite(width,1280));this.height=Math.max(1,finite(height,720));
    const portrait=this.height>this.width,short=this.height<500;
    const header=portrait?110:short?94:100,footer=portrait?240:this.width<760?160:short?126:168;
    const free=Math.max(90,this.height-header-footer),pixels=Math.min(short?120:210,free*.72);
    const aspect=this.width/this.height;
    let halfH=1.95*this.height/(2*pixels),halfW=halfH*aspect;
    if(halfW<5.1){halfW=5.1;halfH=halfW/aspect;}
    const center=portrait?clamp((header+free*.5)/this.height,.3,.6):.42;
    const shift=(center*2-1)*halfH;
    Object.assign(this.camera,{left:-halfW,right:halfW,top:halfH+shift,bottom:-halfH+shift});
    this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld(true);
  }

  get playing(){return this._playing;}

  play(events=[],onComplete){
    if(!this.active||this._playing)return false;
    const list=Array.isArray(events)?events:[],terminal=list.find(e=>['victory','defeat','retreat'].includes(e?.type));
    let time=0;this._queue.length=0;
    for(const event of list.slice(0,16)){
      if(!event||['victory','defeat','retreat'].includes(event.type))continue;
      const duration=event.type==='action'?(ACTION_TIME[event.actionId]||.44):.12;
      if(time+duration>(terminal?2.45:3)||this._queue.length>=8)continue;
      const defense=event.type==='action'&&event.actor==='opponent'&&event.actionId!=='gather'
        ?list.find(e=>e?.actor==='luma'&&['dodge','guard'].includes(e.type)&&e.amount>0)?.type:null;
      this._queue.push({event,duration,age:0,started:false,fired:false,defense});time+=duration;
    }
    if(terminal)this._queue.push({event:terminal,duration:.55,age:0,started:false,fired:false});
    this._complete=typeof onComplete==='function'?onComplete:null;
    this._playing=this._queue.length>0;this._current=this._queue.shift()||null;
    if(!this._playing){const done=this._complete;this._complete=null;done?.();}
    return true;
  }

  _float(event){
    const actor=event.target||(event.type==='victory'?'opponent':event.type==='hit'?(event.actor==='luma'?'opponent':'luma'):event.actor)||'opponent';
    const float=this.floats[this._floatCursor++%this.floats.length],amount=Math.max(0,finite(event.amount));
    float.active=true;float.age=0;float.actor=actor;float.amount=amount;
    float.text=event.type==='hit'?'−'+amount:
      event.type==='victory'?'Apaisé':event.type==='guard'?'Protection':event.type==='observe'?'Observé':
      event.type==='comfort'?'Réconfort':event.type==='dodge'?'Esquive':String(event.text||'');
    float.worldX=actor==='luma'?this._lumaBase.x:this._opponentBase.x;float.worldY=1.58;
  }

  _emit(x,y,z,color,count=12){
    const data=this._particleData;
    for(let n=0;n<count;n++){
      const i=data.cursor++%data.count,k=i*3,a=Math.random()*Math.PI*2,speed=.45+Math.random()*.65;
      data.p[k]=x;data.p[k+1]=y;data.p[k+2]=z;
      data.v[k]=Math.cos(a)*speed;data.v[k+1]=.35+Math.random()*.85;data.v[k+2]=Math.sin(a)*speed*.38;
      data.duration[i]=data.life[i]=.40+Math.random()*.32;this._particles.setColorAt(i,color);
    }
    if(this._particles.instanceColor)this._particles.instanceColor.needsUpdate=true;
  }

  _wave(actor,strong,element){
    const wave=this._waves[this._waveCursor++%this._waves.length];
    Object.assign(wave,{age:0,duration:strong?.34:.30,from:actor==='luma'?this.luma.position.x+1.35:this.opponent.position.x-.75,
      to:actor==='luma'?this.opponent.position.x-.1:this.luma.position.x+.5,y:this.variant==='shore'?.85:.76,strong});
    wave.material.color.copy(this._palette[element]||this._palette.water);wave.group.visible=true;
    this._emit(wave.from,wave.y,.12,wave.material.color,strong?12:7);
  }

  _begin(entry){
    entry.started=true;const e=entry.event;
    if(e.type==='victory'){this._calmTarget=1;this.luma.userData.setMood('happy');this._float(e);
      this._emit(3.05,1.03,.2,this._palette.calm,this.lowPower?18:28);}
    if(e.type==='defeat'||e.type==='retreat')this.luma.userData.setMood('calm');
    if(e.type==='hit'){this._float(e);const target=e.target||(e.actor==='luma'?'opponent':'luma');
      const point=target==='luma'?this.luma.position:this.opponent.position;
      const x=point.x+(target==='luma'?.36:0),y=point.y+(target==='luma'?.82:0);
      const color=this._palette[e.element]||this._palette.current;
      this._impacts.emit(x,y,.48,color,e.actionId==='strong-wave'||e.combo);
      this._emit(x,y,.32,color,this.lowPower?12:20);}
    if(e.type==='guard'||e.actionId==='guard')this._shieldLife=1;
    if(e.type==='guard'&&e.amount>0){
      this._impacts.emit(this._shield.position.x+.64,.92,.62,this._palette.calm,true);
      this._emit(this._shield.position.x+.64,.92,.60,this._palette.calm,this.lowPower?9:14);
    }
    if(e.type==='observe'||e.actionId==='observe'){
      this._focus.position.copy(this._opponentBase);this._focus.position.z=.2;this._focusLife=.85;
    }
    if(['guard','dodge','observe','comfort'].includes(e.type))this._float(e);
    if(e.actionId==='comfort')this.luma.userData.setMood('happy');
    else if(e.actionId==='observe')this.luma.userData.setMood('curious');
    else if(e.actionId==='guard')this.luma.userData.setMood('calm');
  }

  _pose(entry,dt){
    const event=entry?.event,progress=entry?clamp(entry.age/entry.duration):0;
    const preparation=clamp(progress/.22)*clamp((.38-progress)/.13);
    const drive=Math.sin(clamp((progress-.25)/.63)*Math.PI);
    const envelope=Math.sin(progress*Math.PI),action=event?.type==='action'?event.actionId:
      ['guard','dodge','observe','comfort'].includes(event?.type)?event.type:null;
    const lumaAction=action&&(event?.actor==='luma'||(event?.type==='dodge'&&event.target!=='opponent'));
    const state=this._poseState;
    Object.assign(state,{mode:this.variant==='shore'?'land':this.variant==='lagoon'?'surface':'underwater',
      horizontalSpeed:0,gaitPhase:0,airborne:false,jumpHeight:0,jumpStage:'idle',
      jumpPhase:0,landing:0,turn:0,overWater:this.variant!=='shore'});
    this.luma.position.copy(this._lumaBase);
    const opponentBob=Math.sin(this.time*2.1)*.07*(1-this.calm*.75);
    this.opponent.position.copy(this._opponentBase);this.opponent.position.y+=opponentBob;
    if(lumaAction){
      if(action==='dodge'){
        // Prepare first; the actual evasive hop happens during the incoming wave.
        if(event.type==='action')Object.assign(state,{jumpStage:'anticipation',jumpPhase:envelope*.4});
      }else if(action==='strong-wave'&&progress<.38){
        Object.assign(state,{jumpStage:'anticipation',jumpPhase:preparation*.92});
      }else if(action==='guard')Object.assign(state,{jumpStage:'anticipation',jumpPhase:envelope*.5});
      if(action==='swift-wave'||action==='strong-wave'){
        this.luma.position.x+=drive*(action==='strong-wave'?.31:.19)-preparation*.065;
      }
    }
    if(entry?.defense==='dodge'){
      const lift=clamp(progress/.22)*clamp((1-progress)/.14);
      this.luma.position.x-=lift*.48;this.luma.position.y+=lift*.16;
      Object.assign(state,{airborne:lift>.05,jumpHeight:lift*.16,jumpStage:'air',jumpPhase:progress});
    }else if(entry?.defense==='guard'){
      this._shieldLife=Math.max(this._shieldLife,.35);
      Object.assign(state,{jumpStage:'anticipation',jumpPhase:.38});
    }
    this.luma.userData.update(Math.min(dt,.1),state);
    if(lumaAction){
      if(action==='swift-wave'||action==='strong-wave'){
        const strong=action==='strong-wave';
        for(const f of this._fore){
          const side=f.position.x<0?-1:1;
          f.rotation.x+=preparation*.14-drive*(strong?.30:.20);
          f.rotation.z+=side*(preparation*.09+drive*(strong?.19:.12));
        }
        if(this._middle)this._middle.rotation.x+=preparation*.09-drive*(strong?.17:.085);
        if(this._head)this._head.rotation.x-=preparation*.035+drive*.085;
        if(this._tail)this._tail.rotation.x-=drive*(strong?.06:.035);
      }else if(action==='observe'&&this._head)this._head.rotation.z+=envelope*.095;
      else if(action==='comfort'&&this._head)this._head.rotation.z-=envelope*.075;
    }
    if(event?.type==='hit'){
      const target=event.target||(event.actor==='luma'?'opponent':'luma'),shake=Math.sin(progress*Math.PI*5)*envelope*.065;
      if(target==='luma'){this.luma.position.x+=shake;if(this._middle)this._middle.rotation.z+=shake*.5;}
      else this.opponent.position.x+=shake;
    }
    if(entry&&event.type==='action'&&!entry.fired){
      const id=event.actionId||'swift-wave',trigger=id==='strong-wave'?.40:.24;
      if(progress>=trigger){
        entry.fired=true;
        if(event.actor==='opponent'&&id==='gather'){
          this._emit(3.05,1.03,.2,this._palette[event.element]||this._palette.current,this.lowPower?8:14);
        }else if(id==='swift-wave'||id==='strong-wave'||event.actor==='opponent'){
          this._wave(event.actor,id==='strong-wave'||id==='pulse',event.element||'water');
        }else if(id==='comfort'){
          this._focus.position.set(this.luma.position.x,.78,.25);this._focusLife=.75;
          this._emit(this.luma.position.x,.82,.2,this._palette.light,this.lowPower?10:18);
        }
      }
    }
  }

  _effects(dt){
    const data=this._particleData,placement=this._matrix;
    for(let i=0;i<data.count;i++){
      const k=i*3;data.life[i]=Math.max(0,data.life[i]-dt);
      if(data.life[i]>0){
        data.v[k+1]-=dt*1.15;
        for(let axis=0;axis<3;axis++)data.p[k+axis]+=data.v[k+axis]*dt;
        placement.position.set(data.p[k],data.p[k+1],data.p[k+2]);
        placement.scale.setScalar(clamp(data.life[i]/data.duration[i])*1.25);
      }else placement.scale.setScalar(0);
      placement.rotation.set(0,0,0);placement.updateMatrix();this._particles.setMatrixAt(i,placement.matrix);
    }
    this._particles.instanceMatrix.needsUpdate=true;
    for(const wave of this._waves){
      if(!wave.group.visible)continue;wave.age+=dt;const p=clamp(wave.age/wave.duration);
      wave.group.visible=p<1;
      wave.group.position.set(THREE.MathUtils.lerp(wave.from,wave.to,p),wave.y+Math.sin(p*Math.PI)*.16,.25);
      const scale=(wave.strong?.85:.64)+p*.21;
      wave.group.scale.set(wave.to>wave.from?scale:-scale,scale,scale);
      wave.group.rotation.z=Math.sin(p*Math.PI)*.08;
      wave.material.opacity=Math.sin(p*Math.PI)*.18;
      wave.ribbon.update(p,Math.sin(p*Math.PI)*.82);
    }
    this._shieldLife=Math.max(0,this._shieldLife-dt);this._shield.visible=this._shieldLife>0;
    this._shield.material.opacity=.10+this._shieldLife*.07;
    this._focusLife=Math.max(0,this._focusLife-dt);this._focus.visible=this._focusLife>0;
    this._focus.scale.setScalar(.86+(1-this._focusLife)*.23);this._focus.rotation.z=-this.time*.65;
    this._focusMaterial.opacity=this._focusLife*.38;
    this.calm+=(this._calmTarget-this.calm)*(1-Math.exp(-5*dt));
    const color=this._palette[this.element]||this._palette.current;
    this._coreMaterial.color.copy(color).lerp(this._palette.calm,this.calm);
    this._coreMaterial.emissive.copy(this._coreMaterial.color);
    this._coreMaterial.emissiveIntensity=.28-this.calm*.09;
    this._ringMaterial.color.copy(this._coreMaterial.color);
    this._haloMaterial.color.copy(this._coreMaterial.color);this._haloMaterial.opacity=.016+this.calm*.055;
    this.opponent.scale.setScalar(1-this.calm*.15);
    this._core.rotation.set(this.time*.32,this.time*.45,this.time*.12);
    for(let i=0;i<this._opponentRings.length;i++)
      this._opponentRings[i].rotation.z=this.time*(i?-.7:.9)*(1-this.calm*.75);
    for(let i=0;i<this._orbit.count;i++){
      const a=i/this._orbit.count*Math.PI*2+this.time*.95*(1-this.calm*.8),r=.72+Math.sin(a*3+this.time)*.08;
      placement.position.set(Math.cos(a)*r,Math.sin(a)*r,Math.sin(a*2)*.16);
      placement.scale.setScalar(.8+Math.sin(a+this.time)*.18);placement.rotation.set(0,a,0);
      placement.updateMatrix();this._orbit.setMatrixAt(i,placement.matrix);
    }
    this._orbit.instanceMatrix.needsUpdate=true;
    this._veils.userData.update(this.time,this._coreMaterial.color,this.calm);
    this._impacts.update(dt);
    this._backdrops[this.variant]?.userData.update?.(this.time);
    for(const f of this.floats){
      if(!f.active)continue;f.age+=dt;f.active=f.age<f.duration;
      this._point.set(f.worldX,f.worldY+f.age*.55,.5).project(this.camera);
      f.screenX=this._point.x*.5+.5;f.screenY=.5-this._point.y*.5;
    }
  }

  update(delta=0){
    if(!this.active||this._disposed)return;
    const elapsed=Math.max(0,finite(delta)),dt=Math.min(elapsed,.1);this.time+=dt;
    let remaining=elapsed,steps=0,done=null;
    while(this._current&&steps++<10){
      const entry=this._current;if(!entry.started)this._begin(entry);
      const advance=Math.min(remaining,entry.duration-entry.age);
      entry.age+=advance;remaining-=advance;this._pose(entry,dt);
      if(entry.age<entry.duration)break;
      this._current=this._queue.shift()||null;
      if(!this._current){this._playing=false;done=this._complete;this._complete=null;break;}
      if(remaining<=0)break;
    }
    if(!this._playing)this._pose(null,dt);
    this._effects(dt);done?.();
  }

  render(){
    if(!this.active||this._disposed)return false;
    this.renderer.render(this.scene,this.camera);return true;
  }

  close(){
    this.active=false;this._playing=false;this._queue.length=0;this._current=null;this._complete=null;
  }

  dispose(){
    if(this._disposed)return;this.close();this._disposed=true;
    this.scene.traverse(object=>{if(object.isInstancedMesh)object.dispose();if(object.shadow?.dispose)object.shadow.dispose();});
    this.scene.remove(this.luma);disposeLumaProxy(this.luma);
    const geometries=new Set(),materials=new Set(),textures=new Set(),skeletons=new Set();
    this.scene.traverse(object=>{
      if(object.geometry)geometries.add(object.geometry);if(object.skeleton)skeletons.add(object.skeleton);
      for(const material of Array.isArray(object.material)?object.material:[object.material])if(material){
        materials.add(material);
        for(const value of Object.values(material))if(value?.isTexture&&value!==this.environment)textures.add(value);
      }
    });
    skeletons.forEach(s=>s.dispose());geometries.forEach(g=>g.dispose());
    textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());
    this.scene.clear();this.scene.environment=null;
  }
}

export default BattleArena;
