import type {Doc} from '../../src/core/types';
import {weakToolSheet,weakToolAnchor,weakToolMaterial as mat} from './materialWeakTools';
import {editMaterialFaces} from '../../src/core/materialFaceEdit';
import {reflectMaterialEdge,type MaterialEdgeReflectIntent} from '../../src/core/materialReflect';
export function reflectModelBase(assignment:'F'|'M'|'V'|'U'='F'){
 const d=weakToolSheet(),r=editMaterialFaces(d,{kind:'material-face-trace',component:0,from:weakToolAnchor(d,[0,25]),to:weakToolAnchor(d,[100,25]),assignment,fixedSide:'left'}),doc=r.doc;doc.segments.push({id:'mirror-axis',a:[0,50],b:[100,50],assignment:'A',angle:0});return {doc,recipe:{kind:'material-edge-reflect',sourceId:r.insertedIds![0],axisId:'mirror-axis',component:'source',fixedSide:'left',cpOnly:false} as MaterialEdgeReflectIntent};
}
export function reflectModelCase(name:string):Doc{const {doc,recipe}=reflectModelBase(name==='mountain'?'M':'F');if(name==='source')return doc;if(name==='diagonal'){doc.segments.find(s=>s.id==='mirror-axis')!.a=[0,0];doc.segments.find(s=>s.id==='mirror-axis')!.b=[100,100];}const reflected=reflectMaterialEdge(doc,{...recipe,parametric:true}).doc;if(name==='two'){const m=mat(reflected),edges=m.graph.faces_edges![2];return editMaterialFaces(reflected,{kind:'material-face-insert',face:2,from:{edgeId:m.edgeSegmentIds[edges[0]],fraction:.5},to:{edgeId:m.edgeSegmentIds[edges[2]],fraction:.5},assignment:'F',fixedPart:0,cpOnly:false,parametric:true}).doc;}return reflected;}
