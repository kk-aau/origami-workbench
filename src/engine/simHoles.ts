import type {FoldDocument, FoldAssignment} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';
import type {FoldGraph, Point} from '../core/types';
import {triangulateMaterialHoleFace} from '../core/materialHoleTriangles';
import {validateMaterialFaceRings} from '../core/materialTopology';

const key=(a:number,b:number)=>a<b?`${a}:${b}`:`${b}:${a}`;
function fail(message:string):never {throw new Error(`带孔模拟网格无效：${message}`);}

/** Called after the common coordinate/outer-face validation. No index welding. */
export function simulationFaceRings(source:FoldDocument):number[][][]|null {
  if(!['faces_holes','faces_holeEdges','faces_holeFaces'].some(k=>Object.hasOwn(source,k)))return null;
  const holes=source.faces_holes;
  if(!Array.isArray(holes)||holes.length!==source.faces_vertices.length)fail('孔环必须逐面声明。');
  let corners=0,pairs=0;
  const rings=source.faces_vertices.map((outer,f)=>{
    if(!Array.isArray(holes[f]))fail('孔环列表不是数组。');
    const rs=[outer,...holes[f]] as number[][];
    if(rs.some(r=>!Array.isArray(r)||r.length<3||r.some(v=>!Number.isInteger(v)||v<0||v>=source.vertices_coords.length)))fail('孔环顶点索引无效。');
    const all=rs.flat();if(all.length>1000||new Set(all).size!==all.length)fail('单面角过多或内外环共享角。');
    corners+=all.length;pairs+=all.length*all.length/2;
    if(corners>65536||pairs>2_000_000)fail('内外环几何检查超过有界预算。');
    return rs;
  });
  const edges=new Map<string,number>();
  source.edges_vertices.forEach(([a,b],e)=>{const k=key(a,b);if(edges.has(k))fail('同索引重复边不能静默合并。');edges.set(k,e);});
  const owners=source.edges_vertices.map(()=>[] as number[]);
  const ringEdges=rings.map((rs,f)=>rs.map(r=>r.map((a,i)=>{
    const e=edges.get(key(a,r[(i+1)%r.length]));if(e===undefined)fail('内外边界缺少真实源边。');
    owners[e].push(f);return e;
  })));
  for(const field of ['faces_holeEdges','faces_holeFaces'] as const){
    if(!Object.hasOwn(source,field))continue;
    const value=source[field];
    if(!Array.isArray(value)||value.length!==rings.length)fail(`${field} 与面数不符。`);
    rings.forEach((rs,f)=>{
      if(!Array.isArray(value[f])||value[f].length!==rs.length-1)fail(`${field} 与孔数不符。`);
      rs.slice(1).forEach((r,h)=>{
        const row=value[f][h];if(!Array.isArray(row)||row.length!==r.length)fail(`${field} 与孔角数不符。`);
        row.forEach((v:unknown,i:number)=>{
          const e=ringEdges[f][h+1][i],expected=field==='faces_holeEdges'?e:(owners[e].find(owner=>owner!==f)??null);
          if(v!==expected)fail(`${field} 与实际边/邻面不一致。`);
        });
      });
    });
  }
  owners.forEach((o,e)=>{
    if(o.length<1||o.length>2||new Set(o).size!==o.length)fail('源边没有纸面或连接了重复/过多纸面。');
    if(source.edges_assignment?.[e]==='B'&&o.length!==1)fail('纸边不能连接两个纸面。');
  });
  return rings;
}

/** Project each planar face, including a planar 3D FOLD face, without moving it. */
export function projectSimulationFace(source:FoldDocument,rings:number[][],strict=true){
  const points=source.vertices_coords,ids=rings.flat(),origin=points[ids[0]],dim=points[ids[0]].length;
  if(ids.some(v=>points[v].length!==dim))fail('同一材料面混用了二维和三维坐标。');
  let axes=[0,1];
  if(dim===3){
    let normal=[0,0,0],length=0;
    const outer=rings[0];
    for(let i=1;i<outer.length-1;i++){
      const a=points[outer[i]].map((x,k)=>x-origin[k]),b=points[outer[i+1]].map((x,k)=>x-origin[k]);
      const n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],l=Math.hypot(...n);
      if(l>length){normal=n;length=l;}
    }
    if(!length)fail('外环退化，无法定义材料平面。');
    const span=Math.max(...ids.map(v=>Math.hypot(...points[v].map((x,k)=>x-origin[k]))));
    const magnitude=Math.max(...ids.flatMap(v=>points[v].map(Math.abs))),eps=Math.max(span*1e-9,magnitude*Number.EPSILON*32,1e-12);
    if(ids.some(v=>Math.abs(points[v].reduce((sum,x,k)=>sum+(x-origin[k])*normal[k],0))/length>eps))fail('内外环不在同一平面，不能伪造孔洞曲面。');
    const drop=normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs)));axes=[0,1,2].filter(k=>k!==drop);
  }
  const coords=points.map(p=>[p[axes[0]],p[axes[1]]] as Point);
  const xs=ids.map(v=>coords[v][0]),ys=ids.map(v=>coords[v][1]);
  const span=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys));
  const eps=Math.max(1e-12,span*1e-9,Math.max(...xs.map(Math.abs),...ys.map(Math.abs))*Number.EPSILON*32);
  const area=strict?validateMaterialFaceRings(coords,rings,eps):rings.reduce((sum,r)=>{const o=coords[r[0]];return sum+r.reduce((n,v,k)=>{const p=coords[v],q=coords[r[(k+1)%r.length]];return n+(p[0]-o[0])*(q[1]-o[1])-(p[1]-o[1])*(q[0]-o[0]);},0)/2;},0);
  return {coords,area,eps};
}

