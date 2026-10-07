import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decodePng } from './helpers/png.js';
test('overhead Luma atlas has isolated transparent poses for direct game rendering',async()=>{
 const image=decodePng(await readFile(new URL('../public/assets/exploration/luma-overhead.png',import.meta.url)));
 let zero=0;
 for(let i=3;i<image.rgba.length;i+=4)if(image.rgba[i]===0)zero++;
 const cells=[];
 for(let row=0;row<2;row++)for(let col=0;col<3;col++){
  const x=Math.floor(col*image.width/3),y=Math.floor(row*image.height/2),width=Math.floor((col+1)*image.width/3)-x,height=Math.floor((row+1)*image.height/2)-y;
  let left=width,top=height,right=-1,bottom=-1,count=0,border=0;
  for(let dy=0;dy<height;dy++)for(let dx=0;dx<width;dx++){const alpha=image.rgba[((y+dy)*image.width+x+dx)*4+3];if(alpha>=128){count++;left=Math.min(left,dx);top=Math.min(top,dy);right=Math.max(right,dx);bottom=Math.max(bottom,dy);if(!dx||!dy||dx===width-1||dy===height-1)border++;}}
  cells.push({row,col,x,y,width,height,count,bounds:[left,top,right,bottom],border});
 }
 const report={width:image.width,height:image.height,colorType:image.colorType,alphaZeroRatio:zero/(image.width*image.height),corners:[[0,0],[image.width-1,0],[0,image.height-1],[image.width-1,image.height-1]].map(([x,y])=>[...image.rgba.subarray((y*image.width+x)*4,(y*image.width+x)*4+4)]),cells};
 console.log('LUMA_OVERHEAD_ALPHA '+JSON.stringify(report));
 assert.equal(image.colorType,6,'Atlas must encode alpha.');
 assert.ok(report.alphaZeroRatio>.30,'A background matte must not be drawn behind the poses.');
 assert.ok(report.corners.every(c=>c[3]===0),'Atlas outer padding is transparent.');
 assert.ok(cells.every(c=>c.count>10000&&c.border===0),'Every full seal stays within its transparent cell.');
});
