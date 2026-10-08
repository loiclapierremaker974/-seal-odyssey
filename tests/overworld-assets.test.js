import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {decodePng} from './helpers/png.js';
for(const [name,columns,rows]of [['luma-directions',4,3],['props',3,2]]){
 test('original '+name+' sprites have real alpha and isolated complete cells',async()=>{
  const {rgba,width,height}=decodePng(await readFile(new URL('../public/assets/overworld/'+name+'.png',import.meta.url)));
  let zeros=0;for(let p=3;p<rgba.length;p+=4)if(rgba[p]===0)zeros++;
  const cells=[];
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
   const x0=Math.floor(col*width/columns),x1=Math.floor((col+1)*width/columns),y0=Math.floor(row*height/rows),y1=Math.floor((row+1)*height/rows);let x=x1,y=y1,right=0,bottom=0,n=0;
   for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++)if(rgba[(yy*width+xx)*4+3]>=128){x=Math.min(x,xx);y=Math.min(y,yy);right=Math.max(right,xx);bottom=Math.max(bottom,yy);n++;}
   cells.push({col,row,x:x-x0,y:y-y0,right:right-x0,bottom:bottom-y0,count:n,cellWidth:x1-x0,cellHeight:y1-y0});
  }
  console.log(name,JSON.stringify({width,height,zeroRatio:zeros/(width*height),cells}));
  assert.ok(zeros/(width*height)>.25,'Sprites require genuine transparent background');
  for(const c of cells){assert.ok(c.count>300);assert.ok(c.x>1&&c.y>1&&c.right<c.cellWidth-2&&c.bottom<c.cellHeight-2,'Complete isolated cell '+JSON.stringify(c));}
 });
}
test('original terrain atlas holds six sufficiently detailed material tiles',async()=>{
 const {width,height}=decodePng(await readFile(new URL('../public/assets/overworld/terrain.png',import.meta.url)));assert.ok(width>=768&&height>=512);assert.ok(Math.abs(width/height-1.5)<.1);
});
