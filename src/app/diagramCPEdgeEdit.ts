import {buildDiagramFold,distance,epsilonFor} from '../core/geometry';
import {defaultAngle,type Assignment,type Point,type Segment} from '../core/types';
import {updateDiagramAnnotations,updateDiagramCP,updateDiagramFoldLink,type DiagramProject,type DiagramCPState} from './diagramProject';
import {applyDiagramFoldSegments,subtractDiagramFoldSegments,intersectDiagramFoldSegments,retainDiagramPrecreaseIntents} from './diagramFoldLink';
import {adoptDiagramFoldCP,defaultDiagramFoldLink} from './diagramFoldTransactions';
import {isDiagramCPLine,type DiagramLineAnnotation} from './diagramAnnotations';

export type DiagramCPEdgeAssignment='M'|'V'|'F';
export type DiagramCPEdgeAction='fold'|'precrease';
export interface DiagramCPEdgeGeometry {a:Point;b:Point}
export interface DiagramCPEdgeProperties {assignment:Assignment;foldAction:DiagramCPEdgeAction|null}

/** CP selection refers to the atomic edge between intersections, rather than
 * every original segment that contributed to that edge. */
export function diagramCPEdgeSegment(state:DiagramCPState,index:number):Segment {
  const graph=buildDiagramFold(state.doc).graph,edge=graph.edges_vertices[index];
  if(!Number.isInteger(index)||index<0||!edge)throw new Error('所选 CP 线段已变化，请重新选择。');
  const assignment=graph.edges_assignment[index] as Assignment;
  return {id:`cp-edge:${state.id}:${index}`,a:[...graph.vertices_coords[edge[0]]],b:[...graph.vertices_coords[edge[1]]],assignment,angle:graph.edges_foldAngle[index]===undefined?defaultAngle(assignment):graph.edges_foldAngle[index]};
}

export function findDiagramCPEdge(state:DiagramCPState,geometry:DiagramCPEdgeGeometry):number {
  const graph=buildDiagramFold(state.doc).graph,eps=epsilonFor(state.doc)*4;
  return graph.edges_vertices.findIndex(([a,b])=>{
    const x=graph.vertices_coords[a],y=graph.vertices_coords[b];
    return distance(x,geometry.a)<=eps&&distance(y,geometry.b)<=eps||distance(x,geometry.b)<=eps&&distance(y,geometry.a)<=eps;
  });
}

function edgeContext(project:DiagramProject,stepId:string,stateId:string,index:number){
  const step=project.steps.find(item=>item.id===stepId),state=project.states.find(item=>item.id===stateId);
  if(!step||!state||stateId!==step.beforeId&&stateId!==step.afterId)throw new Error('所选 CP 不属于当前步骤。');
  return {step,edge:diagramCPEdgeSegment(state,index),after:project.states.find(item=>item.id===step.afterId)!};
}

/** A precrease is physically F/0° in the after CP, while its illustration
 * retains the requested M/V instruction. Read both records for the menu.
 * A before-CP edge can span differently edited after-CP pieces; mixed or
 * incomplete coverage has no single property value and returns null. */
