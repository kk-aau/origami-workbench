import type {FlatFoldResult} from '../core/types';
import {binaryCoordinate,exactRingArea,type ExactPoint} from './modelExactArithmetic';

/** The relation sign follows the original outer ring, including tiny rings. */
export function modelExactFaceNormals(result:FlatFoldResult):(1|-1)[]{
 const binary=result.geometry.vertices.map(point=>point.map(binaryCoordinate));let exponent=0,first=true;
 for(const point of binary)for(const [m,e]of point)if(m&&first){exponent=e;first=false;}else if(m)exponent=Math.min(exponent,e);
 const points:ExactPoint[]=binary.map((point,v)=>({x:point[0][0]?point[0][0]<<BigInt(point[0][1]-exponent):0n,y:point[1][0]?point[1][0]<<BigInt(point[1][1]-exponent):0n,w:1n,point:result.geometry.vertices[v]}));
 return result.geometry.faces.map(face=>{const [area]=exactRingArea(face,points);if(!area)throw Error('原纸面环没有可确认的精确方向。');return area>0n?1:-1;});
}
