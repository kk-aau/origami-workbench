import {blankDoc} from '../../src/app/state';
import {buildDiagramFold} from '../../src/core/geometry';
import type {Doc,Point,Segment} from '../../src/core/types';
import type {DiagramPose} from '../../src/app/diagramProject';

const segment=(id:string,a:Point,b:Point,assignment:Segment['assignment']):Segment=>({id,a,b,assignment,angle:assignment==='V'?180:0});

/** Pure source-mesh fixture, independent of a saved user project or a solver
 * certificate. Physical folds only name the source cells; this deliberately
 * does not claim a legal completely folded placement. */
export function nearCollinearMeshFixture():DiagramPose {
 const doc=blankDoc('近共线分区回归',200,200),right=199.99999999999997;
 const border:Point[]=[[right,149.99999999999997],[right,156.25],[right,200],[0,200],[0,0],[right,0],[right,112.50000000000001]];
 doc.segments=border.map((a,i)=>segment(`border-${i}`,a,border[(i+1)%border.length],'B'));
 const column:Point[]=[[193.75,0],[193.74999999999994,93.74999999999996],[193.7499999999988,106.24999999999886],[193.74999999999974,143.7499999999998],[193.7500000000003,156.24999999999986],[193.74999999999997,193.74999999999997],[193.75,200]];
 column.slice(1).forEach((b,i)=>doc.segments.push(segment(`hinge-${i}`,column[i],b,'V')));
 doc.segments.push(segment('lower-partition',column[2],[right,112.50000000000001],'V'),segment('upper-partition',column[4],[right,156.25],'V'),
   segment('remote-low',[180,93.75],column[1],'F'),segment('remote-high',[180,193.75],column[5],'F'));
 return sourceMeshPose(doc);
}

export function thinValidMeshFixture():DiagramPose {
 const doc=blankDoc('有效细三角回归',200,200),ring:Point[]=[[0,0],[100,0],[50,2.2e-6]];
 doc.segments=ring.map((a,i)=>segment(`border-${i}`,a,ring[(i+1)%ring.length],'B'));
 doc.segments.push(segment('mid-mark',[50,0],ring[2],'F'));
 return sourceMeshPose(doc);
}

function sourceMeshPose(doc:Doc):DiagramPose {
 const {graph}=buildDiagramFold(doc);
 return {sourceStateId:'mesh-source',sourceRevision:0,sourceDoc:doc,result:{
  geometry:{status:'ready',message:'用于来源几何分区测试，未声明完全平折姿态。',vertices:structuredClone(graph.vertices_coords),faces:graph.faces_vertices!,graph},
  layers:{status:'unknown',message:'该测试仅检查来源网格。'},warnings:[]}};
}
