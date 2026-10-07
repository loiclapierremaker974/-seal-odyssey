import { VITALS } from '../config/gameplay.js';
export const ISLAND_MOVEMENT=Object.freeze({landSpeed:2.8,surfaceSpeed:4.5,underwaterSpeed:4,sprintMultiplier:1.55,acceleration:9,drag:11,turnResponsiveness:12,jumpAnticipation:.12,jumpFlightTime:.48,jumpLanding:.2,jumpHeight:.48,jumpForwardImpulse:1.15,diveSpeed:2.2,ascendSpeed:2.6,clearance:.04});
const TAU=Math.PI*2;
const BUTTONS=['action','dive','ascend','sprint'];
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const finite=(v,fallback=0)=>Number.isFinite(v)?v:fallback;
const angleDifference=(target,current)=>Math.atan2(Math.sin(target-current),Math.cos(target-current));
const damp=(value,target,rate,dt)=>value+(target-value)*(1-Math.exp(-rate*dt));
/** Direct island movement. Positive input Y is north (-Z); heading is clockwise from north.
 * The controller emits each impact once; onMotion is an audio/observer notification. */
export class IslandController{
 constructor({object,input,environment,camera,initialEnergy=VITALS.maxEnergy,initialOxygen=VITALS.maxOxygen,onVitalsChange,onModeChange,onStateChange,onMotion,onAction}={}){
  if(!object?.position?.clone)throw new Error('IslandController requires a positioned object.');
  if(typeof input?.getState!=='function')throw new Error('IslandController requires an InputController.');
  Object.assign(this,{object,input,environment,camera,onVitalsChange,onModeChange,onStateChange,onMotion,onAction,enabled:true});
  this.velocity=object.position.clone().set(0,0,0);this._buttons={};this._jumpClock=0;this._jumpLaunchY=0;this._jumpDirection={x:0,z:-1};
  this._energyRecoveryClock=VITALS.energyRecoveryDelay;this._lastVitals=null;this._disposed=false;
  this.state={mode:'land',moving:false,sprinting:false,speed:0,horizontalSpeed:0,normalizedSpeed:0,verticalSpeed:0,gaitPhase:0,heading:0,turn:0,airborne:false,grounded:true,jumpStage:'idle',jumpPhase:0,jumpHeight:0,landing:0,overWater:false,oxygen:clamp(finite(initialOxygen),0,VITALS.maxOxygen),energy:clamp(finite(initialEnergy),0,VITALS.maxEnergy),maxOxygen:VITALS.maxOxygen,maxEnergy:VITALS.maxEnergy,forcedAscent:false,lastInteraction:null};
  this._synchronizeButtons();this._placeAtEnvironment(this._sample(object.position));environment?.focusOn?.(object.position.clone(),true);this._publish(true);
 }
 _sample(position){const s=this.environment?.getEnvironmentAt?.(position)||{},waterLevel=finite(s.waterLevel),groundHeight=finite(s.groundHeight,-4);return {...s,waterLevel,groundHeight,isLand:typeof s.isLand==='boolean'?s.isLand:groundHeight>=waterLevel};}
 _surfaceY(s){return Math.max(finite(s.floatY,finite(s.surfaceHeight,s.waterLevel)+ISLAND_MOVEMENT.clearance),s.groundHeight+ISLAND_MOVEMENT.clearance);}
 _readInput(){const i=this.input.getState()||{};let x=clamp(finite(i.move?.x),-1,1),y=clamp(finite(i.move?.y),-1,1);const length=Math.hypot(x,y);if(length>1){x/=length;y/=length;}return {move:{x,y},action:Boolean(i.action),dive:Boolean(i.dive),ascend:Boolean(i.ascend),sprint:Boolean(i.sprint)};}
 _drainPressedQueue(){for(const button of BUTTONS)this.input.consumePressed?.(button);}
 _synchronizeButtons(i=this._readInput()){for(const b of BUTTONS)this._buttons[b]=i[b];this._buttons.vertical=i.ascend||i.dive;this._drainPressedQueue();}
 _edges(i){const edges={};for(const b of BUTTONS){const queued=Boolean(this.input.consumePressed?.(b));edges[b]=queued||(i[b]&&!this._buttons[b]);}edges.vertical=edges.ascend||edges.dive||((i.ascend||i.dive)&&!this._buttons.vertical);this._synchronizeButtons(i);return edges;}
 _setMode(mode){if(mode===this.state.mode)return;const previous=this.state.mode;this.state.mode=mode;this.onModeChange?.(mode,previous);}
 _setJumpStage(stage){Object.assign(this.state,{jumpStage:stage,jumpPhase:0,landing:stage==='landing'?1:0,airborne:stage==='air',grounded:this.state.mode==='land'&&stage!=='air'});this._jumpClock=0;}
 _resetJump(){this._setJumpStage('idle');this.state.jumpHeight=0;}
 _emitMotion(type,strength=1){const position=this.object.position.clone(),force=clamp(finite(strength),0,1);this.environment?.emitLumaMotion?.(type,position.clone(),force);this.onMotion?.(type,{position,strength:force,peakHeight:ISLAND_MOVEMENT.jumpHeight});}
 _placeAtEnvironment(s){
  if(s.isLand){this.state.mode='land';this.object.position.y=s.groundHeight;}
  else if(this.object.position.y<this._surfaceY(s)-.25&&this.state.oxygen>0){this.state.mode='underwater';this.object.position.y=clamp(this.object.position.y,s.groundHeight+ISLAND_MOVEMENT.clearance,this._surfaceY(s)-.25);}
  else{this.state.mode='surface';this.object.position.y=this._surfaceY(s);}
  this.state.overWater=!s.isLand;this.state.grounded=this.state.mode==='land';this.state.forcedAscent=!s.isLand&&this.state.oxygen<=0;
 }
 _startHop(i){if(this.state.jumpStage!=='idle')return;this._jumpLaunchY=this.object.position.y;const length=Math.hypot(i.move.x,i.move.y);this._jumpDirection.x=length>.015?i.move.x/length:Math.sin(this.state.heading);this._jumpDirection.z=length>.015?-i.move.y/length:-Math.cos(this.state.heading);this._setJumpStage('anticipation');}
 _handleButtons(i,edges){
  if(edges.action){const position=this.object.position.clone(),result=this.environment?.interact?.(position)??null;this.state.lastInteraction=result;this.onAction?.(result,{position:position.clone(),state:this.getState()});}
  if(!this.enabled)return;
  if(this.state.mode==='land'){if(edges.vertical)this._startHop(i);}
  else if(this.state.mode==='surface'){if(edges.dive&&this.state.oxygen>0&&!this.state.forcedAscent){this._setMode('underwater');this.state.grounded=false;this._emitMotion('dive',.45);}}
  else if(edges.ascend){this._setMode('surface');this.object.position.y=this._surfaceY(this._sample(this.object.position));this.velocity.y=0;this._emitMotion('surface',.45);}
 }
 _finishFlight(s){this.state.jumpHeight=0;this.velocity.y=0;if(s.isLand){this.object.position.y=s.groundHeight;this._setJumpStage('landing');this._emitMotion('land');}else{this.object.position.y=this._surfaceY(s);this._resetJump();this._setMode('surface');this.state.grounded=false;this._emitMotion('splash');}}
 _stepJump(dt,s){
  let remaining=dt;
  while(remaining>1e-9&&this.state.jumpStage!=='idle'){
   const stage=this.state.jumpStage,duration=stage==='anticipation'?ISLAND_MOVEMENT.jumpAnticipation:stage==='air'?ISLAND_MOVEMENT.jumpFlightTime:ISLAND_MOVEMENT.jumpLanding;
   const used=Math.min(remaining,Math.max(0,duration-this._jumpClock));this._jumpClock+=used;remaining-=used;const phase=clamp(this._jumpClock/duration,0,1);this.state.jumpPhase=phase;
   if(stage==='air'){this.state.jumpHeight=ISLAND_MOVEMENT.jumpHeight*4*phase*(1-phase);this.object.position.y=this._jumpLaunchY+this.state.jumpHeight;this.velocity.y=ISLAND_MOVEMENT.jumpHeight*4*(1-2*phase)/duration;}
   else{this.object.position.y=s.isLand?s.groundHeight:this._surfaceY(s);this.state.landing=stage==='landing'?1-phase:0;this.velocity.y=0;}
   if(this._jumpClock+1e-9<duration)break;
   if(stage==='anticipation'){
    if(!s.isLand){this._resetJump();this._setMode('surface');this._emitMotion('splash',.4);break;}
    this._jumpLaunchY=this.object.position.y;this._setJumpStage('air');this.velocity.x+=this._jumpDirection.x*ISLAND_MOVEMENT.jumpForwardImpulse;this.velocity.z+=this._jumpDirection.z*ISLAND_MOVEMENT.jumpForwardImpulse;this._emitMotion('hop',.7);
   }else if(stage==='air')this._finishFlight(s);else this._resetJump();
  }
 }
 _step(dt,i){
  const start=this.object.position.clone(),length=Math.hypot(i.move.x,i.move.y),hasMove=length>.015;
  if(hasMove){const target=Math.atan2(i.move.x,i.move.y),difference=angleDifference(target,this.state.heading),applied=difference*(1-Math.exp(-ISLAND_MOVEMENT.turnResponsiveness*dt));this.state.heading=Math.atan2(Math.sin(this.state.heading+applied),Math.cos(this.state.heading+applied));this.state.turn=clamp(applied/Math.max(dt,1e-6),-Math.PI*2,Math.PI*2);}else this.state.turn=damp(this.state.turn,0,12,dt);
  const speed=this.state.mode==='land'?ISLAND_MOVEMENT.landSpeed:this.state.mode==='surface'?ISLAND_MOVEMENT.surfaceSpeed:ISLAND_MOVEMENT.underwaterSpeed;
  const sprintRequested=hasMove&&i.sprint&&this.state.energy>=VITALS.minimumSprintEnergy,targetSpeed=speed*(sprintRequested?ISLAND_MOVEMENT.sprintMultiplier:1),rate=hasMove?ISLAND_MOVEMENT.acceleration:ISLAND_MOVEMENT.drag,airRate=this.state.jumpStage==='air'&&!hasMove?1.1:rate;
  this.velocity.x=damp(this.velocity.x,i.move.x*targetSpeed,airRate,dt);this.velocity.z=damp(this.velocity.z,-i.move.y*targetSpeed,airRate,dt);
  const candidate=start.clone();candidate.x+=this.velocity.x*dt;candidate.z+=this.velocity.z*dt;
  const resolved=this.environment?.resolveMovement?.(candidate,start.clone(),.35);
  if(resolved&&Number.isFinite(resolved.x)&&Number.isFinite(resolved.z)){candidate.x=resolved.x;candidate.z=resolved.z;}
  this.object.position.x=finite(candidate.x,start.x);this.object.position.z=finite(candidate.z,start.z);
  const s=this._sample(this.object.position),dx=this.object.position.x-start.x,dz=this.object.position.z-start.z;
  this.velocity.x=dx/dt;this.velocity.z=dz/dt;
  Object.assign(this.state,{horizontalSpeed:Math.hypot(dx,dz)/dt,speed:Math.hypot(dx,dz)/dt,normalizedSpeed:clamp(Math.hypot(dx,dz)/dt/speed,0,1),moving:Math.hypot(dx,dz)/dt>.035,overWater:!s.isLand});
  this.state.sprinting=sprintRequested&&this.state.moving;
  if(this.state.jumpStage==='air')this._stepJump(dt,s);
  else if(s.isLand){
   if(this.state.mode!=='land'){this._setMode('land');this._resetJump();this._emitMotion('land',.3);}
   if(this.state.jumpStage!=='idle')this._stepJump(dt,s);else this.object.position.y=s.groundHeight;
   this.velocity.y=this.state.airborne?this.velocity.y:0;
  }else{
   if(this.state.mode==='land'){this._resetJump();this._setMode('surface');this._emitMotion('splash',.4);}
   if(this.state.mode==='surface'){this.object.position.y=this._surfaceY(s);this.velocity.y=0;}
   else{
    const target=i.ascend?ISLAND_MOVEMENT.ascendSpeed:-ISLAND_MOVEMENT.diveSpeed;this.velocity.y=damp(this.velocity.y,target,7,dt);
    this.object.position.y=clamp(this.object.position.y+this.velocity.y*dt,s.groundHeight+ISLAND_MOVEMENT.clearance,this._surfaceY(s));
    if(this.object.position.y>=this._surfaceY(s)-.01&&this.velocity.y>0){this._setMode('surface');this.object.position.y=this._surfaceY(s);this.velocity.y=0;}
   }
  }
  if(this.state.sprinting){const cost=this.state.mode==='underwater'?VITALS.underwaterSprintEnergyPerSecond:VITALS.sprintEnergyPerSecond;this.state.energy=Math.max(0,this.state.energy-cost*dt);this._energyRecoveryClock=0;}
  else{this._energyRecoveryClock+=dt;if(this._energyRecoveryClock>=VITALS.energyRecoveryDelay)this.state.energy=Math.min(VITALS.maxEnergy,this.state.energy+VITALS.energyRecoveryPerSecond*dt);}
  if(this.state.mode==='underwater'){
   this.state.oxygen=Math.max(0,this.state.oxygen-VITALS.oxygenUsePerSecond*(this.state.sprinting?VITALS.oxygenSprintMultiplier:1)*dt);
   if(this.state.oxygen<=0){this.state.forcedAscent=true;this._setMode('surface');this.object.position.y=this._surfaceY(s);this.velocity.y=0;this._emitMotion('surface',.7);}
  }else{this.state.oxygen=Math.min(VITALS.maxOxygen,this.state.oxygen+VITALS.oxygenRecoveryPerSecond*dt);if(this.state.oxygen>=VITALS.criticalOxygen)this.state.forcedAscent=false;}
  this.state.grounded=this.state.mode==='land'&&!this.state.airborne;this.state.verticalSpeed=this.velocity.y;
  if(this.state.moving&&!this.state.airborne)this.state.gaitPhase=(this.state.gaitPhase+Math.hypot(dx,dz)/(this.state.mode==='land'?.9:1.9)*TAU)%TAU;
 }
 _publish(force=false){
  const vitals={energy:this.state.energy,oxygen:this.state.oxygen,maxEnergy:VITALS.maxEnergy,maxOxygen:VITALS.maxOxygen,mode:this.state.mode,forcedAscent:this.state.forcedAscent};
  if(force||!this._lastVitals||Math.abs(vitals.energy-this._lastVitals.energy)>=.05||Math.abs(vitals.oxygen-this._lastVitals.oxygen)>=.05||vitals.mode!==this._lastVitals.mode||vitals.forcedAscent!==this._lastVitals.forcedAscent){this._lastVitals={...vitals};this.onVitalsChange?.(vitals);}this.onStateChange?.(this.getState());
 }
 setEnabled(enabled){if(this._disposed)return;this.enabled=Boolean(enabled);this._synchronizeButtons();if(!this.enabled){this.velocity.set(0,0,0);Object.assign(this.state,{moving:false,sprinting:false,speed:0,horizontalSpeed:0,verticalSpeed:0,normalizedSpeed:0,turn:0});}}
 setCameraFocus(focus){this.environment?.setCareFocus?.(Boolean(focus));}
 getState(){return {...this.state,enabled:this.enabled,position:this.object.position.clone(),velocity:this.velocity.clone()};}
 update(delta){
  if(this._disposed)return;const input=this._readInput();if(!this.enabled){this._synchronizeButtons(input);return;}
  const dt=clamp(finite(delta),0,.1);if(dt<=0)return;const edges=this._edges(input);this._handleButtons(input,edges);if(!this.enabled)return;
  let remaining=dt;while(remaining>1e-9){const step=Math.min(remaining,1/60);this._step(step,input);remaining-=step;}
  this.object.userData?.update?.(dt,this.getState());this.environment?.focusOn?.(this.object.position.clone(),false);this._publish();
 }
 teleport(position={}){
  if(this._disposed)return;const previousMode=this.state.mode;this.object.position.set(finite(position.x,this.object.position.x),finite(position.y,this.object.position.y),finite(position.z,this.object.position.z));
  this.velocity.set(0,0,0);this._resetJump();Object.assign(this.state,{moving:false,sprinting:false,speed:0,horizontalSpeed:0,verticalSpeed:0,normalizedSpeed:0,turn:0,gaitPhase:0,lastInteraction:null});this._synchronizeButtons();this._placeAtEnvironment(this._sample(this.object.position));this.environment?.focusOn?.(this.object.position.clone(),true);
  if(this.enabled){if(this.state.mode!==previousMode)this.onModeChange?.(this.state.mode,previousMode);this._publish(true);}
 }
 dispose({disposeInput=true}={}){if(this._disposed)return;this.setEnabled(false);this.environment?.setCareFocus?.(false);if(disposeInput)this.input.destroy?.();this._disposed=true;}
}
export default IslandController;
