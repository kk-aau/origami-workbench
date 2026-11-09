import type {Doc} from '../../src/core/types';
import type {MaterialConstructionCopyIntent} from '../../src/app/materialConstructionCopy';
import {constructMaterialCopy} from '../../src/app/materialConstructionCopy';
import {traceModelCase} from './materialTraceModel';
import {weakToolMaterial as mat} from './materialWeakTools';
import {faceIdentityRecipe} from './materialFaceIdentity';
import {editMaterialFaces} from '../../src/core/materialFaceEdit';
export function locationCopyRecipe(doc:Doc,kind:MaterialConstructionCopyIntent['transform']['kind']='translate',x=150):MaterialConstructionCopyIntent{return {kind:'material-construction-copy',segmentIds:mat(doc).components[0].edges.map(e=>mat(doc).edgeSegmentIds[e]),transform:kind==='translate'?{kind,from:[0,0],to:[x,20]}:kind==='reflect'?{kind,a:[x,0],b:[x,100]}:{kind,a:[0,0],b:[100,0],c:[x,20],d:[x,120]}};}
export function locationCopyCase(name:string){const source=traceModelCase('single');if(name==='source')return source;const copied=constructMaterialCopy(source,{...locationCopyRecipe(source,name==='similarity'?'similarity':name==='reflect'?'reflect':'translate'),parametric:true}).doc;if(['translate','similarity','reflect'].includes(name))return copied;const m=mat(copied);if(name==='two')return editMaterialFaces(copied,{...faceIdentityRecipe(copied,m.components[1].faces[0]),parametric:true}).doc;throw Error(name);}
