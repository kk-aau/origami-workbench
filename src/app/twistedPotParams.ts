/** The verified faceted subset of Origamica MakeTwistedPot. */
export type TwistedPotParams={
  family:'twisted-pot';
  crossSection:[number,number][];
  sectors:number;
  asymmetry:-1|1;
  goreTwist:-1|1;
  flangeRotationDeg:number;
  border:'planar'|'trimmed';
  flatFlanges:'faceted';
  flangeInset:number;
  typeMinimumAngleDeg:number;
};

export const twistedPotPreset=():TwistedPotParams=>({
  family:'twisted-pot',
  crossSection:[[0,0],[1,0],[1,.5],[1.5,1],[1,1.5],[1,2]],
  sectors:6,asymmetry:1,goreTwist:1,flangeRotationDeg:0,
  border:'planar',flatFlanges:'faceted',flangeInset:0,typeMinimumAngleDeg:.5,
});

/** Exact fixed faceted inputs of the saved In[3521] and In[3523] calls. */
export function twistedPotSavedPreset(cell:3521|3523):TwistedPotParams{
  if(cell===3521)return {...twistedPotPreset(),sectors:12,flangeRotationDeg:25,flangeInset:.05};
  return {...twistedPotPreset(),crossSection:[
    [0,0],[.201973165620801,0],
    [.24551521390921868,.04929828350861052],
    [.29103491611100674,.09719117040644294],
    [.3388464527060197,.14962845353074342],
    [.3844362844792038,.20295497962034656],
    [.42712836236230056,.2575101758008096],
    [.4701991399309364,.31986097513766437],
    [.5030814933671452,.37584120420889644],
  ],sectors:6,flangeRotationDeg:-8,flangeInset:.05};
}

/** In[3522] has the same source profile as In[3521], with Smooth/Trimmed display. */
export function twistedPotSmoothSavedPreset():TwistedPotParams{
  return {...twistedPotSavedPreset(3521),border:'trimmed'};
}

const finite=(value:unknown,low:number,high:number):value is number=>
  typeof value==='number'&&Number.isFinite(value)&&value>=low&&value<=high;

export function readTwistedPotParams(value:unknown):TwistedPotParams|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const raw=value as Record<string,unknown>;
  if(raw.family!=='twisted-pot'||Object.keys(raw).some(key=>
    !['family','crossSection','sectors','asymmetry','goreTwist','flangeRotationDeg',
      'border','flatFlanges','flangeInset','typeMinimumAngleDeg'].includes(key)))return null;
  const points=raw.crossSection??twistedPotPreset().crossSection;
  if(!Array.isArray(points)||points.length<4||points.length>12||points.some(point=>
    !Array.isArray(point)||point.length!==2||point.some(v=>!finite(v,-20,20))))return null;
  const origin=points[0] as [number,number];
  const section=(points as [number,number][]).map(([x,z])=>[x-origin[0],z-origin[1]] as [number,number]);
  if(Math.abs(section[1][1])>1e-10||section[1][0]<=1e-7||
    section.slice(1).some(([x])=>x<=1e-7))return null;
  const heights=section.slice(2).map(([,z],i)=>z-section[i+1][1]);
  if(heights.some(h=>Math.abs(h)<1e-8)||
    heights.some(h=>Math.sign(h)!==Math.sign(heights[0])))return null;
  const sectors=raw.sectors??6,asymmetry=raw.asymmetry??1,goreTwist=raw.goreTwist??1,
    flangeRotationDeg=raw.flangeRotationDeg??0,border=raw.border??'planar',
    flatFlanges=raw.flatFlanges??'faceted',flangeInset=raw.flangeInset??0,
    typeMinimumAngleDeg=raw.typeMinimumAngleDeg??.5;
  if(typeof sectors!=='number'||!Number.isInteger(sectors)||sectors<3||sectors>16||
    sectors*(3*section.length-5)>500||
    (asymmetry!==-1&&asymmetry!==1)||(goreTwist!==-1&&goreTwist!==1)||
    !finite(flangeRotationDeg,-45,45)||!finite(typeMinimumAngleDeg,0,45)||
    flatFlanges!=='faceted'||!finite(flangeInset,0,.5)||
    border!=='planar'&&border!=='trimmed')return null;
  return {family:'twisted-pot',crossSection:section,sectors,
    asymmetry:asymmetry as -1|1,goreTwist:goreTwist as -1|1,
    flangeRotationDeg,border,flatFlanges:'faceted',flangeInset,
    typeMinimumAngleDeg};
}
