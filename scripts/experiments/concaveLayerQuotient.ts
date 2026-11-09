/** EXPERIMENT ONLY. Not imported by the application or a production worker.
 * Triangle geometry constructs Rabbit Ear constraints; Boolean variables belong
 * to ORIGINAL face pairs, so child faces never acquire independent layer order.
 */
import ear from 'rabbit-ear';
import earcut from 'earcut';
import type {Point} from '../../src/core/types';
import {polygonArea} from '../../src/core/geometry';
import type {FaceOrder} from '../../src/core/layerSolutions';

export interface ExperimentGraph {vertices_coords:Point[];edges_vertices:[number,number][];edges_assignment:string[];edges_foldAngle:number[];faces_vertices:number[][]}
type Category='taco_taco'|'taco_tortilla'|'tortilla_tortilla'|'transitivity';
const categories:Category[]=['taco_taco','taco_tortilla','tortilla_tortilla','transitivity'];
const pairKey=(a:number,b:number)=>a<b?`${a} ${b}`:`${b} ${a}`;
const pairs=(type:Category,f:number[]):[number,number][]=>({
 taco_taco:[[f[0],f[2]],[f[1],f[3]],[f[1],f[2]],[f[0],f[3]],[f[0],f[1]],[f[2],f[3]]],
 taco_tortilla:[[f[0],f[2]],[f[0],f[1]],[f[1],f[2]]],
 tortilla_tortilla:[[f[0],f[2]],[f[1],f[3]]],
 transitivity:[[f[0],f[1]],[f[1],f[2]],[f[2],f[0]]],
}[type] as [number,number][]);

export function makeQuotientExperiment(source:ExperimentGraph,epsilon=1e-7,rotate=0,
 triangulator:typeof earcut=earcut){
 // Rotate each boundary's start vertex to ask earcut for other diagonals while
 // preserving original face IDs, geometry, winding and crease assignments.
 const input={...source,faces_vertices:source.faces_vertices.map(f=>{const n=rotate%f.length;return [...f.slice(n),...f.slice(0,n)];})};
 const {result:triangle,changes}=ear.graph.triangulate(input,triangulator);
 const tri=triangle as ExperimentGraph&{faces_edges:number[][];edges_faces:number[][]};
 const parent:number[]=[];
 changes.faces!.map.forEach((children,f)=>children.forEach(child=>{parent[child]=f;}));
 if(parent.length!==tri.faces_vertices.length)throw Error('unsupported experiment: earcut removed collinear boundary vertices');
 const edgeSet=new Set(tri.faces_vertices.flatMap(f=>f.map((a,i)=>pairKey(a,f[(i+1)%f.length]))));
 if(source.edges_vertices.some(([a,b])=>!edgeSet.has(pairKey(a,b))))throw Error('unsupported experiment: original crease disappeared in triangulation');
 const maxAreaError=Math.max(...source.faces_vertices.map((face,f)=>Math.abs(Math.abs(polygonArea(face.map(v=>source.vertices_coords[v])))-tri.faces_vertices.reduce((sum,t,i)=>sum+(parent[i]===f?Math.abs(polygonArea(t.map(v=>tri.vertices_coords[v]))):0),0))));
 if(maxAreaError>Math.max(1e-10,epsilon*epsilon))throw Error('unsupported experiment: partition area mismatch');
 for(const [i,t]of tri.faces_vertices.entries())if(t.length!==3||polygonArea(t.map(v=>tri.vertices_coords[v]))*polygonArea(source.faces_vertices[parent[i]].map(v=>source.vertices_coords[v]))<=0)throw Error('unsupported experiment: degenerate or reversed child');
 for(const e of changes.edges!.new)if(tri.edges_assignment[e]!=='J'||tri.edges_foldAngle[e]!==0)throw Error('unexpected artificial fold');
 tri.faces_edges=ear.graph.makeFacesEdgesFromVertices(tri);
 tri.edges_faces=ear.graph.makeEdgesFacesUnsorted(tri);
 const data=ear.layer.makeSolverConstraintsFlat(tri,epsilon);
 const variables:string[]=[],index=new Map<string,number>(),clauses:number[][]=[],clauseKeys=new Set<string>();
 const variable=(a:number,b:number)=>{
  if(a===b)throw Error('unsupported experiment: positive-area ordering compares children of the same original face');
  const key=pairKey(a,b);if(!index.has(key)){index.set(key,variables.length+1);variables.push(key);}return index.get(key)!;
 };
 const literal=(a:number,b:number)=>{const pa=parent[a],pb=parent[b],id=variable(pa,pb);return pa<pb?id:-id;};
 const add=(values:number[])=>{const unique=[...new Set(values)].sort((a,b)=>a-b);if(unique.some(v=>unique.includes(-v)))return;const key=unique.join(',');if(!clauseKeys.has(key)){clauseKeys.add(key);clauses.push(unique);}};
 for(const key of data.facePairs){const [a,b]=key.split(' ').map(Number);variable(parent[a],parent[b]);}
 for(const [key,value]of Object.entries(data.orders)){const [a,b]=key.split(' ').map(Number),lit=literal(a,b);add([value===1?lit:-lit]);}
 const counts:Record<string,number>={};
 for(const type of categories){counts[type]=data.constraints[type].length;
  for(const constraint of data.constraints[type]){
   const terms=pairs(type,constraint).map(([a,b])=>literal(a,b));
   const ids=[...new Set(terms.map(Math.abs))];
   // Substitute shared original variables into the full, directed truth table.
   // Repeated variables remain identical; forbidden rows become CNF clauses.
   for(let mask=0;mask<2**ids.length;mask++){
    const values=new Map(ids.map((id,i)=>[id,(mask>>i)&1]));
    const row=terms.map(lit=>values.get(Math.abs(lit))===(lit>0?1:0)?'1':'2').join('');
    if(ear.layer.table[type][row]===true)continue;
    add(ids.map(id=>values.get(id)?-id:id));
   }
  }
 }
 return {source,tri,parent,data,variables,clauses,maxAreaError,counts};
}

