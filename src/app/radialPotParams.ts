/** Editable Origamica MakeRadialPot section 43 boundary and gore options. */
export type RadialPotParams={
  family:'radial-pot';
  crossSection:[number,number][];
  sectors:number;
  asymmetry:number;
  gapHalfAngleDeg:number;
  typeMinimumAngleDeg:number;
  flatFlangeInset?:number;
  border:'planar'|'polygon'|'circular';
  arcMaximumAngleDeg?:number;
  arcDivisions?:number;
  arcMethod?:'inscribed'|'circumscribed';
  arcDirection?:'CCW';
};

export const radialPotPreset=():RadialPotParams=>({
  family:'radial-pot',
  crossSection:[[0,0],[1,1],[1,2],[1,3],[2,4]],
  sectors:5,
  asymmetry:0,
  gapHalfAngleDeg:3,
  typeMinimumAngleDeg:10,
  border:'planar',
});

export function readRadialPotParams(value:unknown):RadialPotParams|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const raw=value as Record<string,unknown>;
  if(raw.family!=='radial-pot'||Object.keys(raw).some(key=>!['family','crossSection','sectors','asymmetry','gapHalfAngleDeg','typeMinimumAngleDeg','border','arcMaximumAngleDeg','arcDivisions','arcMethod','arcDirection','flatFlangeInset'].includes(key)))return null;
  const points=raw.crossSection??radialPotPreset().crossSection;
  if(!Array.isArray(points)||points.length<3||points.length>24||points.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>20)))return null;
  const section=points as [number,number][];
  const origin=section[0],shifted=section.map(([x,z])=>[x-origin[0],z-origin[1]] as [number,number]);
  if(shifted.some(p=>p[0]<-1e-10)||shifted[1][0]<=1e-8||shifted.some((p,i)=>i>0&&Math.hypot(p[0]-shifted[i-1][0],p[1]-shifted[i-1][1])<1e-8))return null;
  const heights=shifted.slice(1).map((p,i)=>p[1]-shifted[i][1]);
  const nonzero=Math.abs(heights[0])<1e-9?heights.slice(1):heights;
  if(!nonzero.length||nonzero.some(h=>Math.abs(h)<1e-9)||nonzero.some(h=>Math.sign(h)!==Math.sign(nonzero[0])))return null;
  const sectors=raw.sectors??5,asymmetry=raw.asymmetry??0,gapHalfAngleDeg=raw.gapHalfAngleDeg??0,typeMinimumAngleDeg=raw.typeMinimumAngleDeg??0;
  const border=raw.border??'planar';
  const flatFlangeInset=raw.flatFlangeInset??0;
  if(!Number.isInteger(sectors)||(sectors as number)<3||(sectors as number)>16||5*(sectors as number)*(section.length-1)>600||
      typeof asymmetry!=='number'||!Number.isFinite(asymmetry)||asymmetry<-1||asymmetry>1||
      typeof gapHalfAngleDeg!=='number'||!Number.isFinite(gapHalfAngleDeg)||gapHalfAngleDeg<0||gapHalfAngleDeg>=90/(sectors as number)||
      typeof typeMinimumAngleDeg!=='number'||!Number.isFinite(typeMinimumAngleDeg)||typeMinimumAngleDeg<0||typeMinimumAngleDeg>45||
      !['planar','polygon','circular'].includes(String(border))||
      typeof flatFlangeInset!=='number'||!Number.isFinite(flatFlangeInset)||flatFlangeInset<0||flatFlangeInset>.5||
      flatFlangeInset>0&&Math.abs(asymmetry)!==1)return null;
  const circular=border==='circular';
  if(!circular&&['arcMaximumAngleDeg','arcDivisions','arcMethod','arcDirection'].some(key=>key in raw))return null;
  const arcMaximumAngleDeg=raw.arcMaximumAngleDeg??5,arcDivisions=raw.arcDivisions??1,arcMethod=raw.arcMethod??'inscribed';
  if(circular&&(typeof arcMaximumAngleDeg!=='number'||!Number.isFinite(arcMaximumAngleDeg)||arcMaximumAngleDeg<1||arcMaximumAngleDeg>30||
      !Number.isInteger(arcDivisions)||(arcDivisions as number)<1||(arcDivisions as number)>32||
      !['inscribed','circumscribed'].includes(String(arcMethod))||
      (raw.arcDirection??'CCW')!=='CCW'))return null;
  return {family:'radial-pot',crossSection:section.map(p=>[...p] as [number,number]),sectors:sectors as number,asymmetry,gapHalfAngleDeg,typeMinimumAngleDeg,border:border as RadialPotParams['border'],
    ...(flatFlangeInset>0?{flatFlangeInset}:{}),
    ...(circular?{arcMaximumAngleDeg:arcMaximumAngleDeg as number,arcDivisions:arcDivisions as number,arcMethod:arcMethod as 'inscribed'|'circumscribed'}:{})};
}
