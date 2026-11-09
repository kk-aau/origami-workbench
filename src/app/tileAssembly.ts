import type {XY} from './tessellation';
import {tessGeometryError} from './tessellation';
import {cross,sub,distance,polygonArea} from '../core/geometry';
import earcut from 'earcut';

export type Tile=XY[];
export const tileCenter=(tile:Tile):XY=>[tile.reduce((s,p)=>s+p[0],0)/tile.length,tile.reduce((s,p)=>s+p[1],0)/tile.length];
export const ccwTile=(tile:Tile):Tile=>structuredClone(polygonArea(tile)<0?[tile[0],...tile.slice(1).reverse()]:tile);
export function transformTile(tile:Tile,offset:XY=[0,0],degrees=0,reflect=false,origin=tileCenter(tile),scale=1):Tile{
  if(!Number.isFinite(scale)||scale<=0)throw Error('缩放倍率必须为正数。');
  const c=Math.cos(degrees*Math.PI/180),s=Math.sin(degrees*Math.PI/180);
  return ccwTile(tile.map(p=>{const x=(p[0]-origin[0])*(reflect?-1:1)*scale,y=(p[1]-origin[1])*scale;return [origin[0]+offset[0]+c*x-s*y,origin[1]+offset[1]+s*x+c*y];}));
}
export function reflectedTile(tile:Tile,edge:number,axisTile=tile):Tile{
  const a=axisTile[edge],b=axisTile[(edge+1)%axisTile.length],d=sub(b,a),length=distance(a,b);
  if(length<1e-8)throw Error('选边长度为零。');
  const u:XY=[d[0]/length,d[1]/length];
  return ccwTile(tile.map(p=>{const v=sub(p,a),dot=v[0]*u[0]+v[1]*u[1];return [a[0]+2*dot*u[0]-v[0],a[1]+2*dot*u[1]-v[1]];}));
}
/** Rigidly join two CCW tile edges with opposite directions; never distort a supplied tile. */
export function joinTile(tile:Tile,edge:number,target:Tile,targetEdge:number,scaleToFit=false):Tile{
  return joinTileGroup([tile],0,edge,target,targetEdge,scaleToFit)[0];
}
/** One similarity transform for the whole patch, preserving internal seams. */
export function joinTileGroup(tiles:Tile[],source:number,edge:number,target:Tile,targetEdge:number,scaleToFit=false):Tile[]{
  const tile=tiles[source];
  if(!tile||!tile[edge]||!target[targetEdge])throw Error('对接拼块或边编号无效。');
  const a=tile[edge],b=tile[(edge+1)%tile.length],c=target[(targetEdge+1)%target.length],d=target[targetEdge];
  const u=sub(b,a),v=sub(d,c),length=distance(a,b),other=distance(c,d);
  if(Math.min(length,other)<1e-8)throw Error('对接边不能退化。');
  if(!scaleToFit&&Math.abs(length-other)>1e-7*Math.max(1,length,other))throw Error('两条边长度不同，请启用“按边长缩放”。');
  const angle=(Math.atan2(v[1],v[0])-Math.atan2(u[1],u[0]))*180/Math.PI;
  return tiles.map(p=>transformTile(p,sub(c,a),angle,false,a,scaleToFit?other/length:1));
}
export function regularTileAtEdge(sides:number,target:Tile,edge:number):Tile{
  if(!Number.isInteger(sides)||sides<3||sides>24)throw Error('正多边形需要 3–24 条边。');
  const length=distance(target[edge],target[(edge+1)%target.length]),radius=length/(2*Math.sin(Math.PI/sides));
  const tile=Array.from({length:sides},(_,i)=>[radius*Math.cos(i*2*Math.PI/sides),radius*Math.sin(i*2*Math.PI/sides)] as XY);
  return joinTile(tile,0,target,edge);
}

