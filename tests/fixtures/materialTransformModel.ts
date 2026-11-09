import {traceModelCase} from './materialTraceModel';
import {topologyModelCase} from './materialTopologyModel';
import {editMaterialFaces} from '../../src/core/materialFaceEdit';
import type {MaterialComponentTransformIntent} from '../../src/core/materialComponentTransform';
export const transformModelRecipe=(kind:MaterialComponentTransformIntent['operation']['kind']='move',a=20,b=10):MaterialComponentTransformIntent=>({kind:'material-transform',components:[0],operation:{kind,a:kind==='mirrorX'||kind==='mirrorY'?0:a,...(kind==='move'?{b}:{})}});
export function transformModelCase(name:string){
 const source=traceModelCase('single');if(name==='source')return source;
 const moved=editMaterialFaces(source,{...transformModelRecipe(),parametric:true}).doc;if(name==='moved')return moved;
 if(name==='two')return editMaterialFaces(moved,{...transformModelRecipe('rotate',15),parametric:true}).doc;
 if(name==='ray')return editMaterialFaces(moved,{kind:'material-face-ray',component:0,from:{edgeId:'material-edge-0',fraction:.5},through:[80,100],assignment:'F',fixedSide:'left',cpOnly:false,parametric:true}).doc;
 if(name==='cut')return editMaterialFaces(topologyModelCase('cut'),{...transformModelRecipe(),parametric:true}).doc;
 throw Error(name);
}
