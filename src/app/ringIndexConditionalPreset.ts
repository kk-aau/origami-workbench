import {readTessParams,type TessParams} from './tessellation';

/** A finite original pfn[i]/rfn[i] input; every generated ring keeps its certificates. */
export function ringIndexConditionalPreset():Extract<TessParams,{family:'ring'}>{
  const next=readTessParams({family:'ring',ringMode:'origamica',sides:12,rings:2,
    growth:1.8,scale:.3,angle:35,offsetAngle:0,
    outerRadii:[1,1.8,2.6],creaseRadii:[1.35,2.15],
    vectorFunctionDefinitions:['Shape[t_,c_,k_]:=If[k<1,c,(1+.02 k Cos[3t])c]'],
    outerVectorTemplate:['Shape[phi,Cos[phi],i]','Shape[phi,Sin[phi],i]'],
    creaseVectorTemplate:['Shape[phi,Cos[phi],i]','Shape[phi,Sin[phi],i]']});
  if(!next||next.family!=='ring')throw Error('环索引条件预设无效。');
  return next;
}