/** Internal triangulated simulation copy. Diagonals never enter the editor CP. */
export function triangulateSimulationHoles(source:FoldDocument,rings:number[][][]):FoldDocument {
  const fold=structuredClone(source),triangles:number[][]=[],parents:number[]=[];
  const edges=new Map(fold.edges_vertices.map(([a,b],e)=>[key(a,b),e]));
  fold.edges_assignment=fold.edges_vertices.map((_,e)=>source.edges_assignment?.[e]??'U');
  fold.edges_foldAngle=fold.edges_vertices.map((_,e)=>source.edges_foldAngle?.[e]??(source.edges_assignment?.[e]==='M'?-180:source.edges_assignment?.[e]==='V'?180:0));
  for(let f=0;f<rings.length;f++){
    const {coords,area,eps}=projectSimulationFace(source,rings[f]);
    const graph:FoldGraph={vertices_coords:coords,edges_vertices:[],edges_assignment:[],edges_foldAngle:[],faces_vertices:[rings[f][0]],faces_holes:[rings[f].slice(1)]};
    const signed=(t:number[])=>{const [a,b,c]=t.map(v=>coords[v]);return ((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;};
    const ts=triangulateMaterialHoleFace(graph,0).map(t=>signed(t)*area<0?[t[0],t[2],t[1]]:t);
    const boundary=new Map<string,number>();
    rings[f].forEach(r=>r.forEach((a,i)=>{const b=r[(i+1)%r.length];boundary.set(key(a,b),a<b?1:-1);}));
    const use=new Map<string,{count:number;direction:number}>();
    let sum=0;
    for(const t of ts){
      const a=signed(t);if(a*area<=0)fail('三角片退化或朝向错误。');sum+=a;
      t.forEach((a,i)=>{const b=t[(i+1)%3],k=key(a,b),u=use.get(k)??{count:0,direction:0};u.count++;u.direction+=a<b?1:-1;use.set(k,u);});
    }
    const perimeter=rings[f].reduce((sum,r)=>sum+r.reduce((s,a,i)=>s+Math.hypot(coords[a][0]-coords[r[(i+1)%r.length]][0],coords[a][1]-coords[r[(i+1)%r.length]][1]),0),0);
    if(Math.abs(sum-area)>Math.max(perimeter*eps,Math.abs(area)*Number.EPSILON*64))fail('三角片覆盖面积与真实纸面不符。');
    for(const [k,direction] of boundary){const u=use.get(k);if(u?.count!==1||u.direction!==direction)fail('三角化丢失或跨越了原内外边界。');}
    for(const [k,u] of use)if(!boundary.has(k)&&(u.count!==2||u.direction!==0))fail('内部三角片存在缺口或重叠关联。');
    for(const t of ts){
      triangles.push(t);parents.push(f);
      if(triangles.length>15000)fail('三角化后的纸面超过 15,000。');
      t.forEach((a,i)=>{
        const b=t[(i+1)%3],k=key(a,b);if(edges.has(k))return;
        edges.set(k,fold.edges_vertices.length);fold.edges_vertices.push([a,b]);fold.edges_assignment!.push('F' as FoldAssignment);fold.edges_foldAngle!.push(0);
      });
    }
  }
  fold.faces_vertices=triangles;
  // Remove source-face incidence and layer assertions; they do not index this mesh.
  for(const field of ['faces_holes','faces_holeEdges','faces_holeFaces','faces_edges','faces_faces','edges_faces','faceOrders'])delete fold[field];
  fold.zhezhi_simulation_mesh={schema:'zhezhi-simulation-mesh-v1',sourceEdgeCount:source.edges_vertices.length,triangleSourceFaces:parents};
  return fold;
}