export function solveQuotientExperiment(problem:ReturnType<typeof makeQuotientExperiment>,options:{maxNodes?:number;maxSolutions?:number}={}){
 const {clauses,variables}=problem,maxNodes=options.maxNodes??1_000_000,maxSolutions=options.maxSolutions??100_000;
 let nodes=0;const solutions:Record<string,number>[]=[];
 function visit(values:Int8Array){
  if(++nodes>maxNodes)throw Error('experiment search budget exhausted; outcome unknown');
  let dirty=true;
  while(dirty){dirty=false;
   for(const clause of clauses){let satisfied=false,unknown=0,last=0;
    for(const lit of clause){const v=values[Math.abs(lit)];if(v===0){unknown++;last=lit;}else if(v===(lit>0?1:-1)){satisfied=true;break;}}
    if(satisfied)continue;if(!unknown)return;
    if(unknown===1){values[Math.abs(last)]=last>0?1:-1;dirty=true;}
   }
  }
  let next=0,best=-1;
  for(let id=1;id<=variables.length;id++)if(!values[id]){const score=clauses.reduce((s,c)=>s+(c.some(l=>Math.abs(l)===id)&&!c.some(l=>values[Math.abs(l)]===(l>0?1:-1))?1:0),0);if(score>best){best=score;next=id;}}
  if(!next){
   if(solutions.length>=maxSolutions)throw Error('experiment solution budget exhausted; count unknown');
   solutions.push(Object.fromEntries(variables.map((key,i)=>[key,values[i+1]===1?1:2])));return;
  }
  for(const value of [1,-1]){const copy=values.slice();copy[next]=value;visit(copy);}
 }
 visit(new Int8Array(variables.length+1));return {solutions,nodes,count:BigInt(solutions.length)};
}

/** Lift one ORIGINAL pair assignment and independently re-check it in Rabbit
 * Ear's unmodified triangle solver with all triangle variables fixed.
 */
export function verifyQuotientLift(problem:ReturnType<typeof makeQuotientExperiment>,solution:Record<string,number>){
 const {parent,data}=problem,orders:Record<string,number>={};
 const keys=new Set([...data.facePairs,...Object.keys(data.orders)]);
 for(const type of categories)for(const f of data.constraints[type])for(const [a,b]of pairs(type,f))keys.add(pairKey(a,b));
 for(const key of keys){const [a,b]=key.split(' ').map(Number),pa=parent[a],pb=parent[b],value=solution[pairKey(pa,pb)];if(!value)throw Error('missing original pair');orders[key]=pa<pb?value:3-value;}
 for(const [key,value]of Object.entries(data.orders))if(orders[key]!==value)throw Error('lift violates original M/V');
 const checked=ear.layer.solver({...data,orders});
 if(checked.branches)throw Error('lift left independent child variables');
 return orders;
}

export function orderSignature(order:Record<string,number>){return Object.entries(order).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}:${v}`).join('|');}

/** FOLD sign is relative to the SECOND ORIGINAL face's folded normal. */
export function quotientFaceOrders(source:ExperimentGraph,orders:Record<string,number>):FaceOrder[]{
 const normals=source.faces_vertices.map(face=>Math.sign(polygonArea(face.map(v=>source.vertices_coords[v]))));
 return Object.entries(orders).map(([key,value])=>{
  const [a,b]=key.split(' ').map(Number);if(!normals[b]||![1,2].includes(value))throw Error('invalid original face order');
  return [a,b,(value===1?1:-1)*normals[b]];
 });
}
