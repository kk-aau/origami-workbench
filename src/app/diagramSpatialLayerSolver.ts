import {contactIslands,contactGroupGraph} from '../core/contactIslands';
import {regionParallelWorkerCount} from '../core/regionParallelHardware';
import {polygonArea} from '../core/geometry';
import {solveSpatialContactGroup,type SpatialContactGroupInput,type SpatialContactGroupResult} from './diagramSpatialContactGroup';
import type {FlatFoldResult,FlatLayerAdjustment,FlatLayerPreference,FoldGraph,Point} from '../core/types';
import type {DiagramSpatialPose} from './diagramSpatialPose';
import {spatialOverlapRegions} from './modelOverlapRegions';
import {applyRigidFoldTransform} from '../core/rigidFoldGeometry';
import {findDiagramSpatialCycle,spatialDiagnosticError} from './diagramSpatialDiagnostic';

type Orders=NonNullable<FlatFoldResult['layers']['faceOrders']>;
type ContactPreference=(a:number,b:number)=>Orders[number]|undefined;
export interface GroupTask {
  input:SpatialContactGroupInput;
  pairCount:number;
  accept:(result:SpatialContactGroupResult)=>void;
  coversMaterialPairs?:(orders:Orders)=>boolean;
  materialFaces?:number[];
}
export interface SpatialLayerRequest {relativeConstraints?:FlatLayerPreference[];layerAdjustment?:FlatLayerAdjustment}
const key=(a:number,b:number)=>[Math.min(a,b),Math.max(a,b)].join(':');

const FLAT_HINGE_PLANE_TOLERANCE_MM=1e-10;

function flatHingeGroups(source:FoldGraph,spatial:DiagramSpatialPose){
  const flatNeighbors=spatial.faceTransforms.map(()=>[] as number[]);
  for(const [e,banks] of (source.edges_faces??[]).entries()){
    if(banks.length!==2||source.edges_assignment[e]==='B')continue;
    const angle=source.edges_foldAngle?.[e]??spatial.measuredAngles[e];
    if(angle!==0&&angle!==180&&angle!==-180)continue;
    const [a,b]=banks;
    flatNeighbors[a].push(b);flatNeighbors[b].push(a);
  }
  const owner=new Int32Array(flatNeighbors.length).fill(-1);
  for(let root=0;root<flatNeighbors.length;root++){
    if(owner[root]!==-1)continue;
    const group=[root];owner[root]=root;
    for(const f of group){
      for(const next of flatNeighbors[f])if(owner[next]===-1){owner[next]=root;group.push(next);}
    }
  }
  return owner;
}

