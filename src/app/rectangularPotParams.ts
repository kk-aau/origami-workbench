/** Origamica MakeRectangularPot: a selectable run of rotated rectangular gores. */
export type RectangularPotParams={family:'rectangular-pot';crossSection:[number,number][];
  sectors:number;panels:number;asymmetry:number;gapHalfAngleDeg:number;
  flangeExcess:number;typeMinimumAngleDeg:number;flatFlangeInset?:number};

export const rectangularPotPreset=():RectangularPotParams=>({
  family:'rectangular-pot',crossSection:[[0,0],[1,1],[1,2],[1,3],[2,4]],
  sectors:5,panels:5,asymmetry:0,gapHalfAngleDeg:0,flangeExcess:0,
  typeMinimumAngleDeg:0,
});

const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
/** The original strip's face budget applies independently of its winding count. */
export const rectangularPotPanelLimit=(profilePoints:number):number=>
  Math.floor(600/(5*(profilePoints-1)));
export function readRectangularPotParams(value:unknown):RectangularPotParams|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const raw=value as Record<string,unknown>;
  if(raw.family!=='rectangular-pot'||Object.keys(raw).some(key=>
    !['family','crossSection','sectors','panels','asymmetry','gapHalfAngleDeg',
      'flangeExcess','typeMinimumAngleDeg','flatFlangeInset'].includes(key)))return null;
  const points=raw.crossSection??rectangularPotPreset().crossSection;
  if(!Array.isArray(points)||points.length<2||points.length>24||points.some(point=>
    !Array.isArray(point)||point.length!==2||point.some(v=>!finite(v)||Math.abs(v)>20)))return null;
  const section=points as [number,number][];
  if(section.some(([x])=>x< -1e-10)||Math.max(...section.map(([x])=>x))<=1e-8||
    section.slice(1).some((point,i)=>Math.hypot(point[0]-section[i][0],point[1]-section[i][1])<1e-8))return null;
  const heights=section.slice(1).map((point,i)=>point[1]-section[i][1]);
  const nonzero=Math.abs(heights[0])<1e-9?heights.slice(1):heights;
  if(nonzero.some(h=>Math.abs(h)<1e-9)||nonzero.some(h=>Math.sign(h)!==Math.sign(nonzero[0]))||
    section.length===2&&Math.abs(heights[0])<1e-9)return null;
  const sectors=raw.sectors??5,panels=raw.panels??sectors,asymmetry=raw.asymmetry??0,
    gapHalfAngleDeg=raw.gapHalfAngleDeg??0,flangeExcess=raw.flangeExcess??0,
    typeMinimumAngleDeg=raw.typeMinimumAngleDeg??0,flatFlangeInset=raw.flatFlangeInset??0;
  if(typeof sectors!=='number'||!Number.isInteger(sectors)||sectors<3||sectors>16||
    typeof panels!=='number'||!Number.isInteger(panels)||
    panels<1||panels>rectangularPotPanelLimit(section.length)||
    !finite(asymmetry)||asymmetry< -1||asymmetry>1||
    !finite(gapHalfAngleDeg)||gapHalfAngleDeg<0||gapHalfAngleDeg>=90/sectors||
    !finite(flangeExcess)||flangeExcess<0||flangeExcess>2||
    !finite(typeMinimumAngleDeg)||typeMinimumAngleDeg<0||typeMinimumAngleDeg>45||
    !finite(flatFlangeInset)||flatFlangeInset<0||flatFlangeInset>.5||
    flatFlangeInset>0&&Math.abs(asymmetry)!==1)return null;
  return {family:'rectangular-pot',crossSection:section.map(point=>[...point]),
    sectors,panels,asymmetry,gapHalfAngleDeg,flangeExcess,typeMinimumAngleDeg,
    ...(flatFlangeInset>0?{flatFlangeInset}:{})};
}