export function diagramCPEdgeProperties(project:DiagramProject,stepId:string,stateId:string,index:number):DiagramCPEdgeProperties|null {
  const {step,edge,after}=edgeContext(project,stepId,stateId,index);
  if(edge.assignment==='B'||edge.assignment==='A')return {assignment:edge.assignment,foldAction:null};
  const covered=intersectDiagramFoldSegments(after.doc,after.doc.segments.filter(segment=>['M','V','U','F'].includes(segment.assignment)),[edge]);
  if(!covered.length||subtractDiagramFoldSegments({...after.doc,segments:[edge]},covered,false).segments.length)return null;
  const assignments=new Set(covered.map(segment=>segment.assignment));
  if(assignments.size!==1)return null;
  const assignment=covered[0].assignment;
  if(assignment!=='F'){
    if(assignment!=='M'&&assignment!=='V')return {assignment,foldAction:null};
    const before=project.states.find(state=>state.id===step.beforeId)!;
    const returning=retainDiagramPrecreaseIntents(before.doc,after.doc,step.foldLink?.precreases??[]).filter(segment=>segment.assignment===assignment);
    const intent=intersectDiagramFoldSegments(after.doc,returning,covered);
    if(intent.length&&subtractDiagramFoldSegments({...after.doc,segments:[edge]},intent,false).segments.length)return null;
    return {assignment,foldAction:intent.length?'precrease':'fold'};
  }
  const intent=intersectDiagramFoldSegments(after.doc,step.foldLink?.precreases??[],covered);
  if(!intent.length)return {assignment:'F',foldAction:null};
  const requested=new Set(intent.map(segment=>segment.assignment));
  if(requested.size!==1||subtractDiagramFoldSegments({...after.doc,segments:[edge]},intent,false).segments.length)return null;
  const requestedAssignment=intent[0].assignment;
  return requestedAssignment==='M'||requestedAssignment==='V'?{assignment:requestedAssignment,foldAction:'precrease'}:null;
}

/** The inspector edits this step's instruction, which can differ from both
 * the before-CP angle and a precrease's unfolded after-CP endpoint. */
export function diagramCPEdgeFoldAngle(project:DiagramProject,stepId:string,stateId:string,index:number):number|null|'mixed' {
  const {step,edge,after}=edgeContext(project,stepId,stateId,index),properties=diagramCPEdgeProperties(project,stepId,stateId,index);
  if(edge.assignment==='B'||edge.assignment==='A')return edge.angle===null?null:Math.abs(edge.angle);
  // The geometric fold helpers intentionally protect boundaries/auxiliary
  // lines from subtraction; they are not members of a crease's angle range.
  const source=properties?.foldAction==='precrease'?step.foldLink?.precreases??[]:after.doc.segments.filter(segment=>['M','V','F','U'].includes(segment.assignment));
  const covered=intersectDiagramFoldSegments(after.doc,source,[edge]);
  if(!covered.length||subtractDiagramFoldSegments({...after.doc,segments:[edge]},covered,false).segments.length)return 'mixed';
  const angles=new Set(covered.map(segment=>segment.angle===null?null:Math.abs(segment.angle)));
  return angles.size===1?[...angles][0]:'mixed';
}

/** CP reassignment changes type, not the user's line appearance. Inherited
 * styling is normally matched by type; retain it across this explicit type
 * change as well, keeping coincident faces with different styles separate. */
function preserveEdgeAppearance(next:DiagramProject,stepId:string,previous:DiagramLineAnnotation[]):DiagramProject {
  const step=next.steps.find(item=>item.id===stepId)!,used=new Set((step.annotations??[]).map(item=>item.id));
  const covers=(source:DiagramLineAnnotation,target:DiagramLineAnnotation)=>{
    const dx=source.b[0]-source.a[0],dy=source.b[1]-source.a[1],length=Math.hypot(dx,dy);
    return length>1e-8&&[target.a,target.b].every(point=>{
      const x=point[0]-source.a[0],y=point[1]-source.a[1],along=(x*dx+y*dy)/length;
      return Math.abs(x*dy-y*dx)/length<1e-7&&along>=-1e-7&&along<=length+1e-7;
    });
  };
  const annotations=(step.annotations??[]).flatMap(item=>{
    if(item.kind!=='line'||!isDiagramCPLine(item)||!item.foldFaces?.length)return [item];
    const groups=new Map<string,DiagramLineAnnotation>();
    for(const face of item.foldFaces){
      const candidates=previous.filter(line=>(!line.foldFaces||line.foldFaces.includes(face))&&covers(line,item));
      const explicit=candidates.filter(line=>line.foldFaces?.includes(face));
      const options=explicit.length?explicit:candidates;
      const source=options.find(line=>line.style===item.style)??options[0];
      const color=source?.color??item.color,width=source?.width??item.width,appearanceOverrides=source?.appearanceOverrides??item.appearanceOverrides;
      const strokePattern=source?.appearanceOverrides?.includes('strokePattern')?source.strokePattern:item.strokePattern;
      const key=`${color}|${width}|${strokePattern??''}|${appearanceOverrides?.join(',')??''}`;
      const group=groups.get(key);
      if(group)group.foldFaces!.push(face);
      else groups.set(key,{...item,color,width,...(strokePattern?{strokePattern}:{}),...(appearanceOverrides?{appearanceOverrides:[...appearanceOverrides]}:{}),foldFaces:[face]});
    }
    return [...groups.values()].map((line,index)=>{
      if(!index)return line;
      let suffix=0,id=`${item.id}:appearance:${index}`;
      while(used.has(id))id=`${item.id}:appearance:${index}:${++suffix}`;
      used.add(id);return {...line,id};
    });
  });
  return updateDiagramAnnotations(next,stepId,annotations);
}