/** Test material planes in world space, independent of camera depth precision. */
export function spatialContactGeometry(source:FoldGraph,spatial:DiagramSpatialPose){
  const anchors=source.faces_vertices!.map(face=>spatial.vertices[face[0]]);
  const boundsMin=[Infinity,Infinity,Infinity],boundsMax=[-Infinity,-Infinity,-Infinity];
  for(const point of spatial.vertices)for(let i=0;i<3;i++){
    boundsMin[i]=Math.min(boundsMin[i],point[i]);boundsMax[i]=Math.max(boundsMax[i],point[i]);
  }
  const span=Math.max(1,...boundsMax.map((hi,i)=>hi-boundsMin[i]));
  let flatGroups:Int32Array|undefined;
  const local=(f:number,p:readonly number[],origin:readonly number[])=>{
    const r=spatial.faceTransforms[f].rotation,x=p[0]-origin[0],y=p[1]-origin[1],z=p[2]-origin[2];
    return [0,1,2].map(i=>r[i]*x+r[i+3]*y+r[i+6]*z);
  };
  // Separate fold closure error at paper scale from input rounding along the
  // plane normal. A large translation parallel to the plane cannot close a gap.
  const coplanar=(root:number,f:number)=>{
    const a=spatial.faceTransforms[root].rotation,b=spatial.faceTransforms[f].rotation,origin=anchors[root];
    if(Math.abs(Math.abs(a[2]*b[2]+a[5]*b[5]+a[8]*b[8])-1)>=1e-10)return false;
    flatGroups??=flatHingeGroups(source,spatial);
    const flatConnected=flatGroups[root]===flatGroups[f];
    const matches=(v:number)=>{
      const p=spatial.vertices[v];
      const gap=Math.abs(a[2]*(p[0]-origin[0])+a[5]*(p[1]-origin[1])+a[8]*(p[2]-origin[2]));
      if(flatConnected)return gap<=FLAT_HINGE_PLANE_TOLERANCE_MM;
      const rounding=Math.abs(a[2])*Math.max(Math.abs(p[0]),Math.abs(origin[0]))+
        Math.abs(a[5])*Math.max(Math.abs(p[1]),Math.abs(origin[1]))+
        Math.abs(a[8])*Math.max(Math.abs(p[2]),Math.abs(origin[2]));
      return gap<=Number.EPSILON*(2048*span+4*rounding);
    };
    return source.faces_vertices![f].every(matches)&&(source.faces_holes?.[f]??[]).every(ring=>ring.every(matches));
  };
  const diameter=Math.hypot(...boundsMax.map((v,i)=>v-boundsMin[i]));
  // A transverse face can touch the other face's rim while remaining entirely
  // on one side of its plane. Only forgive wrong-side roundoff at matching
  // material corners; a narrow interior crossing still has to be reported.
  const boundarySide=(plane:number,face:number)=>{
    const normal=spatial.faceTransforms[face].rotation,r=spatial.faceTransforms[plane].rotation;
    if(Math.abs(r[2]*normal[2]+r[5]*normal[5]+r[8]*normal[8])>=1-1e-10)return 0;
    const corners=(f:number)=>[...source.faces_vertices![f],...(source.faces_holes?.[f]??[]).flat()];
    const rim=corners(plane).map(v=>spatial.vertices[v]),origin=anchors[plane];
    const tolerance=2048*Number.EPSILON*span;
    let side=0;
    const near:{p:readonly number[];offset:number}[]=[];
    for(const v of corners(face)){
      const p=spatial.vertices[v];
      const offset=r[2]*(p[0]-origin[0])+r[5]*(p[1]-origin[1])+r[8]*(p[2]-origin[2]);
      if(Math.abs(offset)<=tolerance){near.push({p,offset});continue;}
      if(side&&side!==Math.sign(offset))return 0;
      side=Math.sign(offset);
    }
    if(!side||!near.length)return 0;
    const matched=near.filter(({p})=>rim.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2])<=tolerance));
    const stray=near.filter(vertex=>side*vertex.offset<0&&!matched.includes(vertex));
    if(stray.length){
      // A long paper edge may extend past the last shared corner. Two
      // distinct coincident corners fix the line of the two material planes.
      const p=matched[0]?.p;
      if(!p)return 0;
      const distance=(q:readonly number[])=>Math.hypot(q[0]-p[0],q[1]-p[1],q[2]-p[2]);
      const q=matched.reduce((best,v)=>distance(v.p)>distance(best)?v.p:best,p);
      const length=distance(q);
      if(length<=4*tolerance)return 0;
      const x=(q[0]-p[0])/length,y=(q[1]-p[1])/length,z=(q[2]-p[2])/length;
      for(const {p:v} of stray){
        const a=v[0]-p[0],b=v[1]-p[1],c=v[2]-p[2];
        if(Math.hypot(y*c-z*b,z*a-x*c,x*b-y*a)>tolerance)return 0;
      }
    }
    return side;
  };
  return {anchors,local,coplanar,diameter,boundarySide};
}

/** Solve actual touching planes in their own orthonormal frame. A camera's
 * flattened projection is not a flat-fold model: tilted faces and depth gaps
 * must never be handed to the planar solver as if they were touching. */