/** Origamica UnitRegularStarPolygonVertices: point 1=(0,0), point 2=(1,0). */
export function unitStarTile(points:number,tipDegrees:number):Tile{
  if(!Number.isInteger(points)||points<3||points>12)throw Error('星形需要 3–12 个尖角。');
  // The notebook also permits alpha > 180°, where the origin is reflex.
  // At 360°-360°/n the point radius reaches zero and tips coincide.
  const maximum=360-360/points;
  if(!Number.isFinite(tipDegrees)||tipDegrees<=0||tipDegrees>=maximum)throw Error(`星尖角须大于 0° 且小于 ${maximum}°。`);
  const alpha=tipDegrees*Math.PI/180,step=Math.PI/points;
  const inner=Math.sin(alpha/2)/Math.sin(step),outer=Math.sin(Math.PI-alpha/2-step)/Math.sin(step);
  const center:XY=[1+inner*Math.cos(alpha/2+step),inner*Math.sin(alpha/2+step)];
  return Array.from({length:2*points},(_,i)=>{const r=i%2?inner:outer,t=i*step+alpha/2;return [center[0]-r*Math.cos(t),center[1]-r*Math.sin(t)] as XY;});
}
export function starTileAtEdge(points:number,tipDegrees:number,target:Tile,edge:number):Tile{
  return joinTile(unitStarTile(points,tipDegrees),0,target,edge,true);
}
/** Recover the notebook's {n, alpha} only when a tile still has its regular-star shape. */
export function starTileParameters(tile:Tile):{points:number;tipDegrees:number}|null{
  const points=tile.length/2;
  if(!Number.isInteger(points)||points<3||points>12)return null;
  const a=tile[0],b=tile[1],previous=tile.at(-1)!;
  const length=distance(a,b);
  if(!Number.isFinite(length)||length<1e-8)return null;
  const incoming=sub(a,previous),outgoing=sub(b,a);
  const tipDegrees=180-Math.atan2(cross(incoming,outgoing),incoming[0]*outgoing[0]+incoming[1]*outgoing[1])*180/Math.PI;
  if(!Number.isFinite(tipDegrees)||tipDegrees<=0||tipDegrees>=360-360/points)return null;
  const heading=Math.atan2(outgoing[1],outgoing[0])*180/Math.PI;
  const expected=transformTile(unitStarTile(points,tipDegrees),a,heading,false,[0,0],length);
  return tile.every((p,i)=>distance(p,expected[i])<1e-7*Math.max(1,length))?{points,tipDegrees}:null;
}
/** Change star parameters while leaving the first edge, its scale, and its seam fixed. */
export function reshapeStarTile(tile:Tile,points:number,tipDegrees:number):Tile{
  if(!starTileParameters(tile))throw Error('选中拼块已不再是正星形，无法按星尖参数重设。');
  const a=tile[0],b=tile[1],edge=sub(b,a);
  return transformTile(unitStarTile(points,tipDegrees),a,Math.atan2(edge[1],edge[0])*180/Math.PI,false,[0,0],distance(a,b));
}
export function isConvexTile(tile:Tile):boolean{
  const turns=tile.map((p,i)=>cross(sub(tile[(i+1)%tile.length],p),sub(tile[(i+2)%tile.length],tile[(i+1)%tile.length])));
  return turns.every(x=>x>=-1e-9)||turns.every(x=>x<=1e-9);
}
function triangles(tile:Tile):Tile[]{
  const ids=earcut(tile.flat(),undefined,2);
  if(ids.length!==3*(tile.length-2))throw Error('拼块轮廓自交或退化。');
  return Array.from({length:ids.length/3},(_,i)=>[tile[ids[3*i]],tile[ids[3*i+1]],tile[ids[3*i+2]]]);
}
export function simpleTile(tile:Tile):boolean{
  if(tile.length<3||tile.length>24||tile.some(p=>p.some(x=>!Number.isFinite(x)||x< -10||x>10)))return false;
  if(Math.abs(polygonArea(tile))<1e-9||tile.some((p,i)=>distance(p,tile[(i+1)%tile.length])<1e-7))return false;
  const orient=(a:XY,b:XY,c:XY)=>cross(sub(b,a),sub(c,a));
  for(let i=0;i<tile.length;i++)for(let j=i+1;j<tile.length;j++){
    if(j===i+1||(i===0&&j===tile.length-1))continue;
    const a=tile[i],b=tile[(i+1)%tile.length],c=tile[j],d=tile[(j+1)%tile.length];
    if(Math.max(a[0],b[0])<Math.min(c[0],d[0])-1e-9||Math.max(c[0],d[0])<Math.min(a[0],b[0])-1e-9||Math.max(a[1],b[1])<Math.min(c[1],d[1])-1e-9||Math.max(c[1],d[1])<Math.min(a[1],b[1])-1e-9)continue;
    const ab1=orient(a,b,c),ab2=orient(a,b,d),cd1=orient(c,d,a),cd2=orient(c,d,b);
    if(ab1*ab2<=1e-16&&cd1*cd2<=1e-16)return false;
  }
  return true;
}