/** Both CP cards can supply a route. The operation belongs to this step's
 * after CP, leaving its before CP and previous step untouched. */
export function editDiagramCPEdge(project:DiagramProject,stepId:string,stateId:string,index:number,assignment:DiagramCPEdgeAssignment,action:DiagramCPEdgeAction='fold',magnitude?:number|null):DiagramProject {
  if(!['M','V','F'].includes(assignment))throw new Error('请选择谷折、山折或已有折痕。');
  if(!['fold','precrease'].includes(action))throw new Error('请选择本步折叠或预折后展开。');
  const {step,edge,after}=edgeContext(project,stepId,stateId,index);
  if(edge.assignment==='B'||edge.assignment==='A')throw new Error('纸边与辅助线不参与折叠，请选择内部折痕。');
  const current=diagramCPEdgeFoldAngle(project,stepId,stateId,index),properties=diagramCPEdgeProperties(project,stepId,stateId,index);
  const amount=magnitude===undefined?(properties?.assignment==='M'||properties?.assignment==='V'?current==='mixed'?(edge.angle===null?null:Math.abs(edge.angle)):current:180):magnitude;
  if(amount!==null&&(!Number.isFinite(amount)||amount<0||amount>180))throw Error('折叠角度须为 0 到 180 度。');
  const target=assignment==='F'?0:amount===null?null:assignment==='M'?-amount:amount;
  const precrease=action==='precrease'&&assignment!=='F',before=project.states.find(state=>state.id===step.beforeId)!;
  const matching=(segment:Segment)=>segment.assignment===assignment&&segment.angle===target;
  const oldCoverage=precrease?intersectDiagramFoldSegments(after.doc,before.doc.segments.filter(matching),after.doc.segments.filter(matching)):[];
  const unchanged=intersectDiagramFoldSegments(after.doc,[{...edge,assignment,angle:target}],oldCoverage);
  const returning=unchanged.length>0&&!subtractDiagramFoldSegments({...after.doc,segments:[edge]},unchanged,false).segments.length;
  const physicalAssignment=precrease&&!returning?'F':assignment;
  const changed=returning?after.doc:applyDiagramFoldSegments(after.doc,[{...edge,assignment:physicalAssignment,angle:physicalAssignment==='F'?0:target}]);
  const settings=step.foldLink??defaultDiagramFoldLink();
  const retained=subtractDiagramFoldSegments({...after.doc,segments:settings.precreases??[]},[{...edge,assignment:'F',angle:0}],false);
  const precreases=precrease?applyDiagramFoldSegments(retained,[{...edge,assignment,angle:target}]).segments:retained.segments;
  const configured=updateDiagramFoldLink(project,stepId,{...settings,enabled:true,...(precrease||settings.precreases?{precreases}:{})});
  return step.pose?.sourceStateId===step.beforeId?
    preserveEdgeAppearance(adoptDiagramFoldCP(configured,stepId,changed),stepId,(step.annotations??[]).filter((item):item is DiagramLineAnnotation=>item.kind==='line')):
    updateDiagramCP(configured,after.id,changed);
}
