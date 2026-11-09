import earcut from 'earcut';
import type {Point} from '../core/types';
import {binaryCoordinate,exactOrientation,exactRingContains,type ExactPoint} from './modelExactArithmetic';
import type {ExactModelSurface} from './modelExactSurface';
import type {VisibleFlatTileRegion} from './flatTileDecorations';

/** Split weak contours at their certified vertex identities, never by proximity. */
function splitRing(ids:number[]):number[][] {
 const stack:number[]=[],at=new Map<number,number>(),rings:number[][]=[];
 for(const v of [...ids,ids[0]]){
  const previous=at.get(v);
  if(previous===undefined){at.set(v,stack.length);stack.push(v);continue;}
  const ring=stack.slice(previous);
  if(ring.length>=3)rings.push(ring);
  // Length-two loops are a doubled bridge with no filled area.
  for(let i=previous+1;i<stack.length;i++)at.delete(stack[i]);
  stack.length=previous+1;
 }
 if(stack.length!==1)throw Error('装饰边界未闭合。');
 return rings;
}
function simplifyRing(ids:number[],points:ExactPoint[]):number[] {
 const stack:number[]=[];
 const collinear=(a:number,b:number,c:number)=>{
  if(exactOrientation(points[a],points[b],points[c]))return false;
  const p=points[a],q=points[b],r=points[c];
  if((q.x-p.x)*(q.x-r.x)>0n||(q.y-p.y)*(q.y-r.y)>0n)throw Error('装饰边界折返。');
  return true;
 };
 for(const id of ids){while(stack.length>1&&collinear(stack.at(-2)!,stack.at(-1)!,id))stack.pop();stack.push(id);}
 let first=0;
 while(stack.length-first>=3){
  if(collinear(stack.at(-1)!,stack[first],stack[first+1])){first++;continue;}
  if(collinear(stack.at(-2)!,stack.at(-1)!,stack[first])){stack.pop();continue;}
  break;
 }
 if(stack.length-first<3)throw Error('装饰轮廓在显示坐标中退化。');
 return stack.slice(first);
}
function area2(ids:number[],points:ExactPoint[]):bigint {
 let sum=0n;for(let i=0;i<ids.length;i++){const a=points[ids[i]],b=points[ids[(i+1)%ids.length]];sum+=a.x*b.y-b.x*a.y;}return sum;
}
function edge(map:Map<string,number>,a:number,b:number){
 const key=a<b?`${a}:${b}`:`${b}:${a}`,value=(map.get(key)??0)+(a<b?1:-1);
 if(value)map.set(key,value);else map.delete(key);
}

/** Triangles are only clipping fragments for tile labels/decoration. They are
 * NOT coverage cells and must never be used to certify a folded paper surface.
 * Earcut is checked against the exact binary display-coordinate boundary chain:
 * positive triangles must reproduce every outer/hole edge and its signed area.
 * If rounding collapses a contour or triangulation is uncertain, disable this
 * optional decoration as a whole; the certified main surface is untouched. */
