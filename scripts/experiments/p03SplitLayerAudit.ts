import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ear from 'rabbit-ear';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
import {prepareTessResult,readTessParams,tessConstructionKey,unitQuadrilateralSplitSourceParams,type TessResponse} from '../../src/app/tessellation';
import {tessFlatInput,tessFlatRoot} from '../../src/app/tessellationFlat';
import {unitQuadrilateralAltSplitPreset,unitQuadrilateralCenteredSplitPreset} from '../../src/app/unitQuadrilateralSplitSource';
import type {Point} from '../../src/core/types';

type Category='taco_taco'|'taco_tortilla'|'tortilla_tortilla'|'transitivity';
type Rule={literals:number[];source:string};
const categories:Category[]=['taco_taco','taco_tortilla','tortilla_tortilla','transitivity'];
const categoryPairs=(type:Category,f:number[]):[number,number][]=>({
  taco_taco:[[f[0],f[2]],[f[1],f[3]],[f[1],f[2]],[f[0],f[3]],[f[0],f[1]],[f[2],f[3]]],
  taco_tortilla:[[f[0],f[2]],[f[0],f[1]],[f[1],f[2]]],
  tortilla_tortilla:[[f[0],f[2]],[f[1],f[3]]],
  transitivity:[[f[0],f[1]],[f[1],f[2]],[f[2],f[0]]],
}[type] as [number,number][]);
function encode(data:ReturnType<typeof ear.layer.makeSolverConstraintsFlat>){
  const names:string[]=[],ids=new Map<string,number>(),rules:Rule[]=[];
  const literal=(a:number,b:number)=>{
    const pair=a<b?`${a} ${b}`:`${b} ${a}`;
    if(!ids.has(pair)){ids.set(pair,names.length+1);names.push(pair);}
    return (a<b?1:-1)*ids.get(pair)!;
  };
  for(const [pair,value] of Object.entries(data.orders)){const [a,b]=pair.split(' ').map(Number);rules.push({literals:[value===1?literal(a,b):-literal(a,b)],source:`order ${pair}=${value}`});}
  for(const type of categories)data.constraints[type].forEach((faces,index)=>{
    const terms=categoryPairs(type,faces).map(([a,b])=>literal(a,b)),used=[...new Set(terms.map(Math.abs))];
    for(let mask=0;mask<2**used.length;mask++){
      const values=new Map(used.map((id,i)=>[id,(mask>>i)&1]));
      const row=terms.map(lit=>values.get(Math.abs(lit))===(lit>0?1:0)?'1':'2').join('');
      if(ear.layer.table[type][row]!==true)rules.push({literals:used.map(id=>values.get(id)?-id:id),source:`${type} ${index}:${faces.join(',')}`});
    }
  });
  return {names,rules};
}
function witness(variableCount:number,rules:Rule[],budget=100000){
  let nodes=0;
  function visit(values:Int8Array):Int8Array|null{
    if(++nodes>budget)throw Error(`SAT budget ${budget}`);
    let changed=true;
    while(changed){changed=false;
      for(const rule of rules){let unknown=0,last=0,satisfied=false;
        for(const lit of rule.literals){const current=values[Math.abs(lit)];if(!current){unknown++;last=lit;}else if(current===(lit>0?1:-1)){satisfied=true;break;}}
        if(satisfied)continue;
        if(!unknown)return null;
        if(unknown===1){values[Math.abs(last)]=last>0?1:-1;changed=true;}
      }
    }
    let choice=0;
    for(const rule of rules){if(rule.literals.some(lit=>values[Math.abs(lit)]===(lit>0?1:-1)))continue;
      for(const lit of rule.literals)if(!values[Math.abs(lit)]&&(!choice||Math.abs(lit)<choice))choice=Math.abs(lit);
    }
    if(!choice)return values;
    for(const sign of [1,-1]){const branch=values.slice();branch[choice]=sign;const found=visit(branch);if(found)return found;}
    return null;
  }
  return {solution:visit(new Int8Array(variableCount+1)),nodes};
}
const distanceToSegment=(p:Point,a:Point,b:Point)=>{
  const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
};
function interiorMargin(p:Point,poly:Point[]){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside?Math.min(...poly.map((a,i)=>distanceToSegment(p,a,poly[(i+1)%poly.length]))):-1;
}

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
for(const alternate of [false,true]){
  const params=readTessParams(unitQuadrilateralSplitSourceParams(alternate?unitQuadrilateralAltSplitPreset():unitQuadrilateralCenteredSplitPreset()));
  if(!params||params.family!=='custom')throw Error('来源参数回读失败');
  const request=structuredClone(params);delete request.unitQuadrilateralSplit;
  const run=spawnSync(python,[path.join(root,'backend/tessellate.py')],{cwd:root,input:JSON.stringify(request),encoding:'utf8',timeout:30000,windowsHide:true,env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
  if(run.status!==0)throw Error(run.stderr||String(run.error));
  const response=JSON.parse(run.stdout) as TessResponse;
  const prepared=prepareTessResult(response,params);
  const graph=tessFlatInput(prepared,prepared.doc,tessConstructionKey(params),true).graph;
  const result=computeFlatGeometry(graph,1e-6,{startingFace:tessFlatRoot(graph)});
  if(result.geometry.status!=='ready')throw Error(result.geometry.message);
  const folded=result.geometry.graph!;
  folded.faces_edges=ear.graph.makeFacesEdgesFromVertices(folded);
  folded.edges_faces=ear.graph.makeEdgesFacesUnsorted(folded);
  const constraints=ear.layer.makeSolverConstraintsFlat(folded,1e-6);
  const encoded=encode(constraints);
  const categorySat=Object.fromEntries(['order','taco_tortilla','transitivity','all'].map(group=>{
    const subset=encoded.rules.filter(rule=>group==='all'||rule.source.startsWith('order ')||rule.source.startsWith(group+' '));
    const answer=witness(encoded.names.length,subset);
    return [group,{satisfiable:!!answer.solution,nodes:answer.nodes,rules:subset.length}];
  }));
  const orderRules=encoded.rules.filter(rule=>rule.source.startsWith('order '));
  let critical=orderRules;
  for(const rule of orderRules){const without=critical.filter(candidate=>candidate!==rule);
    if(!witness(encoded.names.length,[...encoded.rules.filter(candidate=>!candidate.source.startsWith('order ')),...without]).solution)critical=without;
  }
  const grouped=[...new Set(encoded.rules.filter(rule=>!rule.source.startsWith('order ')).map(rule=>rule.source))];
  let criticalGroups=grouped;
  for(const source of grouped){const without=criticalGroups.filter(group=>group!==source);
    const subset=encoded.rules.filter(rule=>critical.includes(rule)||without.includes(rule.source));
    if(!witness(encoded.names.length,subset).solution)criticalGroups=without;
  }
  assert.deepEqual(critical.map(rule=>rule.source),['order 9 13=2','order 13 15=1','order 14 16=2']);
  assert.deepEqual(criticalGroups,[
    'taco_tortilla 72:9,16,13','taco_tortilla 76:13,9,14',
    'taco_tortilla 92:15,13,16','transitivity 35:9,14,16',
  ]);
  const coreSources=[...critical.map(rule=>rule.source),...criticalGroups];
  const core=encoded.rules.filter(rule=>coreSources.includes(rule.source));
  assert.equal(witness(encoded.names.length,core).solution,null);
  for(const source of coreSources)assert.ok(witness(encoded.names.length,core.filter(rule=>rule.source!==source)).solution,`删除 ${source} 后仍无解`);
  const polygon=(face:number)=>folded.faces_vertices![face].map(vertex=>folded.vertices_coords[vertex]);
  const criticalGeometry=criticalGroups.map(source=>{
    const [type,description]=source.split(' '),faces=description.split(':')[1].split(',').map(Number);
    if(type==='taco_tortilla'){
      const [a,b,c]=faces,edge=folded.edges_faces!.findIndex(adjacent=>adjacent.length===2&&adjacent.includes(a)&&adjacent.includes(c));
      const [v0,v1]=folded.edges_vertices[edge],p=folded.vertices_coords[v0],q=folded.vertices_coords[v1];
      let best:{point:Point;margin:number}|null=null;
      for(let i=1;i<100;i++){const t=i/100,point:Point=[p[0]*(1-t)+q[0]*t,p[1]*(1-t)+q[1]*t],margin=interiorMargin(point,polygon(b));if(!best||margin>best.margin)best={point,margin};}
      return {source,edge,assignment:folded.edges_assignment[edge],foldedEdge:[p,q],crossing:best};
    }
    const polys=faces.map(polygon),bounds={minX:Math.max(...polys.map(poly=>Math.min(...poly.map(p=>p[0])))),maxX:Math.min(...polys.map(poly=>Math.max(...poly.map(p=>p[0])))),minY:Math.max(...polys.map(poly=>Math.min(...poly.map(p=>p[1])))),maxY:Math.min(...polys.map(poly=>Math.max(...poly.map(p=>p[1]))))};
    let best:{point:Point;margin:number}|null=null;
    for(let i=0;i<=200;i++)for(let j=0;j<=200;j++){const point:Point=[bounds.minX+(bounds.maxX-bounds.minX)*i/200,bounds.minY+(bounds.maxY-bounds.minY)*j/200],margin=Math.min(...polys.map(poly=>interiorMargin(point,poly)));if(!best||margin>best.margin)best={point,margin};}
    return {source,common:best};
  });
  const criticalFoldEdges=critical.map(rule=>{
    const pair=rule.source.match(/order (\d+) (\d+)=/)!;const fa=Number(pair[1]),fb=Number(pair[2]);
    const edge=folded.edges_faces!.findIndex(adjacent=>adjacent.length===2&&adjacent.includes(fa)&&adjacent.includes(fb));
    const vertices=folded.edges_vertices[edge];
    return {order:rule.source,edge,assignment:folded.edges_assignment[edge],vertices,degrees:vertices.map(vertex=>folded.edges_vertices.filter(pair=>pair.includes(vertex)).length),sourceEdge:vertices.map(vertex=>graph.vertices_coords[vertex]),foldedEdge:vertices.map(vertex=>folded.vertices_coords[vertex])};
  });
  const centerCode=`import json; from tessellation_unit_quadrilateral_centered_split import unit_quadrilateral_centered_split_twist_tile,unit_quadrilateral_centered_split_twist_alt_tile,SAVED_ANGLES; from tessellation_split_exact import unit_quadrilateral_vertices; first=unit_quadrilateral_vertices(SAVED_ANGLES,1.2,2); build=${alternate?'unit_quadrilateral_centered_split_twist_alt_tile':'unit_quadrilateral_centered_split_twist_tile'}; _,_,info=build(SAVED_ANGLES,1.2,2,.1,${alternate?30:80},2,'V',['V']*4); print(json.dumps([[first[1][k]+first[2][k]-p[k] for k in (0,1)] for p in info['centralVertices']]))`;
  const centerRun=spawnSync(python,['-c',centerCode],{cwd:path.join(root,'backend'),encoding:'utf8',timeout:30000,windowsHide:true,env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
  if(centerRun.status!==0)throw Error(centerRun.stderr||String(centerRun.error));
  const centers=JSON.parse(centerRun.stdout) as Point[],raw=(response.fold as {vertices_coords:Point[]}).vertices_coords;
  const minX=Math.min(...raw.map(p=>p[0])),minY=Math.min(...raw.map(p=>p[1])),scale=200/Math.max(Math.max(...raw.map(p=>p[0]))-minX,Math.max(...raw.map(p=>p[1]))-minY);
  const centerMatches=centers.map(point=>{const mapped:Point=[(point[0]-minX)*scale,(point[1]-minY)*scale],distances=graph.vertices_coords.map(vertex=>Math.hypot(vertex[0]-mapped[0],vertex[1]-mapped[1]));const index=distances.indexOf(Math.min(...distances));return {index,distance:distances[index]};});
  const centralEdges=criticalFoldEdges.map(edge=>edge.vertices.every(vertex=>centerMatches.some(match=>match.index===vertex&&match.distance<1e-6)));
  assert.ok(centralEdges.every(Boolean));
  assert.ok(criticalFoldEdges.every(edge=>edge.assignment==='V'));
  assert.ok(criticalGeometry.every(item=>'crossing' in item?item.crossing!.margin>1:item.common!.margin>1));
  const singleCases=[];
  for(const tileIndex of [0,1]){
    const spec=structuredClone(alternate?unitQuadrilateralAltSplitPreset():unitQuadrilateralCenteredSplitPreset());
    spec.arrangement='single';spec.tiles=[spec.tiles[tileIndex]];
    const singleParams=readTessParams(unitQuadrilateralSplitSourceParams(spec));
    if(!singleParams||singleParams.family!=='custom')throw Error('单块来源参数回读失败');
    const singleRequest=structuredClone(singleParams);delete singleRequest.unitQuadrilateralSplit;
    const singleRun=spawnSync(python,[path.join(root,'backend/tessellate.py')],{cwd:root,input:JSON.stringify(singleRequest),encoding:'utf8',timeout:30000,windowsHide:true,env:{...process.env,PYTHONUTF8:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
    if(singleRun.status!==0)throw Error(singleRun.stderr||String(singleRun.error));
    const singleResponse=JSON.parse(singleRun.stdout) as TessResponse;
    const singlePrepared=prepareTessResult(singleResponse,singleParams);
    const singleGraph=tessFlatInput(singlePrepared,singlePrepared.doc,tessConstructionKey(singleParams),true).graph;
    const singleGeometry=computeFlatGeometry(singleGraph,1e-6,{startingFace:tessFlatRoot(singleGraph)});
    singleCases.push({tileIndex,geometry:singleGeometry.geometry.status,layers:singleGeometry.geometry.status==='ready'?recomputeFlatLayers(singleGeometry).layers:singleGeometry.layers});
  }
  let engine:string;try{engine=JSON.stringify(ear.layer(folded,1e-6));}catch(error){engine=String(error)+' / '+String((error as Error&{cause?:unknown}).cause);}
  const toleranceChecks=[1e-8,1e-7,1e-6,1e-5,1e-4].map(epsilon=>{
    try{ear.layer(folded,epsilon);return [epsilon,'has-solution'];}
    catch(error){return [epsilon,String((error as Error&{cause?:unknown}).cause??error)];}
  });
  assert.ok(toleranceChecks.every(([,status])=>String(status).includes('invalid transitivity')));
  assert.ok(singleCases.every(item=>item.geometry==='ready'&&item.layers.status==='no-solution'));
  const reversed=structuredClone(result);
  reversed.geometry.graph!.edges_assignment=reversed.geometry.graph!.edges_assignment.map(value=>value==='M'?'V':value==='V'?'M':value);
  reversed.geometry.graph!.edges_foldAngle=reversed.geometry.graph!.edges_assignment.map(value=>value==='M'?-180:value==='V'?180:0);
  console.log(JSON.stringify({example:alternate?'In[3069]':'In[3066]',cp:{faces:folded.faces_vertices?.length,edges:folded.edges_vertices.length},
    solver:recomputeFlatLayers(result).layers.status,allReversed:recomputeFlatLayers(reversed).layers.status,
    rabbitEarCause:engine,toleranceChecks,independentSAT:categorySat,
    minimumCore:[...critical.map(rule=>rule.source),...criticalGroups],
    overlapMargins:criticalGeometry.map(item=>({constraint:item.source,margin:'crossing' in item?item.crossing!.margin:item.common!.margin})),
    explicitCenterEdges:criticalFoldEdges.map((edge,i)=>({order:edge.order,edge:edge.edge,assignment:edge.assignment,vertices:edge.vertices,matched:centralEdges[i]})),
    singleTileStatuses:singleCases.map(item=>item.layers.status)}));
}
