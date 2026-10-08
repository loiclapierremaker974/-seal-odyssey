import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {decodePng} from './helpers/png.js';
import {extractSpriteComponents} from '../src/world/overworldAtlas.js';
for(const [name,cols,rows]of [['luma-directions',4,3],['props',3,2]]){
 test('actual '+name+' PNG has complete isolated component frames',async()=>{
  const {rgba,width,height}=decodePng(await readFile(new URL('../public/assets/overworld/'+name+'.png',import.meta.url))),names=Array.from({length:cols*rows},(_,i)=>String(i)),atlas=extractSpriteComponents(rgba,width,height,cols,rows,names);
  console.log(name,JSON.stringify({width,height,alpha:atlas.transparentRatio,components:atlas.components.map(c=>({count:c.count,x:c.x,y:c.y,right:c.right,bottom:c.bottom,cx:c.cx,cy:c.cy}))}));
  assert.equal(Object.keys(atlas.frames).length,cols*rows);assert.ok(atlas.transparentRatio>.25);
  for(const [key,f]of Object.entries(atlas.frames)){assert.ok(f.width>32&&f.height>32);assert.ok(f.uv.every(v=>v>=0&&v<=1));assert.ok(atlas.mask.includes(f.component),'Each UV frame needs its own mask');}
  for(let row=0;row<rows;row++)for(let col=1;col<cols;col++)assert.ok(atlas.components[row*cols+col].cx>atlas.components[row*cols+col-1].cx);
 });
}
test('source terrain atlas contains six detailed material swatches',async()=>{
 const {width,height}=decodePng(await readFile(new URL('../public/assets/overworld/terrain.png',import.meta.url)));assert.ok(width>=768&&height>=512);assert.ok(Math.abs(width/height-1.5)<.1);
});
test('component import never samples an adjacent sprite inside an overlapping crop rectangle',()=>{
 const w=32,h=32,rgba=new Uint8Array(w*h*4);
 for(let y=4;y<28;y++)for(let x=4;x<28;x++){const outer=x<7||y<7||y>24,inner=x>12&&x<20&&y>12&&y<20;if(outer||inner)rgba[(y*w+x)*4+3]=255;}
 // Larger fixture components require more than 700 pixels; scale the image.
 const scale=8,data=new Uint8Array(w*h*scale*scale*4);
 for(let y=0;y<h*scale;y++)for(let x=0;x<w*scale;x++)data[(y*w*scale+x)*4+3]=rgba[(Math.floor(y/scale)*w+Math.floor(x/scale))*4+3];
 const a=extractSpriteComponents(data,w*scale,h*scale,2,1,['outer','inner']);
 assert.equal(a.frames.outer.component,1);assert.equal(a.frames.inner.component,2);assert.notEqual(a.mask[16*scale*w*scale+16*scale],a.mask[5*scale*w*scale+5*scale]);
});
