import { inflateSync } from 'node:zlib';
import assert from 'node:assert/strict';
export function decodePng(png){
 assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 const width=png.readUInt32BE(16),height=png.readUInt32BE(20),type=png[25],channels=type===6?4:3;
 assert.equal(png[24],8);assert.equal(png[28],0);assert.ok(type===6||type===2,'Expected RGB/RGBA PNG');
 const chunks=[];
 for(let o=8;o+12<=png.length;){const n=png.readUInt32BE(o),end=o+n+12;assert.ok(end<=png.length);const name=png.toString('ascii',o+4,o+8);if(name==='IDAT')chunks.push(png.subarray(o+8,o+8+n));o=end;if(name==='IEND')break;}
 const stride=width*channels,raw=inflateSync(Buffer.concat(chunks)),pixels=Buffer.alloc(stride*height);assert.equal(raw.length,(stride+1)*height);
 let at=0;
 for(let y=0;y<height;y++){const filter=raw[at++];assert.ok(filter<=4);
  for(let x=0;x<stride;x++){const i=y*stride+x,left=x>=channels?pixels[i-channels]:0,up=y?pixels[i-stride]:0,corner=y&&x>=channels?pixels[i-stride-channels]:0;let prediction=0;
   if(filter===1)prediction=left;if(filter===2)prediction=up;if(filter===3)prediction=Math.floor((left+up)/2);
   if(filter===4){const p=left+up-corner,a=Math.abs(p-left),b=Math.abs(p-up),c=Math.abs(p-corner);prediction=a<=b&&a<=c?left:b<=c?up:corner;}pixels[i]=(raw[at++]+prediction)&255;
  }
 }
 const rgba=Buffer.alloc(width*height*4);
 for(let i=0;i<width*height;i++){for(let c=0;c<3;c++)rgba[i*4+c]=pixels[i*channels+c];rgba[i*4+3]=type===6?pixels[i*channels+3]:255;}
 return {width,height,colorType:type,rgba};
}
