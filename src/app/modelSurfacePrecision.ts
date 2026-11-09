import type {Point} from '../core/types';

/** Keep the established display tolerance as the first pass. Finer passes may
 * resolve real narrow paper, but cannot request precision below the coordinate
 * roundoff already used by modelPlanarize. In particular this bound prevents
 * its coordinate-bucket search radius growing as epsilon approaches zero. */
export function modelSurfacePrecision(vertices:readonly Point[]){
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,magnitude=1;
 for(const [x,y]of vertices){
  if(!Number.isFinite(x)||!Number.isFinite(y))throw new Error('局部区域精度的模型坐标无效。');
  minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
  magnitude=Math.max(magnitude,Math.abs(x),Math.abs(y));
 }
 const scale=vertices.length?Math.max(1,maxX-minX,maxY-minY):1;
 return {defaultEpsilon:Math.max(1e-8,scale*1e-10),minimumEpsilon:Number.EPSILON*magnitude*8};
}

export function modelSurfaceEpsilon(vertices:readonly Point[],override?:number):number{
 if(override!==undefined&&(!Number.isFinite(override)||override<=0))throw new Error('局部区域计算精度必须是有限正数。');
 const {defaultEpsilon,minimumEpsilon}=modelSurfacePrecision(vertices);
 return Math.max(minimumEpsilon,override??defaultEpsilon);
}