function prepareSpatialContactGroups(source:FoldGraph,spatial:DiagramSpatialPose,current:Orders,request?:SpatialLayerRequest,shown?:FlatFoldResult,resolveAll=false,inheritedPreference?:ContactPreference){
  const count=source.faces_vertices!.length;
  const validRows=(rows:Orders)=>{if(!Array.isArray(rows)||rows.some(r=>!Array.isArray(r)||r.length!==3||r[0]===r[1]||r.slice(0,2).some(f=>!Number.isSafeInteger(f)||f<0||f>=count)||Math.abs(r[2])!==1))throw Error('保存的立体纸层关系无效。');};
  const saved=spatial.layerContacts??[],required=spatial.layerConstraints??[];validRows(saved);validRows(required);validRows(current);
  const {anchors,local,coplanar,diameter}=spatialContactGeometry(source,spatial);
  const planes:number[][]=[],planeOwner:number[]=[];
  for(let f=0;f<count;f++){
    let group=planes.findIndex(g=>coplanar(g[0],f));
    if(group<0){group=planes.length;planes.push([]);}planes[group].push(f);planeOwner[f]=group;
  }
  const screenNormal=(f:number)=>shown?Math.sign(polygonArea(shown.geometry.faces[f].map(v=>shown.geometry.vertices[v]))):0;
  let constraints=required;
  if(request?.relativeConstraints){
    constraints=request.relativeConstraints.map(({above,below})=>{
      if(!Number.isSafeInteger(above)||!Number.isSafeInteger(below)||above<0||below<0||above>=count||below>=count||above===below)throw Error('请选择两个不同的有效纸面。');
      const normal=screenNormal(below);if(!normal)throw Error('所选纸面当前侧立成线，请转动视角后指定上下关系。');
      return [above,below,normal];
    });
  }
  for(const [a,b] of [...saved,...constraints])if(planeOwner[a]!==planeOwner[b]||!coplanar(a,b)||!coplanar(b,a))throw spatialDiagnosticError(source,spatial,{kind:'layer-conflict',faceIds:[a,b],message:`纸面 F${a+1} 与 F${b+1} 存在真实空间夹角或间距，不能只交换层序；请调整折角。`});
  const target=request?.layerAdjustment;
  if(target&&(!Number.isSafeInteger(target.face)||target.face<0||target.face>=count))throw Error('请选择有效纸面。');
  // Euclidean diameter bounds the span in any group's orthonormal frame.
  // Twice the planar solver's maximum point tolerance also retains pairs
  // whose edge boxes were expanded on both sides of an ambiguous contact.
  const padding=2*Math.max(1e-6,diameter*1e-8);
  const groups=planes.flatMap(plane=>contactIslands(plane,source,
    v=>local(plane[0],spatial.vertices[v],anchors[plane[0]]).slice(0,2) as Point,padding));
  const owner:number[]=[];groups.forEach((ids,i)=>{for(const f of ids)owner[f]=i;});
  for(const [a,b] of constraints)if(owner[a]!==owner[b])throw spatialDiagnosticError(source,spatial,{kind:'layer-conflict',faceIds:[a,b],message:`纸面 F${a+1} 与 F${b+1} 没有面积重叠，请选择实际重叠的纸面。`});
  const selected=new Set([...saved,...constraints].map(([a])=>owner[a]));if(target)selected.add(owner[target.face]);
  const contacts=new Map(resolveAll?[]:current.filter(([a,b])=>owner[a]===owner[b]).map(row=>[key(row[0],row[1]),row]));let message='指定的立体纸层关系已通过求解。';
  if(resolveAll)groups.forEach((ids,i)=>{if(ids.length>1)selected.add(i);});
  const inspect=new Set(selected);
  for(const [a,b] of current)if(owner[a]===owner[b])inspect.add(owner[a]);
  const prepare=(gi:number):GroupTask|undefined=>{
    const ids=groups[gi],faceIndex=new Map(ids.map((f,i)=>[f,i])),root=ids[0];
    const graph=contactGroupGraph(ids,source,v=>local(root,spatial.vertices[v],anchors[root]).slice(0,2) as Point,spatial.measuredAngles);
    const points=graph.vertices_coords,faces=graph.faces_vertices!;
    const normal=(f:number)=>Math.sign(polygonArea(faces[faceIndex.get(f)!].map(v=>points[v])));
    const regionInput:FlatFoldResult={geometry:{status:'ready',message:'',vertices:points,faces,graph},layers:{status:'unknown',message:''},warnings:[]};
    const regions=spatialOverlapRegions(regionInput);
    if(regions.omittedThinRegions)throw Error('共面接触区域低于坐标精度，未省略纸层。');
    // Each pair is admitted only after its two faces share positive area.
    // IDs increase with the local face index. Numeric keys sort new preferences
    // in the original parent-pair order, independent of cell traversal.
    const pairs=new Set<number>();
    for(const {faces:cover} of regions.cells)for(let i=0;i<cover.length;i++)for(let j=i+1;j<cover.length;j++){
      const a=ids[cover[i]],b=ids[cover[j]];
      const pair=Math.min(a,b)*count+Math.max(a,b);
      if(pairs.has(pair))continue;
      // Closeness to the plane representative is not transitive. Only the
      // two material faces themselves can certify this positive-area pair.
      if(!coplanar(a,b)||!coplanar(b,a))throw spatialDiagnosticError(source,spatial,{kind:'layer-conflict',faceIds:[a,b],message:`纸面 F${a+1} 与 F${b+1} 的重叠区域接近同一平面，但两面之间的间距超出共面精度，无法确认接触层序。`});
      pairs.add(pair);
    }
    const touches=(a:number,b:number)=>pairs.has(Math.min(a,b)*count+Math.max(a,b));
    if(!selected.has(gi)){
      // Preserve verified choices in unaffected stacks without solving them
      // again. A carried row by itself is never evidence of material contact.
      for(const [a,b] of current)if(owner[a]===gi&&!touches(a,b))contacts.delete(key(a,b));
      return;
    }
    const rows=(orders:Orders)=>orders.filter(([a,b])=>owner[a]===gi&&owner[b]===gi&&touches(a,b));
    for(const [a,b] of constraints)if(owner[a]===gi&&!touches(a,b))throw spatialDiagnosticError(source,spatial,{kind:'layer-conflict',faceIds:[a,b],message:`纸面 F${a+1} 与 F${b+1} 没有面积重叠，请选择实际重叠的纸面。`});
    const preferences=(orders:Orders)=>rows(orders).map(([a,b,s])=>s*normal(b)>0?{above:faceIndex.get(a)!,below:faceIndex.get(b)!}:{above:faceIndex.get(b)!,below:faceIndex.get(a)!});
    // On file load every saved relation is a requirement to solve anew, never
    // a certificate. During an edit it is merely the old candidate/preference.
    const want=request?preferences(constraints):preferences([...saved,...constraints]);
    const failure=(message:string)=>{
      // A failed group is not automatically a cycle. Only label it as such
      // when the requested relations contain a closed path in one real cell.
      for(const cell of regions.cells){
        const localOrder=new Map<number,number[]>();
        for(const {above,below} of want)if(cell.faces.includes(above)&&cell.faces.includes(below))localOrder.set(below,[...(localOrder.get(below)??[]),above]);
        const cycle=findDiagramSpatialCycle(cell.faces,localOrder);if(!cycle)continue;
        const faceIds=[...new Set(cycle.map(f=>ids[f]))],vertices3D=cell.polygon.map(p=>applyRigidFoldTransform({...spatial.faceTransforms[root],translation:anchors[root]},p));
        return spatialDiagnosticError(source,spatial,{kind:'layer-cycle',message,faceIds,cycle:cycle.map(f=>ids[f]),region:faceIds.map(faceId=>({faceId,vertices3D,verticesCP:vertices3D.map(p=>local(faceId,p,spatial.faceTransforms[faceId].translation).slice(0,2) as Point)}))});
      }
      return spatialDiagnosticError(source,spatial,{kind:'layer-conflict',message,faceIds:ids});
    };
    const old=rows(current);
    if(inheritedPreference){
      const existing=new Set(old.map(([a,b])=>key(a,b)));
      for(const pair of [...pairs].sort((a,b)=>a-b)){
        const a=Math.floor(pair/count),b=pair%count;
        if(existing.has(key(a,b)))continue;
        const row=inheritedPreference(a,b);
        if(row){
          if(!((row[0]===a&&row[1]===b)||(row[0]===b&&row[1]===a))||Math.abs(row[2])!==1)throw Error('继承的接触关系与实际纸面对不一致。');
          old.push(row);
        }
      }
    }
    const result:FlatFoldResult={geometry:{status:'ready',message:'',vertices:points,faces,graph},layers:{status:'solved',message:'',faceOrders:old.map(([a,b,s])=>[faceIndex.get(a)!,faceIndex.get(b)!,s])},warnings:[]};
    let adjustment:FlatLayerAdjustment|undefined;
    if(target&&owner[target.face]===gi){const sign=screenNormal(target.face)*normal(target.face);if(!sign)throw Error('所选纸面当前侧立成线，请转动视角后调整层序。');adjustment={...target,face:faceIndex.get(target.face)!,side:sign>0?target.side:target.side==='front'?'back':'front'};}
    // Other groups are untouched. Retire stale rows from this group even
    // when its newly checked material has no contact pairs at all.
    for(const [a,b] of current)if(owner[a]===gi&&owner[b]===gi)contacts.delete(key(a,b));
    if(!pairs.size&&!adjustment)return;
    return {input:{result,required:want,preferred:preferences(old),adjustment},pairCount:pairs.size,materialFaces:ids,
      coversMaterialPairs:orders=>orders.filter(([a,b])=>touches(ids[a],ids[b])).length===pairs.size,accept(answer){
      if(!answer.ok)throw failure(answer.message);
      if(adjustment)message=answer.message;
      for(const [a,b,sign] of answer.orders)if(touches(ids[a],ids[b]))contacts.set(key(ids[a],ids[b]),[ids[a],ids[b],sign]);
    }};
  };
  return {selected:[...inspect],prepare,finish:()=>({contacts:[...contacts.values()],constraints:structuredClone(constraints),message})};
}

