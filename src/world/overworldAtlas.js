/** Import irregular generated atlases without taking pixels from adjacent sprites.
 * The source PNG stays intact. A component-ID texture isolates each UV frame. */
export function extractSpriteComponents(pixels,width,height,columns,rows,names,unitSize=1.65){
 const data=pixels?.data||pixels,total=width*height;if(!data||data.length<total*4)throw Error('Invalid sprite pixels');
 const labels=new Uint16Array(total),queue=new Uint32Array(total),components=[];let next=0,zero=0;
 for(let p=0;p<total;p++)if(data[p*4+3]<16)zero++;
 if(zero<total*.25)throw Error('Sprite background is not transparent');
 for(let origin=0;origin<total;origin++){
  if(labels[origin]||data[origin*4+3]<128)continue;
  const id=++next;labels[origin]=id;let head=0,tail=1;queue[0]=origin;
  let x=width,y=height,right=-1,bottom=-1,sumX=0,sumY=0;
  while(head<tail){
   const p=queue[head++],xx=p%width,yy=Math.floor(p/width);x=Math.min(x,xx);y=Math.min(y,yy);right=Math.max(right,xx);bottom=Math.max(bottom,yy);sumX+=xx;sumY+=yy;
   for(const n of [xx>0?p-1:-1,xx<width-1?p+1:-1,yy>0?p-width:-1,yy<height-1?p+width:-1]){
    if(n>=0&&!labels[n]&&data[n*4+3]>=128){labels[n]=id;queue[tail++]=n;}
   }
  }
  components.push({id,x,y,right,bottom,count:tail,cx:sumX/tail,cy:sumY/tail});
 }
 const count=columns*rows,large=components.filter(c=>c.count>700).sort((a,b)=>b.count-a.count);
 if(large.length<count)throw Error('Missing complete sprite silhouettes: '+large.length+'/'+count);
 const selected=large.slice(0,count).sort((a,b)=>a.cy-b.cy),ordered=[];
 for(let row=0;row<rows;row++)ordered.push(...selected.slice(row*columns,(row+1)*columns).sort((a,b)=>a.cx-b.cx));
 const assignment=new Map(ordered.map((c,i)=>[c.id,i+1])),mask=new Uint8Array(total);
 const distance=(x,y,c)=>Math.hypot(Math.max(c.x-x,0,x-c.right),Math.max(c.y-y,0,y-c.bottom));
 // Detached whiskers and leaves join their nearest major silhouette.
 for(const c of components){
  if(assignment.has(c.id))continue;
  let best=-1,d=Infinity;ordered.forEach((body,i)=>{const n=distance(c.cx,c.cy,body);if(n<d){d=n;best=i;}});
  if(d<24)assignment.set(c.id,best+1);
 }
 for(let p=0;p<total;p++)if(labels[p])mask[p]=assignment.get(labels[p])||0;
 // Keep antialiasing within two pixels of a recognised silhouette, not halos.
 for(let pass=0;pass<2;pass++){
  const before=mask.slice();
  for(let p=0;p<total;p++)if(!before[p]&&data[p*4+3]>0&&data[p*4+3]<128){
   const x=p%width;mask[p]=(x>0&&before[p-1])||(x<width-1&&before[p+1])||before[p-width]||before[p+width]||0;
  }
 }
 const bounds=ordered.map(()=>({x:width,y:height,right:-1,bottom:-1}));
 for(let p=0;p<total;p++)if(mask[p]){const b=bounds[mask[p]-1],x=p%width,y=Math.floor(p/width);b.x=Math.min(b.x,x);b.y=Math.min(b.y,y);b.right=Math.max(b.right,x);b.bottom=Math.max(b.bottom,y);}
 const frames={};let maximum=1;
 bounds.forEach((b,i)=>{
  if(b.x<1||b.y<1||b.right>=width-1||b.bottom>=height-1)throw Error('Sprite clipped by image border: '+names[i]);
  const x=Math.max(0,b.x-2),y=Math.max(0,b.y-2),w=Math.min(width-1,b.right+2)-x+1,h=Math.min(height-1,b.bottom+2)-y+1;
  frames[names[i]]={x,y,width:w,height:h,component:i+1,uv:[(x+.5)/width,1-(y+h-.5)/height,(w-1)/width,(h-1)/height]};maximum=Math.max(maximum,w,h);
 });
 return {frames,pixelsPerUnit:maximum/unitSize,width,height,mask,components:ordered,transparentRatio:zero/total};
}