function visibleTriangles(surface:ExactModelSurface,allowPartial:boolean):VisibleFlatTileRegion[] {
 try{
  const {vertexXY,faceIds,faceRingOffsets,ringVertexOffsets,ringVertices}=surface;
  if(vertexXY.length%2||faceRingOffsets.length!==faceIds.length+1||faceRingOffsets[0]!==0||
     ringVertexOffsets[0]!==0||faceRingOffsets.at(-1)!+1!==ringVertexOffsets.length||ringVertexOffsets.at(-1)!==ringVertices.length)return [];
  const binary=Array.from(vertexXY,binaryCoordinate);let exponent=0;
  for(const [n,e] of binary)if(n)exponent=Math.min(exponent,e);
  const points:ExactPoint[]=Array.from({length:vertexXY.length/2},(_,i)=>({
   x:binary[i*2][0]<<BigInt(binary[i*2][1]-exponent),y:binary[i*2+1][0]<<BigInt(binary[i*2+1][1]-exponent),w:1n,
   point:[vertexXY[i*2],vertexXY[i*2+1]] as Point,
  }));
  const output:VisibleFlatTileRegion[]=[];
  for(let fill=0;fill<faceIds.length;fill++){
   const fragments=(()=>{try{
   const output:VisibleFlatTileRegion[]=[];
   const start=faceRingOffsets[fill],end=faceRingOffsets[fill+1];if(start>=end)return [];
   const coordinateIds=new Map<string,number>(),rings:{ids:number[];area:bigint}[]=[];
   for(let r=start;r<end;r++){
    const begin=ringVertexOffsets[r],finish=ringVertexOffsets[r+1];if(finish-begin<3)return [];
    const ids=Array.from(ringVertices.subarray(begin,finish));
    for(const id of ids){
     const p=points[id];if(!p)return [];const key=`${p.x}:${p.y}`,prior=coordinateIds.get(key);
     if(prior!==undefined&&prior!==id)return [];
     coordinateIds.set(key,id);
    }
    for(const part of splitRing(ids)){const simple=simplifyRing(part,points),area=area2(simple,points);if(!area)return [];rings.push({ids:simple,area});}
   }
   const outers=rings.filter(r=>r.area>0n).map(r=>({...r,holes:[] as number[][]}));
   if(!outers.length)return [];
   for(const hole of rings.filter(r=>r.area<0n)){
    let owner:typeof outers[number]|undefined;
    for(const outer of outers){
     let inside=false,outside=false;
     for(const id of hole.ids){const relation=exactRingContains(points[id],outer.ids,points);inside ||=relation===1;outside ||=relation===-1;}
     if(inside&&!outside&&(!owner||outer.area<owner.area))owner=outer;
    }
    if(!owner)return [];owner.holes.push(hole.ids);
   }
   for(const outer of outers){
    const contours=[outer.ids,...outer.holes],ids=contours.flat(),holes:number[]=[];let offset=outer.ids.length;
    for(const hole of outer.holes){holes.push(offset);offset+=hole.length;}
    const indices=earcut(ids.flatMap(v=>points[v].point),holes,2);
    if(!indices.length||indices.length%3)return [];
    const expected=new Map<string,number>(),actual=new Map<string,number>();let expectedArea=0n,actualArea=0n;
    for(const ring of contours){expectedArea+=area2(ring,points);for(let i=0;i<ring.length;i++)edge(expected,ring[i],ring[(i+1)%ring.length]);}
    if(expectedArea<=0n)return [];
    for(let i=0;i<indices.length;i+=3){
     const tri=indices.slice(i,i+3).map(k=>ids[k]);if(tri.some(v=>v===undefined))return [];
     let orientation=exactOrientation(points[tri[0]],points[tri[1]],points[tri[2]]);if(!orientation)return [];
     if(orientation<0n){[tri[1],tri[2]]=[tri[2],tri[1]];orientation=-orientation;}
     actualArea+=orientation;
     for(let j=0;j<3;j++)edge(actual,tri[j],tri[(j+1)%3]);
     output.push({polygon:tri.map(v=>[...points[v].point] as Point),topFace:faceIds[fill]});
    }
    if(actualArea!==expectedArea||actual.size!==expected.size||[...expected].some(([key,value])=>actual.get(key)!==value))return [];
   }
   return output;
   }catch{return [];}})();
   if(!fragments.length&&!allowPartial)return [];
   for(const piece of fragments)output.push(piece);
  }
  return output;
 }catch{return [];}
}

export function exactVisibleTileRegions(surface:ExactModelSurface):VisibleFlatTileRegion[]{return visibleTriangles(surface,false);}

/** Labels are display annotations, not a coverage certificate. Find candidate
 * points between display-contour crossings, then verify their NONZERO winding
 * against every original ring. SVG rasterizers may use float32 internally:
 * require a clearance greater than that coordinate representation uncertainty.
 * Tiny unrepresentable faces keep their surface/ID but get no guessed label. */