export function solveSpatialLayerContacts(...args:Parameters<typeof prepareSpatialContactGroups>){
  return solveSpatialLayerContactsUsing(undefined,...args);
}
export type RestoreContactGroup=(group:GroupTask)=>SpatialContactGroupResult;
export function solveSpatialLayerContactsUsing(restore:RestoreContactGroup|undefined,...args:Parameters<typeof prepareSpatialContactGroups>){
  const plan=prepareSpatialContactGroups(...args);
  for(const gi of plan.selected){
    const group=plan.prepare(gi);
    if(group)group.accept(restore?restore(group):solveSpatialContactGroup(group.input));
  }
  return plan.finish();
}

function runRemoteGroups(worker:Worker,batch:GroupTask[]):Promise<SpatialContactGroupResult[]|null>{
  return new Promise((resolve,reject)=>{
    // Null is reserved for worker/transport failure. A failed material solve
    // still carries its own diagnostic through the normal group acceptor.
    worker.onerror=event=>{event.preventDefault();resolve(null);};
    worker.onmessageerror=()=>resolve(null);
    worker.onmessage=({data})=>{
      if(typeof data?.error==='string')reject(Error(data.error));
      else if(Array.isArray(data?.results)&&data.results.length===batch.length)resolve(data.results);
      else reject(Error('并行纸面接触求解返回的组数无效。'));
    };
    try{worker.postMessage(batch.map(group=>group.input));}catch{resolve(null);}
  });
}

