const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(x)?x:0));
const finite=(x,f=0)=>Number.isFinite(x)?x:f;
const TAU=Math.PI*2;
export function sampleLumaPresentation(state={},elapsed=0,{enabled=true,care=false}={}){
 const water=state.mode==='surface'||state.mode==='underwater';
 const speed=enabled&&!care?Math.max(0,finite(state.horizontalSpeed,finite(state.speed))):0;
 const drive=clamp(speed/(water?4.5:2.8));
 // At rest in water the flippers make a slow, small maintaining stroke.
 const stride=finite(state.gaitPhase)+(water&&speed<.1&&!care&&enabled?finite(elapsed)*.9:0);
 const phase=((stride%TAU)+TAU)%TAU;
 const frame=care||(!water&&speed<.08)?0:1+Math.floor(phase/Math.PI);
 const jump=clamp(finite(state.jumpHeight),0,.65),p=clamp(finite(state.jumpPhase));
 const compression=state.jumpStage==='anticipation'?Math.sin(p*Math.PI)*.08:state.jumpStage==='landing'?Math.sin(p*Math.PI)*.10:0;
 const swim=water&&!care&&enabled;
 return {frame,stride,drive:swim?Math.max(.12,drive):drive,
  body:Math.sin(finite(elapsed)*1.8)*.006+(swim?Math.sin(stride)*.014*drive:Math.sin(stride*2)*.010*drive)-compression*.3,
  scaleX:1+compression*.65+jump*.18,scaleY:1-compression*.65+jump*.18,
  lift:jump*.60,bank:care?0:clamp(finite(state.turn),-1,1)*.045,
  shadowScale:1-jump*.65,shadowOpacity:water?.055:.19};
}
