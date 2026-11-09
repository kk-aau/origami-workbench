import {readTessParams,tessPreset,type TessParams} from './tessellation';

/** Origamica In[3354]: the 2×2 directed primal–dual example. */
export function primalDualIn3354Params():Extract<TessParams,{family:'primal-dual'}>{
  const mother={...tessPreset('custom'),
    vertices:Array.from({length:9},(_,i)=>[2*(i%3),2*Math.floor(i/3)]),
    faces:[[0,1,4,3],[1,2,5,4],[3,4,7,6],[4,5,8,7]],
    repeatX:1,repeatY:1};
  const params=readTessParams({...tessPreset('primal-dual'),
    motherParams:mother,rings:0,paper:undefined,
    parameterization:'gamma-alpha',gamma:2,pleatAngle:20,
    twistDirection:'ccw',postRotation:'primal',faceupFace:3});
  if(!params||params.family!=='primal-dual')throw Error('In[3354] 保存例参数无效。');
  return params;
}
