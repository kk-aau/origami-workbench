import type {TessParams} from './tessellation';
/** Finite original pfn/rfn Function input, not an original saved Log example. */
export function ringLogPreset():Extract<TessParams,{family:'ring'}>{
 const pair:[string,string]=['(1+.03 Log[2+Sin[phi]]) Cos[phi]','(1+.03 Log[2+Sin[phi]]) Sin[phi]'];
 return {family:'ring',ringMode:'origamica',sides:12,rings:2,growth:1.8,scale:.3,angle:35,offsetAngle:0,outerRadii:[1,1.8,2.6],creaseRadii:[1.35,2.15],outerVectorTemplate:pair,creaseVectorTemplate:[...pair]};
}
