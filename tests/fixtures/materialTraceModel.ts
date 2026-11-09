import type {Doc,Point} from '../../src/core/types';
import type {MaterialTraceRecipe} from '../../src/core/materialCurveModel';
import {weakToolSheet,weakToolAnchor} from './materialWeakTools';
import {editMaterialFaces} from '../../src/core/materialFaceEdit';
export const traceModelBase=()=>weakToolSheet();
export const traceModelRecipe=(doc:Doc,kind:MaterialTraceRecipe['kind'],y=30):MaterialTraceRecipe=>{
 const from=weakToolAnchor(doc,[0,y]),to=weakToolAnchor(doc,[100,y]);
 if(kind==='material-face-ray')return {kind,component:0,from,through:[10,y],assignment:'F',fixedSide:'left',cpOnly:false};
 if(kind==='material-face-traces')return {kind,component:0,lines:[{from,to,assignment:'F'}],fixedPoint:[10,10],cpOnly:false,overrides:[]};
 return {kind,component:0,from,to,assignment:'F',fixedSide:'left',cpOnly:false};
};
export function traceModelCase(name:string){
 let d=traceModelBase();
 if(name==='base')return d;
 d=editMaterialFaces(d,{...traceModelRecipe(d,'material-face-trace',30),parametric:true}).doc;
 if(name==='single')return d;
 d=editMaterialFaces(d,{...traceModelRecipe(d,'material-face-ray',70),parametric:true}).doc;
 if(name==='two')return d;
 d=editMaterialFaces(d,{...traceModelRecipe(d,'material-face-traces',85),parametric:true}).doc;
 if(name==='three')return d;
 throw Error(name);
}
