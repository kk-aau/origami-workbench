import {readRadialPotParams,type RadialPotParams} from './radialPotParams';
import {moselyBudSavedParams} from './radialPotMoselyBudSaved';

export type RadialPotSavedCell=3481|3482|3483;

/** In[3483]: θ=0..2π/3 in π/6 steps, z=1-cosθ. */
export const upwardSineFiveSection=():[number,number][]=>(
  Array.from({length:5},(_,i)=>{
    const theta=Math.PI*i/6;
    return [.5*Math.sin(theta),1-Math.cos(theta)];
  })
);

export function radialPotSavedParams(cell:RadialPotSavedCell):RadialPotParams{
  if(cell===3481||cell===3482)return moselyBudSavedParams(cell);
  const result=readRadialPotParams({family:'radial-pot',crossSection:upwardSineFiveSection(),
    sectors:5,asymmetry:-1,gapHalfAngleDeg:0,typeMinimumAngleDeg:0,
    border:'planar',flatFlangeInset:.1});
  if(!result)throw Error('原版 In[3483] 上向壶体保存输入无效。');
  return result;
}

export function matchRadialPotSaved(params:RadialPotParams):RadialPotSavedCell|null{
  for(const cell of [3481,3482,3483] as const)
    if(JSON.stringify(params)===JSON.stringify(radialPotSavedParams(cell)))return cell;
  return null;
}
