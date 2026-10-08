import * as THREE from 'three';
export const DIRECTIONS=Object.freeze(['south','north','east','west']);
export const PROP_KINDS=Object.freeze(['tree','palm','bush','arch','rock','reeds']);
/** Full cell alpha bounds are used; the sprite keeps its own hand-drawn direction. */
export function cropSpriteAtlas(pixels,width,height,columns,rows,names,unitSize=1.65){
 const data=pixels?.data||pixels;if(!data||data.length<width*height*4)throw Error('Invalid sprite pixels');
 let zero=0;for(let i=3;i<data.length;i+=4)if(data[i]<16)zero++;
 if(zero<width*height*.25)throw Error('Sprite background is not transparent');
 const frames={};let maximum=1;
 for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
  const left=Math.floor(col*width/columns),right=Math.floor((col+1)*width/columns),top=Math.floor(row*height/rows),bottom=Math.floor((row+1)*height/rows);
  let x=right,y=bottom,x1=-1,y1=-1,count=0;
  for(let yy=top;yy<bottom;yy++)for(let xx=left;xx<right;xx++)if(data[(yy*width+xx)*4+3]>=128){x=Math.min(x,xx);x1=Math.max(x1,xx);y=Math.min(y,yy);y1=Math.max(y1,yy);count++;}
  if(count<100||x<=left||y<=top||x1>=right-1||y1>=bottom-1)throw Error('Clipped or empty sprite cell '+col+','+row);
  x=Math.max(left,x-2);y=Math.max(top,y-2);x1=Math.min(right-1,x1+2);y1=Math.min(bottom-1,y1+2);
  const w=x1-x+1,h=y1-y+1,key=names[row*columns+col];frames[key]={x,y,width:w,height:h,uv:[(x+.5)/width,1-(y+h-.5)/height,(w-1)/width,(h-1)/height]};maximum=Math.max(maximum,w,h);
 }
 return {frames,pixelsPerUnit:maximum/unitSize,width,height};
}
export async function loadOverworldAssets({baseUrl='/',loader=new THREE.TextureLoader()}={}){
 const paths={terrain:'terrain.png',props:'props.png',atlasTexture:'luma-directions.png'},owned=new Set(),pending=[];
 try{
  const entries=await Promise.all(Object.entries(paths).map(async([key,path])=>{
   const task=loader.loadAsync(baseUrl.replace(/\/?$/,'/')+'assets/overworld/'+path).then(t=>{owned.add(t);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;t.minFilter=t.magFilter=THREE.LinearFilter;t.generateMipmaps=false;return [key,t];});pending.push(task);return task;
  }));
  let disposed=false;return {...Object.fromEntries(entries),dispose(){if(disposed)return;disposed=true;for(const t of owned)t.dispose();owned.clear();}};
 }catch(error){await Promise.allSettled(pending);for(const t of owned)t.dispose();throw error;}
}
export function propMaterial(texture,frame){
 return new THREE.ShaderMaterial({uniforms:{uMap:{value:texture},uRect:{value:new THREE.Vector4(...frame.uv)},uTime:{value:0},uWind:{value:0},uOpacity:{value:1}},vertexShader:'uniform float uTime;uniform float uWind;varying vec2 vUv;void main(){vUv=uv;vec3 p=position;p.x+=sin(uTime*.9+position.y*2.0)*uv.y*.025*uWind;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}',fragmentShader:"uniform sampler2D uMap;uniform sampler2D uMask;uniform float uComponent;uniform vec4 uRect;uniform float uOpacity;varying vec2 vUv;void main(){vec2 a=uRect.xy+vUv*uRect.zw;vec4 c=texture2D(uMap,a);float id=texture2D(uMask,vec2(a.x,1.0-a.y)).r*255.0;if(abs(id-uComponent)>.25||c.a<.025)discard;gl_FragColor=vec4(c.rgb,c.a*uOpacity);\n#include <colorspace_fragment>\n}",transparent:true,depthWrite:false,depthTest:false,toneMapped:false,side:THREE.DoubleSide});
}
