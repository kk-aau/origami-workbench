import {readRectangularPotParams,type RectangularPotParams} from './rectangularPotParams';

export type RectangularPotSavedCell=3489|3490|3491|3492|3493|3494|3503|3504|3505|3506;

/** Literal numerical sampling in Origamica In[3504]/In[3505]: θ=0…π, Δθ=π/20. */
export function rectangularPotSmoothSection():[number,number][]{
  return Array.from({length:21},(_,i)=>{
    const angle=Math.PI*i/20;
    return [.5*Math.sin(angle),Math.cos(angle)-1];
  });
}

const fiveUpward=():[number,number][]=>Array.from({length:5},(_,i)=>{
  const theta=Math.PI*i/6;
  return [.5*Math.sin(theta),1-Math.cos(theta)];
});
const fiveDownward=():[number,number][]=>Array.from({length:5},(_,i)=>{
  const theta=Math.PI*i/4;
  return [.5*Math.sin(theta),Math.cos(theta)-1];
});
const defaultProfile=():[number,number][]=>[[0,0],[1,1],[1,2],[1,3],[2,4]];
const shiftedProfile=():[number,number][]=>[[.3,0],[1,1],[1,2],[1,3],[2,4]];

/** Exact saved input, including PotPanels=1 for wedge examples. */
export function rectangularPotSavedParams(cell:RectangularPotSavedCell):RectangularPotParams{
  const base={family:'rectangular-pot',sectors:8,panels:1,asymmetry:0,
    gapHalfAngleDeg:0,flangeExcess:0,typeMinimumAngleDeg:10};
  const candidate=cell===3503?{...base,crossSection:defaultProfile(),sectors:5,panels:5}
    :cell===3489?{...base,crossSection:shiftedProfile(),flangeExcess:.1}
    :cell===3490?{...base,crossSection:shiftedProfile(),asymmetry:1,
      flangeExcess:.1,flatFlangeInset:.05}
    :cell===3491?{...base,crossSection:defaultProfile(),gapHalfAngleDeg:3,flangeExcess:.3}
    :cell===3492?{...base,crossSection:[[0,-1],[1,-1],[1,-2],[1,-3],[2,-4]],
      asymmetry:-1}
    :cell===3493?{...base,crossSection:[[0,0],[1,1],[1,2],[2,3]],asymmetry:.5}
    :cell===3494?{...base,crossSection:fiveDownward(),sectors:5,
      gapHalfAngleDeg:4,flangeExcess:.5}
    :cell===3504||cell===3505?{...base,crossSection:rectangularPotSmoothSection(),
      sectors:4,panels:4,asymmetry:cell===3504?0:.3333,
      flangeExcess:.5,typeMinimumAngleDeg:30}
    :{...base,crossSection:fiveUpward(),panels:7,asymmetry:-1,
      typeMinimumAngleDeg:0,flatFlangeInset:.1};
  const value=readRectangularPotParams(candidate);
  if(!value)throw Error(`原版 In[${cell}] 矩形壶体保存输入无效。`);
  return value;
}

export function rectangularPotSmoothSavedParams(cell:3504|3505):RectangularPotParams{
  return rectangularPotSavedParams(cell);
}

export function matchRectangularPotSaved(params:RectangularPotParams):RectangularPotSavedCell|null{
  for(const cell of [3489,3490,3491,3492,3493,3494,3503,3504,3505,3506] as const)
    if(JSON.stringify(params)===JSON.stringify(rectangularPotSavedParams(cell)))return cell;
  return null;
}

export function matchRectangularPotSmoothSaved(params:RectangularPotParams):3504|3505|null{
  const cell=matchRectangularPotSaved(params);
  if(cell===3504||cell===3505)return cell;
  return null;
}