export function exactVisibleFaceLabels(surface:ExactModelSurface):{face:number;point:Point}[]{
 const labels:{face:number;point:Point}[]=[];
 try{
  const binary=Array.from(surface.vertexXY,binaryCoordinate);let exponent=0,magnitude=0;
  for(let i=0;i<binary.length;i++){if(binary[i][0])exponent=Math.min(exponent,binary[i][1]);magnitude=Math.max(magnitude,Math.abs(surface.vertexXY[i]));}
  const points:ExactPoint[]=Array.from({length:binary.length/2},(_,i)=>({x:binary[i*2][0]<<BigInt(binary[i*2][1]-exponent),y:binary[i*2+1][0]<<BigInt(binary[i*2+1][1]-exponent),w:1n,point:[surface.vertexXY[i*2],surface.vertexXY[i*2+1]]}));
  const clearance=Math.max(Number.MIN_VALUE,magnitude*2**-21),clearance2=clearance*clearance;
  for(let fill=0;fill<surface.faceIds.length;fill++){
   const edges:[number,number][]=[],ys=new Set<number>();
   for(let r=surface.faceRingOffsets[fill];r<surface.faceRingOffsets[fill+1];r++){
    const start=surface.ringVertexOffsets[r],end=surface.ringVertexOffsets[r+1];
    for(let i=start;i<end;i++){const a=surface.ringVertices[i],b=surface.ringVertices[i+1<end?i+1:start];if(!points[a]||!points[b])return [];edges.push([a,b]);ys.add(points[a].point[1]);}
   }
   const heights=[...ys].sort((a,b)=>a-b),gaps=heights.slice(1).map((y,i)=>({y:heights[i]+(y-heights[i])/2,width:y-heights[i]})).filter(g=>g.width>clearance*2).sort((a,b)=>b.width-a.width).slice(0,8);
   const candidates:{point:Point;width:number}[]=[];
   for(const {y}of gaps){
    const crossings:number[]=[];
    for(const [a,b]of edges){const p=points[a].point,q=points[b].point;if((p[1]>y)!==(q[1]>y))crossings.push(p[0]+(y-p[1])/(q[1]-p[1])*(q[0]-p[0]));}
    crossings.sort((a,b)=>a-b);
    for(let i=1;i<crossings.length;i++){const width=crossings[i]-crossings[i-1];if(width>clearance*2)candidates.push({point:[crossings[i-1]+width/2,y],width});}
   }
   candidates.sort((a,b)=>b.width-a.width);let chosen:Point|undefined,best=clearance2;
   for(const {point}of candidates.slice(0,16)){
    const x=binaryCoordinate(point[0]),y=binaryCoordinate(point[1]),shift=Math.max(0,exponent-x[1],exponent-y[1]),p:ExactPoint={x:x[0]<<BigInt(x[1]-exponent+shift),y:y[0]<<BigInt(y[1]-exponent+shift),w:1n<<BigInt(shift),point};
    let winding=0,distance=Infinity;
    for(const [ai,bi]of edges){
     const a=points[ai],b=points[bi],[ax,ay]=a.point,[bx,by]=b.point,dx=bx-ax,dy=by-ay,length2=dx*dx+dy*dy;
     const t=length2?Math.max(0,Math.min(1,((point[0]-ax)*dx+(point[1]-ay)*dy)/length2)):0;
     distance=Math.min(distance,(point[0]-ax-t*dx)**2+(point[1]-ay-t*dy)**2);
     if(distance<=best)break;
     if(ay<=point[1]&&by>point[1]&&exactOrientation(a,b,p)>0n)winding++;
     else if(ay>point[1]&&by<=point[1]&&exactOrientation(a,b,p)<0n)winding--;
    }
    if(distance>best&&winding!==0){best=distance;chosen=point;}
   }
   if(chosen)labels.push({face:surface.faceIds[fill],point:chosen});
  }
 }catch{return [];}
 return labels;
}
