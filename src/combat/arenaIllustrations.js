// Original Luma art uses measured per-pose rectangles, rather than assuming
// evenly padded generator cells. UV exclusion boxes prevent adjacent poses
// entering a frame; the source PNG remains intact.
const pose=(x,y,width,height,foot,clips=[])=>({x,y,width,height,pivotX:.5,pivotY:foot/height,clips});
export const ARENA_ILLUSTRATIONS={
 backgrounds:{
  shore:{url:'assets/arena/aelys-shore.png',width:1672,height:941},
  lagoon:{url:'assets/arena/aelys-lagoon.png',width:1672,height:941},
  ruins:{url:'assets/arena/aelys-ruins.png',width:1672,height:941},
 },
 current:{url:'assets/arena/current-manifestation.png',width:1254,height:1254},
 seal:{
  url:'assets/arena/luma-poses.png',displayHeight:2.5,
  atlas:{width:1536,height:1024,pixelsPerUnit:160,fps:8,poses:{
   idle:[pose(0,60,541,388,377)],
   prepare:[pose(541,120,504,324,308,[[492,0,504,286]])],
   attack:[pose(1032,80,504,364,348,[[0,320,14,364]])],
   guard:[pose(0,600,580,310,299,[[520,0,580,238]])],
   dodge:[pose(548,532,533,376,354,[[0,310,40,376],[494,295,533,376]])],
   happy:[pose(1040,536,496,400,387,[[0,0,45,274]])],
  }},
 },
};
