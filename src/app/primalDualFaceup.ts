import {polygonArea} from '../core/geometry';
import type {FlatFoldResult,FoldGraph} from '../core/types';
import {flatLayerEdges} from '../core/flatLayerOrder';

type SharedEdge={left:number;right:number;assignment:'M'|'V'};
const edgeKey=(a:number,b:number)=>a<b?`${a},${b}`:`${b},${a}`;

/** Origamica LocalFaceOrdering: FaceupFace seeds the CP face two-colouring.
 * An oriented dual edge goes from the right side of a CP edge to its left.
 * The output pairs point from the locally higher face to the lower face.
 */
export function primalDualLocalFaceOrdering(graph:FoldGraph,faceupFace:number){
 const faces=graph.faces_vertices??[],seed=Math.abs(faceupFace)-1;
 if(!Number.isInteger(faceupFace)||faceupFace===0||seed>=faces.length)throw new Error('FaceupFace 不在当前折痕面的编号范围内。');
 const assignments=new Map<string,string>();
 graph.edges_vertices.forEach(([a,b],i)=>assignments.set(edgeKey(a,b),graph.edges_assignment[i]));
 const incidences=new Map<string,{face:number;from:number;to:number}[]>();
 faces.forEach((face,index)=>{
  if(polygonArea(face.map(v=>graph.vertices_coords[v]))<=0)throw new Error('FaceupFace 需要按正向排列的展开纸面。');
  face.forEach((from,i)=>{
   const to=face[(i+1)%face.length],key=edgeKey(from,to),rows=incidences.get(key)??[];
   rows.push({face:index,from,to});incidences.set(key,rows);
  });
 });
 const shared:SharedEdge[]=[];
 for(const [key,rows] of incidences){
  if(rows.length===1)continue;
  if(rows.length!==2||rows[0].from!==rows[1].to||rows[0].to!==rows[1].from)throw new Error('折痕面不是一致定向的单纸平面网格。');
  const assignment=assignments.get(key);
  if(assignment!=='M'&&assignment!=='V')throw new Error('FaceupFace 的共享折痕必须明确指派山谷。');
  shared.push({left:rows[0].face,right:rows[1].face,assignment});
 }
 const adjacent=faces.map(()=>[] as number[]);
 shared.forEach(({left,right})=>{adjacent[left].push(right);adjacent[right].push(left);});
 const colors=Array<number>(faces.length).fill(0),queue=[seed];colors[seed]=Math.sign(faceupFace);
 for(let i=0;i<queue.length;i++)for(const neighbor of adjacent[queue[i]]){
  if(!colors[neighbor]){colors[neighbor]=-colors[queue[i]];queue.push(neighbor);}
  else if(colors[neighbor]===colors[queue[i]])throw new Error('折痕面的对偶邻接图不可二染色，无法传播 FaceupFace。');
 }
 if(colors.some(color=>!color))throw new Error('折痕面不连通，FaceupFace 无法传播到整张纸。');
 const aboveToBelow=shared.map(({left,right,assignment})=>
  colors[right]===(assignment==='M'?1:-1)?[right,left] as [number,number]:[left,right] as [number,number]);
 return {colors,aboveToBelow};
}

/** Rabbit Ear anchors its geometric face with the material front side up. */
export function primalDualFaceupRoot(graph:FoldGraph,faceupFace:number):number{
 const {colors}=primalDualLocalFaceOrdering(graph,faceupFace);
 const root=faceupFace>0?faceupFace-1:colors.findIndex(color=>color===1);
 if(root<0&&graph.faces_vertices?.length===1)return 0;
 if(root<0)throw new Error('当前折痕面没有可用的正面参考面，无法表示该 FaceupFace 方向。');
 return root;
}

/** A single uncreased face has no opposite-colour root; show its material back. */
export function orientPrimalDualFaceupGeometry(result:FlatFoldResult,faceupFace:number|undefined):FlatFoldResult{
 if(faceupFace===undefined||faceupFace>0||result.geometry.status!=='ready'||result.geometry.faces.length!==1)return result;
 const {vertices,graph}=result.geometry;if(!graph)return result;
 const xs=vertices.map(point=>point[0]),centre=(Math.min(...xs)+Math.max(...xs))/2;
 const reflected=vertices.map(([x,y])=>[2*centre-x,y] as [number,number]);
 return {...result,geometry:{...result.geometry,vertices:reflected,graph:{...graph,vertices_coords:reflected}}};
}

/** The engine's solved layer relation must contain every original local arrow. */
export function primalDualFaceupSatisfied(result:FlatFoldResult,source:FoldGraph,faceupFace:number):boolean{
 if(result.layers.status!=='solved'||!result.layers.faceOrders)return false;
 const {colors,aboveToBelow}=primalDualLocalFaceOrdering(source,faceupFace);
 const normals=result.geometry.faces.map(face=>Math.sign(polygonArea(face.map(v=>result.geometry.vertices[v]))));
 if(normals.some((normal,i)=>normal!==colors[i]))return false;
 const lowerToHigher=flatLayerEdges(result.layers.faceOrders,normals),above=new Map<number,number[]>();
 lowerToHigher.forEach(([below,higher])=>above.set(below,[...(above.get(below)??[]),higher]));
 const reaches=(from:number,to:number)=>{
  const seen=new Set<number>(),pending=[from];
  while(pending.length){const face=pending.pop()!;if(face===to)return true;if(seen.has(face))continue;seen.add(face);pending.push(...(above.get(face)??[]));}
  return false;
 };
 return aboveToBelow.every(([higher,below])=>reaches(below,higher));
}
