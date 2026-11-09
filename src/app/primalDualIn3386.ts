import {readTessParams,tessPreset,type TessParams} from './tessellation';

/** Origamica section 40, saved In[3386], lines 248810–248880. */
export function primalDualIn3386Params():Extract<TessParams,{family:'primal-dual'}>{
  const mother={...tessPreset('ring'),sides:11,rings:2,
    radii:[1,2,4],includeCenter:false};
  const params=readTessParams({...tessPreset('primal-dual'),
    motherParams:mother,rings:0,paper:undefined,
    parameterization:'gamma-alpha',gamma:2,pleatAngle:20,
    twistDirection:'cw',postRotation:'none',faceupFace:1});
  if(!params||params.family!=='primal-dual')
    throw Error('In[3386] 保存例参数无效。');
  return params;
}
