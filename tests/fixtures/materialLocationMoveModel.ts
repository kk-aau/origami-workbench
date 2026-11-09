import type {Doc} from '../../src/core/types';
import type {MaterialConstructionMoveIntent} from '../../src/app/materialConstructionMove';
import {constructMaterialMove} from '../../src/app/materialConstructionMove';
import {weakToolSheet,weakToolMaterial as mat} from './materialWeakTools';
import {faceIdentityRecipe} from './materialFaceIdentity';
import {editMaterialFaces} from '../../src/core/materialFaceEdit';
export const locationMoveRecipe=(d:Doc,kind:'translate'|'similarity'='translate',x=150):MaterialConstructionMoveIntent=>({kind:'material-construction-move',segmentIds:mat(d).edgeSegmentIds,transform:kind==='translate'?{kind,from:[0,0],to:[x,20]}:{kind,a:[0,0],b:[100,0],c:[x,20],d:[x,120]},lockBoundary:false});
export function locationMoveCase(name:string){const d=weakToolSheet();if(name==='source')return d;const r=constructMaterialMove(d,{...locationMoveRecipe(d,name==='similarity'?'similarity':'translate'),parametric:true}).doc;return name==='two'?editMaterialFaces(r,{...faceIdentityRecipe(r),parametric:true}).doc:r;}