export async function solveSpatialLayerContactsAsync(...args:Parameters<typeof prepareSpatialContactGroups>){
  const plan=prepareSpatialContactGroups(...args);
  const groups:GroupTask[]=[];
  for(const gi of plan.selected){const group=plan.prepare(gi);if(group)groups.push(group);}
  await solveContactGroupTasks(groups);
  return plan.finish();
}

export async function solveContactGroupTasks(groups:GroupTask[],minimumWork=8192):Promise<void>{
  const local=(group:GroupTask)=>solveSpatialContactGroup(group.input);
  const workers:Worker[]=[];
  try{
    // Batch by actual overlap work. A large stack and a tiny neighbour do
    // not justify loading a second flat solver for the tiny group.
    const weights=groups.map(group=>group.input.result.geometry.faces.length+group.pairCount);
    // Includes import and warm-up of each child engine. In Edge, two
    // 112-layer stacks were still faster locally; at 128 layers each
    // (~8k actual pairs per lane) the complete parallel solve won.
    const split=typeof Worker==='function'?regionParallelWorkerCount(globalThis.navigator?.hardwareConcurrency,groups.length):1;
    let lanes=Math.min(split,Math.floor(weights.reduce((a,b)=>a+b,0)/minimumWork));
    let batches:number[][]=[];
    const largestFirst=weights.map((_,i)=>i).sort((a,b)=>weights[b]-weights[a]||a-b);
    for(;lanes>=2;lanes--){
      batches=Array.from({length:lanes},()=>[]);const loads=Array<number>(lanes).fill(0);
      for(const i of largestFirst){
        const bin=loads.indexOf(Math.min(...loads));
        loads[bin]+=weights[i];batches[bin].push(i);
      }
      if(Math.min(...loads)>=minimumWork)break;
    }
    if(lanes<2){for(const g of groups)g.accept(local(g));return;}
    const pending:Promise<SpatialContactGroupResult[]|null>[]=[];
    for(const batch of batches.slice(1)){
      let worker:Worker;
      try{worker=new Worker(new URL('../workers/diagramSpatialContactGroup.worker.ts',import.meta.url),{type:'module'});}
      catch{pending.push(Promise.resolve(null));continue;}
      workers.push(worker);
      pending.push(runRemoteGroups(worker,batch.map(i=>groups[i])));
    }
    const replies=Promise.all(pending);
    // Install both handlers before computing locally; failure/cancellation
    // terminates the sibling workers in the same finally block.
    const [remote,first]=await Promise.all([replies,Promise.resolve().then(()=>batches[0].map(i=>local(groups[i])))]);
    const results:SpatialContactGroupResult[]=new Array(groups.length);
    for(const [j,i] of batches[0].entries())results[i]=first[j];
    for(const [n,batch] of batches.slice(1).entries()){
      const solved=remote[n];
      for(const [j,i] of batch.entries())results[i]=solved?solved[j]:local(groups[i]);
    }
    for(const [i,group] of groups.entries())group.accept(results[i]);
    return;
  }finally{for(const worker of workers)worker.terminate();}
}
