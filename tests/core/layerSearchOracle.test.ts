import test from 'node:test';
import assert from 'node:assert/strict';
import ear from 'rabbit-ear';
import {solveLayerContactCandidate,type LayerContactProblem,type ConvexLayerCandidate} from '../../src/core/convexLayerCandidate';
import {buildExactModelTopology,walkExactCoverage} from '../../src/app/modelExactTopology';
import {checkCoverageTournaments,regionComparisonsFromFaceOrders,type RegionCoverage} from '../../src/core/regionTournament';
import type {ConvexLayerConstraints} from '../../src/core/convexLayerContacts';
import type {FoldGraph,Point} from '../../src/core/types';

const categories=['taco_taco','taco_tortilla','tortilla_tortilla','transitivity'] as const;
const emptyRules=():ConvexLayerConstraints=>({taco_taco:[],taco_tortilla:[],tortilla_tortilla:[],transitivity:[]});
function coverageFrom(polygons:Point[][]):RegionCoverage{
 const graph:FoldGraph={vertices_coords:[],edges_vertices:[],edges_assignment:[],edges_foldAngle:[],faces_vertices:[]};
 for(const polygon of polygons){const start=graph.vertices_coords.length;graph.vertices_coords.push(...polygon);const face=polygon.map((_,i)=>start+i);graph.faces_vertices!.push(face);face.forEach((v,i)=>{graph.edges_vertices.push([v,face[(i+1)%face.length]]);graph.edges_assignment.push('B');graph.edges_foldAngle.push(0);});}
 const topology=buildExactModelTopology({geometry:{status:'ready',message:'oracle',vertices:graph.vertices_coords,faces:graph.faces_vertices!,graph},layers:{status:'unknown',message:''},warnings:[]});
 return {faceCount:topology.faceCount,cellCount:topology.cellCount,walk:v=>walkExactCoverage(topology,v)};
}
function permutations(values:number[]):number[][]{
 if(values.length<2)return [values];
 return values.flatMap((value,i)=>permutations([...values.slice(0,i),...values.slice(i+1)]).map(suffix=>[value,...suffix]));
}
function validRelations(problem:LayerContactProblem,value:(a:number,b:number)=>number):boolean{
 for(const [pair,want]of Object.entries(problem.adjacent)){const [a,b]=pair.split(' ').map(Number);if(value(a,b)!==want)return false;}
 return categories.every(kind=>problem.constraints[kind].every(row=>ear.layer.table[kind][ear.layer.constraintToFacePairs[kind](row as never).map(([a,b])=>value(a,b)).join('')]===true));
}
function verify(problem:LayerContactProblem,coverage:RegionCoverage,answer:ConvexLayerCandidate){
 const {pairs,values}=regionComparisonsFromFaceOrders(answer.orders,problem.winding.map(w=>w?1:-1)),byPair=new Map(pairs.map(([a,b],i)=>[`${a} ${b}`,values[i]]));
 assert.ok(validRelations(problem,(a,b)=>{const value=byPair.get(`${Math.min(a,b)} ${Math.max(a,b)}`);assert.ok(value,`missing ${a}/${b}`);return a<b?value:3-value;}));
 const checked=checkCoverageTournaments(coverage,pairs,values);assert.equal(checked.complete,true);assert.deepEqual(checked.triangles,[]);assert.ok(checked.certificate);assert.equal(checked.certificate.verifiedCells,coverage.cellCount);assert.deepEqual(answer.coverageCertificate,checked.certificate);
}
function randomProblem(seed:number):LayerContactProblem{
 const count=6;let state=seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;},pick=(n:number)=>Math.floor(random()*n),constraints=emptyRules();
 for(let r=0,n=5+pick(12);r<n;r++){
  const kind=categories[pick(3)],faces=[0,1,2,3,4,5];for(let i=faces.length-1;i>0;i--){const j=pick(i+1);[faces[i],faces[j]]=[faces[j],faces[i]];}
  constraints[kind].push(faces.slice(0,kind==='taco_tortilla'?3:4));
 }
 const adjacent:Record<string,number>={};for(let k=0,n=pick(4);k<n;k++){const a=pick(count-1),b=a+1+pick(count-a-1);adjacent[`${a} ${b}`]=1+pick(2);}
 return {count,overlap:Array.from({length:count},(_,a)=>[0,1,2,3,4,5].filter(b=>b!==a)),constraints,winding:[true,false,true,false,true,false],adjacent};
}

test('contact search agrees with every whole-stack order for 200 deterministic branching problems',()=>{
 const square:Point[]=[[0,0],[1,0],[1,1],[0,1]],coverage=coverageFrom(Array.from({length:6},()=>square)),orders=permutations([0,1,2,3,4,5]);
 let satisfiable=0,unsatisfiable=0;
 for(let seed=1;seed<=200;seed++){
  const problem=randomProblem(seed),expected=orders.some(order=>{const ranks=new Int32Array(6);order.forEach((f,i)=>ranks[f]=i);return validRelations(problem,(a,b)=>ranks[a]>ranks[b]?1:2);});
  const answer=solveLayerContactCandidate(structuredClone(problem),1e-6,{coverage});assert.equal(!!answer,expected,`seed ${seed}`);
  if(answer){satisfiable++;verify(problem,coverage,answer);}else unsatisfiable++;
 }
 assert.equal(satisfiable,157);assert.equal(unsatisfiable,43);
});

test('a real pairwise-overlap cycle remains legal when the three faces share no material region',()=>{
 const coverage=coverageFrom([
  [[0,0],[4,0],[4,.2],[0,.2]],
  [[0,-.1],[.2,-.1],[2.2,3],[2,3]],
  [[3.8,-.1],[4,-.1],[2,3],[1.8,3]],
 ]);
 const seen=new Set<string>();coverage.walk({onCell:(_cell,faces)=>{assert.ok(faces.size<=2);if(faces.size===2)seen.add([...faces].sort((a,b)=>a-b).join(' '));}});assert.deepEqual([...seen].sort(),['0 1','0 2','1 2']);
 const problem:LayerContactProblem={count:3,overlap:[[1,2],[0,2],[0,1]],constraints:emptyRules(),winding:[true,true,true],adjacent:{'0 1':1,'1 2':1,'0 2':2}};
 const answer=solveLayerContactCandidate(structuredClone(problem),1e-6,{coverage});assert.ok(answer);assert.equal(answer.faceOrder,undefined);verify(problem,coverage,answer);
});
