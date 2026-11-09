import type {Doc} from '../../src/core/types';
import {inspectMaterialTopology} from '../../src/core/materialTopology';
import type {MaterialCopyIntent,MaterialCopyPlacement} from '../../src/core/materialCopy';
import {copyMaterialComponents} from '../../src/core/materialCopy';
import {transformModelCase} from './materialTransformModel';
import {editMaterialFaces} from '../../src/core/materialFaceEdit';
export function copyModelRecipe(doc:Doc,dx=150,count=1,extra:Partial<MaterialCopyPlacement>={}):MaterialCopyIntent{
 const m=inspectMaterialTopology(doc);if(!m.ok)throw Error(m.reason);return {kind:'material-copy',segmentIds:m.components[0].edges.map(e=>m.edgeSegmentIds[e]),placements:Array.from({length:count},(_,i)=>({dx:(i+1)*dx,dy:0,rotation:0,scale:1,mirror:'none',...extra}))};
}
export function copyModelCase(name:string){const d=transformModelCase('source');if(name==='source')return d;const copied=copyMaterialComponents(d,{...copyModelRecipe(d),parametric:true}).doc;if(name==='copied')return copied;const m=inspectMaterialTopology(copied);if(!m.ok)throw Error(m.reason);if(name==='transformed')return editMaterialFaces(copied,{kind:'material-transform',components:[1],operation:{kind:'move',a:10,b:20},parametric:true}).doc;if(name==='ray')return editMaterialFaces(copied,{kind:'material-face-ray',component:1,from:{edgeId:m.edgeSegmentIds[m.components[1].edges[0]],fraction:.5},through:[200,100],assignment:'F',fixedSide:'left',cpOnly:false,parametric:true}).doc;throw Error(name);}
