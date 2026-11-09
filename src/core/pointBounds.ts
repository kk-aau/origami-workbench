import type {Point} from './types';

/** Streaming extrema preserve Math.min/max empty and nonfinite semantics,
 * without expanding large point collections into function arguments. */
export function pointBounds(points:readonly Point[]):{minX:number;minY:number;maxX:number;maxY:number}{
 const bounds={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
 for(const [x,y]of points){bounds.minX=Math.min(bounds.minX,x);bounds.minY=Math.min(bounds.minY,y);bounds.maxX=Math.max(bounds.maxX,x);bounds.maxY=Math.max(bounds.maxY,y);}
 return bounds;
}
