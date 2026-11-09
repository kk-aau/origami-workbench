import {traceModelCase} from './materialTraceModel';
import {cutMaterialEdges} from '../../src/core/materialCut';
import {joinMaterialEdges} from '../../src/core/materialJoin';
import {inspectMaterialCurveModel} from '../../src/core/materialCurveModel';
export function topologyModelCase(name:string){
 const source=traceModelCase('single');if(name==='source')return source;
 const checked=inspectMaterialCurveModel(source);if(!checked.ok)throw Error(checked.reason);const id=source.segments.find(s=>s.id.startsWith(checked.model.groups[0].id+'::crease'))!.id,cut=cutMaterialEdges(source,{kind:'material-cut',segmentIds:[id],parametric:true});if(name==='cut')return cut.doc;
 const [first,second]=cut.descendants.get(id)!;if(name==='joined')return joinMaterialEdges(cut.doc,{kind:'material-join',pairs:[{first,second,assignment:'F'}],parametric:true}).doc;
 throw Error(name);
}
