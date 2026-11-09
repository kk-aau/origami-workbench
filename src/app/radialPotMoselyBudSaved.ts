import {readRadialPotParams,type RadialPotParams} from './radialPotParams';

/** Real branch of notebook In[3456], after r=sin²u removes elliptic endpoint singularities. */
const steps=512;
const integrand=(u:number)=>{
  const sine=Math.sin(2*u);
  return Math.SQRT2*sine*sine/Math.sqrt(1+sine*sine);
};
const integral=(end:number)=>{
  const step=end/steps;
  let sum=integrand(0)+integrand(end);
  for(let i=1;i<steps;i++)sum+=(i%2?4:2)*integrand(i*step);
  return sum*step/3;
};
const fullHeight=integral(Math.PI/2);

export function moselyBudCrossSectionPoint(r:number):[number,number]{
  if(!Number.isFinite(r)||r<0||r>1)throw Error('MoselyBudCrossSectionPt 的实数范围为 0≤r≤1。');
  const x=Math.max(0,(Math.sqrt(1+4*r-4*r*r)-1)/2);
  const z=r>.5?fullHeight-integral(Math.asin(Math.sqrt(1-r))):integral(Math.asin(Math.sqrt(r)));
  return [x,z];
}

const savedSection=Array.from({length:21},(_,i)=>{
  const [x,z]=moselyBudCrossSectionPoint(i/20);
  return [x,z===0?0:-z] as [number,number];
});

/** Both non-deprecated In[3481]/In[3482] use (1,-1)×Table[Re[N[...]],r=0..1,1/20]. */
export const moselyBudSavedSection=():[number,number][]=>(savedSection.map(point=>[...point]));

export function moselyBudSavedParams(cell:3481|3482):RadialPotParams{
  const candidate={family:'radial-pot',crossSection:moselyBudSavedSection(),
    sectors:4,asymmetry:cell===3481?0:.3333,gapHalfAngleDeg:0,
    typeMinimumAngleDeg:30,border:'planar'};
  const params=readRadialPotParams(candidate);
  if(!params)throw Error(`原版 In[${cell}] Mosely Bud 保存输入无效。`);
  return params;
}

export function matchMoselyBudSaved(params:RadialPotParams):3481|3482|null{
  for(const cell of [3481,3482] as const)
    if(JSON.stringify(params)===JSON.stringify(moselyBudSavedParams(cell)))return cell;
  return null;
}
