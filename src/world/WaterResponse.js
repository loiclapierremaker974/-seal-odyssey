const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;

/** Reusable radial impacts shared by GPU deformation and surface buoyancy. */
export class WaterResponse {
  constructor({capacity=8}={}) {
    this.capacity=clamp(Math.floor(finite(capacity,8)),1,8);
    this.impacts=new Float32Array(8*4);
    this.time=0;this.cursor=0;
    for(let i=0;i<8;i++)this.impacts[i*4+2]=-100;
  }
  update(elapsed) {this.time=Math.max(0,finite(elapsed,this.time));}
  impact(x,z,strength=1) {
    const i=(this.cursor++%this.capacity)*4;
    this.impacts[i]=finite(x);this.impacts[i+1]=finite(z);
    this.impacts[i+2]=this.time;this.impacts[i+3]=clamp(finite(strength),0,1);
  }
  sample(x,z) {
    if(!Number.isFinite(x)||!Number.isFinite(z))return 0;
    let height=0;
    for(let i=0;i<this.capacity;i++){
      const k=i*4,s=this.impacts[k+3],age=this.time-this.impacts[k+2];
      if(s<=0||age<0||age>2.8)continue;
      const dx=x-this.impacts[k],dz=z-this.impacts[k+1],d=Math.hypot(dx,dz);
      const offset=d-age*2.65,width=.45+age*.14;
      const rise=clamp((age-.04)/.14,0,1),ramp=rise*rise*(3-2*rise);
      height+=.078*s*ramp*Math.exp(-age*1.35)*Math.sin(offset*4.8)*Math.exp(-((offset/width)**2))
        -.115*s*Math.exp(-d*d/.75)*Math.exp(-age*5.5);
    }
    return clamp(height,-.24,.24);
  }
}

export function sampleAelysSurface(x,z,time,response) {
  const t=finite(time);
  return Math.sin(x*.34+t*.72)*.075+Math.cos(z*.43-t*.56)*.052+
    Math.sin((x+z)*.77+t)*.022+(response?.sample(x,z)||0);
}

/** Interpolate the same two triangles and Float32 grid used by PlaneGeometry. */
export function sampleAelysMeshSurface(x,z,time,response,size=96,segments=160) {
  const half=size/2,step=size/segments;
  const px=clamp(x,-half,half),pz=clamp(z,-half,half);
  const ix=clamp(Math.floor((px+half)/step),0,segments-1);
  const iz=clamp(Math.floor((pz+half)/step),0,segments-1);
  const x0=Math.fround(-half+ix*step),x1=Math.fround(-half+(ix+1)*step);
  const z0=Math.fround(-half+iz*step),z1=Math.fround(-half+(iz+1)*step);
  const u=clamp((px-x0)/(x1-x0),0,1),v=clamp((pz-z0)/(z1-z0),0,1);
  const b=sampleAelysSurface(x0,z1,time,response),d=sampleAelysSurface(x1,z0,time,response);
  if(u+v<=1)return sampleAelysSurface(x0,z0,time,response)*(1-u-v)+b*v+d*u;
  return b*(1-u)+sampleAelysSurface(x1,z1,time,response)*(u+v-1)+d*(1-v);
}
