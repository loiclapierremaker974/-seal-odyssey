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
 seal:{
  url:'assets/arena/luma-poses.png',displayHeight:2.5,
  atlas:{width:1536,height:1024,pixelsPerUnit:160,fps:8,poses:{
   idle:[pose(0,60,539,404,393)],
   prepare:[pose(539,130,497,324,311)],
   attack:[pose(1037,70,499,385,372)],
   guard:[pose(0,608,596,320,315,[[530,0,596,233]])],
   dodge:[pose(540,532,554,376,353,[[0,301,64,376],[493,289,554,376]])],
   happy:[pose(1039,534,497,424,408,[[0,0,57,282]])],
  }},
 },
};