/** Positive area intersection of convex tiles; an edge or point contact is allowed. */
function convexTilesOverlap(a:Tile,b:Tile):boolean{
  for(const p of [a,b])for(let i=0;i<p.length;i++){
    const edge=sub(p[(i+1)%p.length],p[i]),length=Math.hypot(...edge),axis:XY=[-edge[1]/length,edge[0]/length];
    const x=a.map(q=>q[0]*axis[0]+q[1]*axis[1]),y=b.map(q=>q[0]*axis[0]+q[1]*axis[1]);
    if(Math.min(Math.max(...x),Math.max(...y))-Math.max(Math.min(...x),Math.min(...y))<1e-7)return false;
  }
  return true;
}
export function tilesOverlap(a:Tile,b:Tile):boolean{
  const aa=isConvexTile(a)?[a]:triangles(a),bb=isConvexTile(b)?[b]:triangles(b);
  return aa.some(x=>bb.some(y=>convexTilesOverlap(x,y)));
}

/** Weld matching points, subdivide partial common edges and reject holes/disconnected pieces. */
export function assembleTiles(input:Tile[],allowConcave=false):{vertices:XY[];faces:number[][]}{
  if(input.length<1||input.length>96)throw Error('需要 1–96 块拼块。');
  const tiles=input.map(ccwTile),vertices:XY[]=[],faces:number[][]=[];
  tiles.forEach((tile,i)=>{
    if(tile.length<3||tile.length>24)throw Error('每块需要 3–24 个顶点。');
    const problem=allowConcave?(simpleTile(tile)?'':'轮廓必须为非退化、无自交的简单多边形。'):tessGeometryError(tile,-10,10,[tile.map((_,j)=>j)]);
    if(problem)throw Error(`拼块 ${i+1}：${problem}`);
    for(let j=0;j<i;j++)if(tilesOverlap(tile,tiles[j]))throw Error(`拼块 ${j+1} 与 ${i+1} 重叠。`);
    faces.push(tile.map(p=>{let k=vertices.findIndex(v=>distance(v,p)<1e-7);if(k<0){k=vertices.length;vertices.push(p);}return k;}));
  });
  if(vertices.length>96)throw Error('组合后最多允许 96 个顶点。');
  const split=faces.map(face=>face.flatMap((a,i)=>{
    const b=face[(i+1)%face.length],d=sub(vertices[b],vertices[a]),length=distance(vertices[a],vertices[b]);
    const mids=vertices.flatMap((p,k)=>{const v=sub(p,vertices[a]),t=(v[0]*d[0]+v[1]*d[1])/(length*length);return k!==a&&k!==b&&t>1e-8&&t<1-1e-8&&Math.abs(cross(v,d))<1e-7*length?[{k,t}]:[];}).sort((x,y)=>x.t-y.t);
    return [a,...mids.map(x=>x.k)];
  }));
  if(split.some(f=>f.length>24))throw Error('共边细分后单块顶点超过 24 个。');
  const edges=new Map<string,number[]>(),neighbors=split.map(()=>new Set<number>());
  split.forEach((face,i)=>face.forEach((a,j)=>{const b=face[(j+1)%face.length],key=[a,b].sort((x,y)=>x-y).join(',');const uses=edges.get(key)??[];uses.push(i);edges.set(key,uses);}));
  for(const uses of edges.values()){
    if(uses.length>2)throw Error('一条边不能连接超过两块。');
    if(uses.length===2){neighbors[uses[0]].add(uses[1]);neighbors[uses[1]].add(uses[0]);}
  }
  const visited=new Set([0]),queue=[0];for(let i=0;i<queue.length;i++)for(const j of neighbors[queue[i]])if(!visited.has(j)){visited.add(j);queue.push(j);}
  if(visited.size!==tiles.length)throw Error('拼块需要通过共边连成整片，单点相接或分离不能采用。');
  if(vertices.length-edges.size+split.length!==1)throw Error('拼块组合中含孔洞，请补齐后再采用。');
  return {vertices,faces:split};
}
