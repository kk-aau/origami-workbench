import {api} from './api';
import {validateNDSolveStepOptions,validateNDSolveStepStamp,type NDSolveStepOptions,type NDSolveStepStamp,type NDSolveDefinitionCell} from './curvedNDSolveOptions';
import {compileGenericExpression,GenericTaylor} from './curvedGenericLinked';

export type SystemHelpersMode='curve2'|'curve3'|'darboux3'|'ruled-normal'|'recover2'|'recover3'|'recover-darboux';
export type GenericSystemHelpersQuery={family:'system-helpers-generic-native';mode:SystemHelpersMode;parameterStart:number;parameterEnd:number;segments:number;
 curve?:string[];normal?:string[];baseCurve?:string[];director?:string[];coefficients?:string[];initialParameter?:number;initialPoint?:number[];initialTangent?:number[];
 initialBinormal?:number[];initialLeft?:number[];initialNormal?:number[];sigma?:number;transverseStart?:number;transverseEnd?:number;rulingSegments?:number;ndsolveOptions?:NDSolveStepOptions};
const common={family:'system-helpers-generic-native' as const,parameterStart:0,parameterEnd:1,segments:32};
export const SYSTEM_HELPERS_NATIVE_PRESETS:Record<SystemHelpersMode,GenericSystemHelpersQuery>={
 curve2:{...common,mode:'curve2',curve:['s','s**2/4']},curve3:{...common,mode:'curve3',curve:['sin(s)','s**2/4','1-cos(s)']},
 darboux3:{...common,mode:'darboux3',curve:['sin(s)','s**2/4','1-cos(s)'],normal:['(s*cos(s)-sin(s))/sqrt(5+s**2)','-2/sqrt(5+s**2)','(cos(s)+s*sin(s))/sqrt(5+s**2)']},
 'ruled-normal':{...common,mode:'ruled-normal',baseCurve:['s','.1*s**2','.2*s**3'],director:['s','0','2'],sigma:1,transverseStart:-.2,transverseEnd:.2,rulingSegments:16},
 recover2:{...common,mode:'recover2',coefficients:['1+.1*s','.4+.1*s'],initialParameter:0,initialPoint:[0,0],initialTangent:[1,0]},
 recover3:{...common,mode:'recover3',coefficients:['1+.1*s','.4+.1*s','.2*s'],initialParameter:0,initialPoint:[0,0,0],initialTangent:[1,0,0],initialBinormal:[0,0,1]},
 'recover-darboux':{...common,mode:'recover-darboux',coefficients:['1+.1*s','.4+.1*s','.1*sin(s)','.2*s'],initialParameter:0,initialPoint:[0,0,0],initialTangent:[1,0,0],initialLeft:[0,1,0],initialNormal:[0,0,1]},
};
SYSTEM_HELPERS_NATIVE_PRESETS['ruled-normal'].director=['0','0','1'];
export const SYSTEM_HELPERS_NDSOLVE_PRESETS:Partial<Record<SystemHelpersMode,GenericSystemHelpersQuery>>=Object.fromEntries(
 ['recover2','recover3','recover-darboux'].map(mode=>{const q=JSON.parse(JSON.stringify(SYSTEM_HELPERS_NATIVE_PRESETS[mode as SystemHelpersMode])) as GenericSystemHelpersQuery;
  q.initialParameter=.4;q.initialPoint=mode==='recover2'?[3,4]:[3,4,5];q.initialTangent=mode==='recover2'?[2,0]:[2,0,0];
  if(mode==='recover3')q.initialBinormal=[0,0,3];if(mode==='recover-darboux'){q.initialLeft=[.2,3,0];q.initialNormal=[0,.4,4];}
  q.ndsolveOptions={MaxSteps:128,MaxStepSize:.02};return [mode,q];}));

export const SYSTEM_HELPERS_NATIVE_NAMES:Record<SystemHelpersMode,string>={curve2:'二维曲线系统',curve3:'三维 Frenet 系统',darboux3:'Darboux 系统','ruled-normal':'直纹曲面法向',recover2:'恢复二维曲线',recover3:'恢复三维曲线','recover-darboux':'恢复 Darboux 曲线'};
export const SYSTEM_HELPERS_NATIVE_SOURCE:Record<SystemHelpersMode,{functions:string[];definitionCells:string[];ruleOrder:string[]}>= {
 curve2:{functions:['Curve2DSystem','NCurve2DSystem'],definitionCells:['In[3627]','In[3632]'],ruleOrder:['Curve2D','Speed2D','LeftCurvature2D','Curvature2D','TangentVector2D','LeftNormalVector2D','NormalVector2D']},
 curve3:{functions:['Curve3DSystem','NCurve3DSystem'],definitionCells:['In[3669]','In[3676]'],ruleOrder:['Curve3D','Speed3D','Curvature3D','Torsion3D','TangentVector3D','BinormalVector3D','NormalVector3D']},
 darboux3:{functions:['Darboux3DSystem','NDarboux3DSystem'],definitionCells:['In[3792]','In[3799]'],ruleOrder:['Speed3D','GeodesicCurvature3D','NormalCurvature3D','GeodesicTorsion3D','TangentVector3D','TangentNormalVector3D','SurfaceNormalVector3D']},
 'ruled-normal':{functions:['RuledSurfaceNormal'],definitionCells:['In[3817]'],ruleOrder:['SurfaceNormalVector3D']},
 recover2:{functions:['RecoverCurve2DSystem','NRecoverCurve2DSystem'],definitionCells:['In[3637]','In[3640]'],ruleOrder:['Curve2D','Speed2D','LeftCurvature2D','Curvature2D','TangentVector2D','LeftNormalVector2D','NormalVector2D']},
 recover3:{functions:['RecoverCurve3DSystem','NRecoverCurve3DSystem'],definitionCells:['In[3680]','In[3685]'],ruleOrder:['Curve3D','Speed3D','Curvature3D','Torsion3D','TangentVector3D','BinormalVector3D','NormalVector3D']},
 'recover-darboux':{functions:['RecoverDarboux3D','NRecoverDarboux3D'],definitionCells:['In[3811]','In[3815]'],ruleOrder:['C','T','L','U']},
};
type Rule=number|number[]|null;
export type GenericSystemHelpersRow={s:number;transverseParameter:number|null;curve:number[];normalizedCurve:number[];curveDerivative:number[];normalizedCurveDerivative:number[];
 rules:Record<string,Rule>;derivatives:Record<string,number[]|null>;coefficients:Record<string,number|null>;frame:number[][];frameGramResidual:number|null;systemDefined:boolean;
 undefinedReasons:string[];actualCurveSpeed:number;director:number[]|null;normalizedDirector:number[]|null};
export type GenericSystemHelpersResult={family:'origamica-generic-system-helpers';query:GenericSystemHelpersQuery;source:{functions:string[];definitionCells:string[];selectedFunction:string;
 outputKind:string;ruleOrder:string[];method:string;rawNormalPreserved:boolean;rawInitialVectorsPreserved:boolean;normalizeRealConvention:string;darbouxCoefficientConvention:string;
 symbolicObjectsReproduced:false;interpolationReproduced:false;wolframOptionsReproduced:false};normalization:{origin:number[];scale:number};
 initial:null|{parameter:number;point:number[];frame:number[][];frameGramResidual:number;frameCompatibilityTolerance:number;frameCompatible:boolean};
 domain:{certified:boolean;evaluations:number;verifiedCells:number;cells:{start:number;end:number;auxiliaryNormSquaredBounds:number[]|null;coefficientBounds:number[][];systemDefined:boolean}[];
 unresolved:number[][];roundingModel:string;zeroFrameIdentityProved:boolean;reason:string|null};diagnostics:{validationNodes:129;validationUnionNodes:number;definedRows:number;
 undefinedGridNormals:number;validationUndefinedNormals:number;maximumFrameGramResidual:number|null;rawNormalIdentityAnalytic:boolean;
 integration:{method:string;rtol:number|null;atol:number|null;forwardEvaluations:number;backwardEvaluations:number;stepOptions?:NDSolveStepStamp}};
 certification:{sourceDefinitionCertified:boolean;finiteSystemFullyDefined:boolean;formalFrameOrthonormalCertified:boolean;integrationErrorIntervalCertified:false;
 globalInjectivityChecked:false;selfCollisionChecked:false;adoptableCreasePattern:false;exactStraightCreaseFOLD:false};sample:{rows:GenericSystemHelpersRow[]};
 grid:{s:number;points:number[][];normalizedPoints:number[][];normals:(number[]|null)[];areaSquared:number[]}[]};
const record=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x),finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x),
 keys=(x:Record<string,unknown>,a:string[])=>Object.keys(x).length===a.length&&a.every(k=>Object.hasOwn(x,k)),vector=(x:unknown,n:number):x is number[]=>Array.isArray(x)&&x.length===n&&x.every(finite),
 dot=(a:number[],b:number[])=>a.reduce((s,x,i)=>s+x*b[i],0),add=(a:number[],b:number[],w=1)=>a.map((x,i)=>x+w*b[i]),mul=(a:number[],w:number)=>a.map(x=>x*w),
 cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],val=(a:GenericTaylor[])=>a.map(x=>x.c[0]),prime=(a:GenericTaylor[])=>a.map(x=>x.c[1]),
 tdot=(a:GenericTaylor[],b:GenericTaylor[])=>a.reduce((s,x,i)=>s.add(x.mul(b[i])),a[0].constant(0)),tmul=(a:GenericTaylor[],w:number|GenericTaylor)=>a.map(x=>x.mul(w)),
 tcross=(a:GenericTaylor[],b:GenericTaylor[])=>[a[1].mul(b[2]).sub(a[2].mul(b[1])),a[2].mul(b[0]).sub(a[0].mul(b[2])),a[0].mul(b[1]).sub(a[1].mul(b[0]))];
const near=(x:unknown,y:number,natural=Math.abs(y),tol=3e-8)=>finite(x)&&Math.abs(x-y)<=tol*Math.max(natural,Number.MIN_VALUE)+Number.MIN_VALUE,
 nearV=(x:unknown,y:number[],natural=Math.hypot(...y),tol=3e-8)=>vector(x,y.length)&&y.every((v,i)=>near(x[i],v,natural,tol)),
 gram=(frame:number[][])=>Math.max(...frame.flatMap((a,i)=>frame.map((b,j)=>Math.abs(dot(a,b)-(i===j?1:0)))));
const sum=(a:number[])=>{const p:number[]=[];for(let x of a){let i=0;for(let y of p){if(Math.abs(x)<Math.abs(y))[x,y]=[y,x];const hi=x+y,lo=y-(hi-x);if(lo)p[i++]=lo;x=hi;}p.length=i;p.push(x);}return p.reduceRight((s,x)=>s+x,0);};
function fail():never{throw Error('原公共系统的源、raw 初值、规则顺序、完整域或独立恢复回读不一致。');}
export function validateGenericSystemHelpersQuery(raw:unknown):GenericSystemHelpersQuery{
 if(!record(raw)||!Object.hasOwn(SYSTEM_HELPERS_NATIVE_PRESETS,raw.mode)||!keys(raw,[...Object.keys(SYSTEM_HELPERS_NATIVE_PRESETS[raw.mode as SystemHelpersMode]),...(Object.hasOwn(raw,'ndsolveOptions')&&String(raw.mode).startsWith('recover')?['ndsolveOptions']:[])])||raw.family!=='system-helpers-generic-native')throw Error('需当前原公共系统全部参数；不接受其它模式字段。');
 const n=['curve2','recover2'].includes(raw.mode)?2:3;
 for(const key of ['curve','normal','baseCurve','director','coefficients'])if(key in raw){const d=key==='coefficients'?{recover2:2,recover3:3,'recover-darboux':4}[raw.mode as 'recover2'|'recover3'|'recover-darboux']:key==='curve'?n:3;
  if(!Array.isArray(raw[key])||raw[key].length!==d)throw Error('原源或原系数维数不匹配。');raw[key].forEach((s:string)=>compileGenericExpression(s,'s'));}
 for(const key of ['parameterStart','parameterEnd','initialParameter','transverseStart','transverseEnd'])if(key in raw&&!finite(raw[key]))throw Error('原参数必须有限。');
 if(raw.parameterStart< -10||raw.parameterEnd>10||raw.parameterEnd-raw.parameterStart<.01||raw.parameterEnd-raw.parameterStart>12)throw Error('s 域须在±10内，跨度0.01–12。');
 if('initialParameter' in raw&&(raw.initialParameter<raw.parameterStart||raw.initialParameter>raw.parameterEnd))throw Error('ui 必须在完整 s 域内。');
 if('transverseStart' in raw&&(raw.transverseStart< -1e6||raw.transverseEnd>1e6||raw.transverseStart>=raw.transverseEnd))throw Error('w 域须在±10⁶内递增。');
 for(const [key,lo,hi] of [['segments',8,128],['rulingSegments',2,64]] as const)if(key in raw&&(!Number.isInteger(raw[key])||raw[key]<lo||raw[key]>hi))throw Error('显示密度超出预算。');
 if('sigma' in raw&&raw.sigma!==1&&raw.sigma!==-1)throw Error('σ 必须为±1。');
 for(const key of ['initialPoint','initialTangent','initialBinormal','initialLeft','initialNormal'])if(key in raw&&(!vector(raw[key],n)||raw[key].some((x:number)=>Math.abs(x)>1e12)))throw Error('原初向量须为±10¹²内有限坐标。');
 const q=Object.fromEntries(Object.keys(SYSTEM_HELPERS_NATIVE_PRESETS[raw.mode as SystemHelpersMode]).map(k=>[k,JSON.parse(JSON.stringify(raw[k]))])) as GenericSystemHelpersQuery;
 if(Object.hasOwn(raw,'ndsolveOptions'))q.ndsolveOptions=validateNDSolveStepOptions(raw.ndsolveOptions,q.parameterEnd-q.parameterStart);
 return q;
}

/** Source jets are replayed with a separate scalar parser, recovery with DP54 rather than backend DOP853. */
export function makeGenericSystemHelpersReference(input:unknown,nodes:number[]){
 const q=validateGenericSystemHelpersQuery(input),mode=q.mode,recover=mode.startsWith('recover'),n=['curve2','recover2'].includes(mode)?2:3,
  groups=Object.fromEntries(['curve','normal','baseCurve','director','coefficients'].filter(k=>k in q).map(k=>[k,(q[k as keyof typeof q] as string[]).map(x=>compileGenericExpression(x,'s'))])),
  ui=q.initialParameter??q.parameterStart,baseKey=mode==='ruled-normal'?'baseCurve':'curve',t=new GenericTaylor([ui,1,0,0,0]);
 let origin:number[],scale:number,initialFrame:number[][]=[],parts:ReturnType<ReturnType<typeof compileGenericExpression>['parts']>[]=[];
 if(recover){origin=q.initialPoint!.slice();const T=q.initialTangent!.slice();initialFrame=n===2?[T,[-T[1],T[0]]]:mode==='recover3'?[T,cross(q.initialBinormal!,T),q.initialBinormal!.slice()]:[T,q.initialLeft!.slice(),q.initialNormal!.slice()];
  scale=Math.max(...Array.from({length:9},(_,i)=>Math.abs(groups.coefficients[0](new GenericTaylor([q.parameterStart+(q.parameterEnd-q.parameterStart)*i/8])).c[0])))*(q.parameterEnd-q.parameterStart)*Math.max(...initialFrame.map(a=>Math.hypot(...a)))||1;
 }else{parts=groups[baseKey].map(f=>f.parts(t));origin=parts.map(p=>sum(p.offsets)+p.dynamic.c[0]);const sizes:number[]=[];
  for(let i=0;i<9;i++){const s=q.parameterStart+(q.parameterEnd-q.parameterStart)*i/8,a=new GenericTaylor([s,1]),p=groups[baseKey].map(f=>f.parts(a));
   sizes.push(Math.hypot(...p.map((x,j)=>x.dynamic.c[0]-parts[j].dynamic.c[0]+sum([...x.offsets,...parts[j].offsets.map(y=>-y)]))),Math.hypot(...p.map(x=>x.dynamic.c[1]))*(q.parameterEnd-q.parameterStart));
   if(mode==='ruled-normal')sizes.push(Math.hypot(...groups.director.map(f=>f(a).c[0]))*Math.max(Math.abs(q.transverseStart!),Math.abs(q.transverseEnd!)));}scale=Math.max(...sizes)||1;}
 if(!finite(scale)||scale<=0||origin.some(x=>!finite(x)))fail();
 const source=(s:number)=>{const a=new GenericTaylor([s,1,0,0,0]),r:Record<string,GenericTaylor[]>={};for(const [key,fs] of Object.entries(groups)){
  r[key===baseKey?'c':key]=fs.map((f,i)=>{if(key!==baseKey)return f(a).div(key==='director'?scale:1);const p=f.parts(a);return p.dynamic.sub(parts[i].dynamic.c[0]).add(sum([...p.offsets,...parts[i].offsets.map(x=>-x)])).div(scale);});}
  if(!recover)r.cp=r.c.map(x=>x.derivative());return r;};
 const coefficient=(s:number)=>groups.coefficients.map(f=>f(new GenericTaylor([s])).c[0]);
 const derivative=(s:number,y:number[])=>{const raw=coefficient(s),v=raw[0]/scale,g=mode==='recover-darboux'?raw[1]:raw[0]*raw[1],h=mode==='recover-darboux'?raw[2]:0,z=mode==='recover-darboux'?raw[3]:n===3?raw[0]*raw[2]:0,T=y.slice(n,2*n),L=y.slice(2*n,3*n);
  return n===2?[...mul(T,v),...mul(L,g),...mul(T,-g)]:[...mul(T,v),...add(mul(L,g),y.slice(3*n,4*n),h),...add(mul(T,-g),y.slice(3*n,4*n),z),...add(mul(T,-h),L,-z)];};
 const states=new Map<number,number[]>(),initial=[...Array(n).fill(0),...initialFrame.flat()];
 if(recover){states.set(ui,initial.slice());const c=[0,1/5,3/10,4/5,8/9,1,1],a=[[],[1/5],[3/40,9/40],[44/45,-56/15,32/9],[19372/6561,-25360/2187,64448/6561,-212/729],[9017/3168,-355/33,46732/5247,49/176,-5103/18656],[35/384,0,500/1113,125/192,-2187/6784,11/84]],low=[5179/57600,0,7571/16695,393/640,-92097/339200,187/2100,1/40];let budget=0;
  for(const direction of [-1,1]){let s=ui,y=initial.slice(),h=direction*(q.parameterEnd-q.parameterStart)/32;
   for(const end of [...new Set(nodes)].filter(x=>direction*(x-ui)>0).sort((a,b)=>direction*(a-b))){while(direction*(end-s)>0){if(++budget>16384)throw Error('公共系统独立 DP54 超过有限预算。');if(direction*(s+h-end)>0)h=end-s;if(s+h===s)fail();const stages:number[][]=[];
     for(let k=0;k<7;k++)stages.push(derivative(k===6?s+h:s+c[k]*h,y.map((v,i)=>v+h*a[k].reduce((sum,w,j)=>sum+w*stages[j][i],0))));
     const high=y.map((v,i)=>v+h*a[6].reduce((sum,w,j)=>sum+w*stages[j][i],0)),small=y.map((v,i)=>v+h*low.reduce((sum,w,j)=>sum+w*stages[j][i],0)),error=Math.max(...high.map((v,i)=>Math.abs(v-small[i])/(2e-13+2e-11*Math.max(Math.abs(v),Math.abs(y[i])))));
     if(!finite(error)||high.some(x=>!finite(x)))fail();if(error<=1){s=direction*(s+h-end)>=0?end:s+h;y=high;}h*=error===0?4:Math.min(4,Math.max(.15,.9*error**(-.2)));}states.set(end,y.slice());}}}
 const row=(s:number):GenericSystemHelpersRow=>{let C:number[],CP:number[],frame:number[][]=[],rules:Record<string,Rule>={},derivatives:Record<string,number[]|null>={},coefficients:Record<string,number|null>={},defined=true,reasons:string[]=[],D:number[]|null=null;const order=SYSTEM_HELPERS_NATIVE_SOURCE[mode].ruleOrder;
  if(recover){const y=states.get(s);if(!y)fail();const dy=derivative(s,y),raw=coefficient(s),T=y.slice(n,2*n),L=y.slice(2*n,3*n),U=y.slice(3*n,4*n);C=y.slice(0,n);CP=dy.slice(0,n);frame=n===2?[T,L]:[T,L,U];
   if(mode==='recover-darboux'){rules={C:add(origin,C,scale),T,L,U};derivatives={C:mul(CP,scale),T:dy.slice(n,2*n),L:dy.slice(2*n,3*n),U:dy.slice(3*n,4*n)};coefficients={ds:raw[0],sdKappaG:raw[1],sdKappaN:raw[2],sdTauG:raw[3]};}
   else if(n===2){rules={Curve2D:add(origin,C,scale),Speed2D:raw[0],LeftCurvature2D:raw[1],Curvature2D:Math.abs(raw[1]),TangentVector2D:T,LeftNormalVector2D:L,NormalVector2D:mul(L,Math.sign(raw[1]))};derivatives={curve:mul(CP,scale),T:dy.slice(n,2*n),L:dy.slice(2*n,3*n)};coefficients={speed:raw[0],leftCurvature:raw[1],curvature:Math.abs(raw[1])};}
   else {rules={Curve3D:add(origin,C,scale),Speed3D:raw[0],Curvature3D:raw[1],Torsion3D:raw[2],TangentVector3D:T,BinormalVector3D:U,NormalVector3D:L};derivatives={curve:mul(CP,scale),T:dy.slice(n,2*n),N:dy.slice(2*n,3*n),B:dy.slice(3*n,4*n)};coefficients={speed:raw[0],curvature:raw[1],torsion:raw[2]};}
  }else{const r=source(s);C=val(r.c);CP=val(r.cp);const speed=Math.hypot(...CP)*scale;
   if(mode==='ruled-normal'){D=val(r.director);const DP=prime(r.director),w=(q.transverseStart!+q.transverseEnd!)/2,c=cross(add(CP,DP,w),D),mag=Math.hypot(...c);defined=mag>0;if(!defined)reasons.push('zero-area-original-NormalizeReal');rules={SurfaceNormalVector3D:mag?mul(c,q.sigma!/mag):null};derivatives={curve:mul(CP,scale),director:mul(DP,scale)};coefficients={baseSpeed:speed};}
   else{const v=Math.hypot(...CP);if(v===0){defined=false;reasons.push('zero-speed-original-division');rules=Object.fromEntries(order.map(k=>[k,null]));if(mode!=='darboux3')rules[n===2?'Curve2D':'Curve3D']=add(origin,C,scale);rules[n===2?'Speed2D':'Speed3D']=0;if(mode==='darboux3')rules.SurfaceNormalVector3D=val(r.normal);derivatives={curve:mul(CP,scale)};coefficients={speed:0};}
    else{const T=tmul(r.cp,tdot(r.cp,r.cp).sqrt().inv()),TP=T.map(x=>x.derivative()),tv=val(T),tp=val(TP);
     if(n===2){const L=[T[1].neg(),T[0]],lv=val(L),k=tdot(L,TP).c[0]/(v*scale);frame=[tv,lv];rules={Curve2D:add(origin,C,scale),Speed2D:speed,LeftCurvature2D:k,Curvature2D:Math.abs(k),TangentVector2D:tv,LeftNormalVector2D:lv,NormalVector2D:mul(lv,Math.sign(k))};derivatives={curve:mul(CP,scale),T:tp,L:[-tp[1],tp[0]]};coefficients={speed,leftCurvature:k,curvature:Math.abs(k)};}
     else if(mode==='curve3'){const cb=tcross(r.cp,r.cp.map(x=>x.derivative())),mag=Math.hypot(...val(cb)),k=mag/(v**3*scale);let B:number[]|null=null,N:number[]|null=null,tau:number|null=null;
      if(mag){const BJ=tmul(cb,tdot(cb,cb).sqrt().inv()),NJ=tcross(BJ,T);B=val(BJ);N=val(NJ);tau=tdot(cb,r.cp.map(x=>x.derivative().derivative())).c[0]/(mag**2*scale);frame=[tv,N,B];derivatives={curve:mul(CP,scale),T:tp,N:prime(NJ),B:prime(BJ)};}
      else{defined=false;reasons.push('zero-curvature-original-NormalizeReal');frame=[tv];derivatives={curve:mul(CP,scale),T:tp,N:null,B:null};}
      rules={Curve3D:add(origin,C,scale),Speed3D:speed,Curvature3D:k,Torsion3D:tau,TangentVector3D:tv,BinormalVector3D:B,NormalVector3D:N};coefficients={speed,curvature:k,torsion:tau};
     }else{const U=r.normal,L=tcross(U,T),g=tdot(L,TP).c[0]/(v*scale),h=tdot(U,TP).c[0]/(v*scale),z=-tdot(L,U.map(x=>x.derivative())).c[0]/(v*scale);frame=[tv,val(L),val(U)];rules={Speed3D:speed,GeodesicCurvature3D:g,NormalCurvature3D:h,GeodesicTorsion3D:z,TangentVector3D:tv,TangentNormalVector3D:val(L),SurfaceNormalVector3D:val(U)};derivatives={curve:mul(CP,scale),T:tp,L:prime(L),U:prime(U)};coefficients={speed,geodesicCurvature:g,normalCurvature:h,geodesicTorsion:z};}}}}
  const world=add(origin,C,scale);return {s,transverseParameter:mode==='ruled-normal'?(q.transverseStart!+q.transverseEnd!)/2:null,curve:world,normalizedCurve:C,curveDerivative:mul(CP,scale),normalizedCurveDerivative:CP,rules:Object.fromEntries(order.map(k=>[k,rules[k]])),derivatives,coefficients,frame,frameGramResidual:frame.length===n?gram(frame):null,systemDefined:defined,undefinedReasons:reasons,actualCurveSpeed:Math.hypot(...CP)*scale,director:D?mul(D,scale):null,normalizedDirector:D};
 };
 return {query:q,normalization:{origin,scale},initialFrame,source,row};
}

export function parseGenericSystemHelpersResult(raw:unknown,requested?:unknown):GenericSystemHelpersResult{
 if(!record(raw)||!keys(raw,['family','query','source','normalization','initial','domain','diagnostics','certification','sample','grid'])||raw.family!=='origamica-generic-system-helpers')fail();
 const q=validateGenericSystemHelpersQuery(raw.query);if(requested&&JSON.stringify(q)!==JSON.stringify(validateGenericSystemHelpersQuery(requested)))fail();
 const linspace=(a:number,b:number,n:number)=>Array.from({length:n+1},(_,i)=>i===n?b:a+i*((b-a)/n));
 const nodes=linspace(q.parameterStart,q.parameterEnd,q.segments),validation=linspace(q.parameterStart,q.parameterEnd,128),union=[...new Set([...nodes,...validation])].sort((a,b)=>a-b),reference=makeGenericSystemHelpersReference(q,union),source=SYSTEM_HELPERS_NATIVE_SOURCE[q.mode],recover=q.mode.startsWith('recover'),dimension=['curve2','recover2'].includes(q.mode)?2:3;
 if(!record(raw.source)||JSON.stringify(raw.source.functions)!==JSON.stringify(source.functions)||JSON.stringify(raw.source.definitionCells)!==JSON.stringify(source.definitionCells)||JSON.stringify(raw.source.ruleOrder)!==JSON.stringify(source.ruleOrder)||raw.source.selectedFunction!==source.functions.at(-1)||raw.source.outputKind!==(q.mode==='recover-darboux'?'ordered-list':q.mode==='ruled-normal'?'two-parameter-normal-function':'ordered-rules')||raw.source.method!=='whitelist-AST/modern-raw-IC/literal-system-equations'||raw.source.rawNormalPreserved!==(q.mode==='darboux3')||raw.source.rawInitialVectorsPreserved!==recover||raw.source.normalizeRealConvention!=='vector/Mag(vector); zero remains undefined'||raw.source.darbouxCoefficientConvention!=='ds multiplies C only; sdKappaG/sdKappaN/sdTauG already parameter derivatives'||['symbolicObjectsReproduced','interpolationReproduced','wolframOptionsReproduced'].some(k=>raw.source[k]!==false))fail();
 if(!record(raw.normalization)||!nearV(raw.normalization.origin,reference.normalization.origin)||!near(raw.normalization.scale,reference.normalization.scale,reference.normalization.scale,1e-12))fail();
 const compare=(a:unknown,b:unknown,natural?:number):boolean=>b===null?a===null:typeof b==='number'?near(a,b,natural??Math.abs(b)):Array.isArray(b)?Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>compare(a[i],v,natural??(b.every(finite)?Math.hypot(...b):undefined))):typeof b==='object'&&b!==null?record(a)&&keys(a,Object.keys(b))&&Object.entries(b).every(([k,v])=>compare(a[k],v)):a===b;
 if(!record(raw.sample)||!Array.isArray(raw.sample.rows)||raw.sample.rows.length!==nodes.length)fail();
 raw.sample.rows.forEach((a:any,i:number)=>{const b=reference.row(nodes[i]);if(!record(a)||!keys(a,Object.keys(b)))fail();
  // A dot product can cancel to zero. Its rounding scale is the product of
  // the source vector norms, not the residual curvature (nor a world-unit floor).
  const curvatureScale=(key:string):number|undefined=>{
   if(q.mode!=='darboux3'||!b.systemDefined)return undefined;
   const v=b.actualCurveSpeed,Tp=b.derivatives.T!,Up=b.derivatives.U!,L=b.rules.TangentNormalVector3D as number[],U=b.rules.SurfaceNormalVector3D as number[];
   if(key==='NormalCurvature3D'||key==='normalCurvature')return Math.hypot(...U)*Math.hypot(...Tp)/v;
   if(key==='GeodesicCurvature3D'||key==='geodesicCurvature')return Math.hypot(...L)*Math.hypot(...Tp)/v;
   if(key==='GeodesicTorsion3D'||key==='geodesicTorsion')return Math.hypot(...L)*Math.hypot(...Up)/v;
   return undefined;
  };
  for(const key of Object.keys(b)){
   if(key==='curve'||key==='rules'){if(key==='curve'){if(!nearV(a.curve,b.curve,Math.max(Math.hypot(...b.curve),reference.normalization.scale)))fail();}
    else if(!record(a.rules)||!keys(a.rules,source.ruleOrder)||source.ruleOrder.some(k=>!compare(a.rules[k],b.rules[k],k==='C'||k.startsWith('Curve')?Math.max(Math.hypot(...b.curve),reference.normalization.scale):curvatureScale(k))))fail();}
   else if(key==='coefficients'){if(!record(a.coefficients)||!keys(a.coefficients,Object.keys(b.coefficients))||Object.keys(b.coefficients).some(k=>!compare(a.coefficients[k],b.coefficients[k],curvatureScale(k))))fail();}
   else if(key==='frameGramResidual'){if(!compare(a[key],b[key],1))fail();}else if(!compare(a[key],b[key as keyof GenericSystemHelpersRow]))fail();}});
 if(!Array.isArray(raw.grid)||raw.grid.length!==(q.mode==='ruled-normal'?nodes.length:0))fail();let undefinedGrid=0,undefinedValidation=0;
 if(q.mode==='ruled-normal')for(let i=0;i<union.length;i++){const s=union[i],r=reference.row(s),sourceAt=reference.source(s),ws=Array.from({length:q.rulingSegments!+1},(_,j)=>q.transverseStart!+(q.transverseEnd!-q.transverseStart!)*j/q.rulingSegments!),position=nodes.findIndex(x=>x===s);
  const normals=[...ws,(q.transverseStart!+q.transverseEnd!)/2].map(w=>{const c=cross(add(r.normalizedCurveDerivative,prime(sourceAt.director),w),r.normalizedDirector!),mag=Math.hypot(...c);if(!mag)undefinedValidation++;return {normal:mag?mul(c,q.sigma!/mag):null,area:mag*mag};});
  if(position>=0){const g=raw.grid[position];if(!record(g)||!keys(g,['s','points','normalizedPoints','normals','areaSquared'])||!near(g.s,s,q.parameterEnd-q.parameterStart,1e-12))fail();for(const key of ['points','normalizedPoints','normals','areaSquared'])if(!Array.isArray(g[key])||g[key].length!==ws.length)fail();
   ws.forEach((w,j)=>{const p=add(r.normalizedCurve,r.normalizedDirector!,w),world=add(reference.normalization.origin,p,reference.normalization.scale);if(!nearV(g.normalizedPoints[j],p)||!nearV(g.points[j],world,Math.max(Math.hypot(...world),reference.normalization.scale))||!compare(g.normals[j],normals[j].normal)||!near(g.areaSquared[j],normals[j].area))fail();if(!normals[j].normal)undefinedGrid++;});}}
 const d=raw.domain;if(!record(d)||!keys(d,['certified','evaluations','verifiedCells','cells','unresolved','roundingModel','zeroFrameIdentityProved','reason'])||typeof d.certified!=='boolean'||typeof d.zeroFrameIdentityProved!=='boolean'||!Array.isArray(d.cells)||!Array.isArray(d.unresolved)||d.verifiedCells!==d.cells.length||!Number.isInteger(d.evaluations)||d.evaluations<1||d.evaluations>1023||typeof d.roundingModel!=='string'||!d.roundingModel.length||d.certified!==(d.unresolved.length===0&&!d.zeroFrameIdentityProved)||d.reason!==(d.certified?null:d.zeroFrameIdentityProved?'original-frame-identically-undefined':'original-source-or-frame-not-enclosed-within-budget'))fail();
 const segments=[...d.cells.map((x:any)=>[x.start,x.end]),...d.unresolved].sort((a:number[],b:number[])=>a[0]-b[0]);let edge=q.parameterStart;
 for(const p of segments){if(!vector(p,2)||p[0]>=p[1]||p[0]<q.parameterStart||p[1]>q.parameterEnd||!near(p[0],edge,q.parameterEnd-q.parameterStart,1e-12))fail();edge=p[1];}if(!near(edge,q.parameterEnd,q.parameterEnd-q.parameterStart,1e-12))fail();
 const inside=(b:unknown,x:number)=>vector(b,2)&&b[0]<=b[1]&&x>=b[0]-3e-8*Math.max(Math.abs(x),Number.MIN_VALUE)&&x<=b[1]+3e-8*Math.max(Math.abs(x),Number.MIN_VALUE);
 for(const cell of d.cells){if(!record(cell)||!keys(cell,['start','end','auxiliaryNormSquaredBounds','coefficientBounds','systemDefined'])||cell.systemDefined!==!d.zeroFrameIdentityProved||!Array.isArray(cell.coefficientBounds)||cell.coefficientBounds.length!==(recover?q.coefficients!.length:0))fail();
  if(recover){if(cell.auxiliaryNormSquaredBounds!==null)fail();for(const s of [cell.start,(cell.start+cell.end)/2,cell.end])reference.source(s).coefficients.forEach((x,i)=>{if(!inside(cell.coefficientBounds[i],x.c[0]))fail();});}
  else{if(!vector(cell.auxiliaryNormSquaredBounds,2)||cell.auxiliaryNormSquaredBounds[0]>cell.auxiliaryNormSquaredBounds[1]||!d.zeroFrameIdentityProved&&cell.auxiliaryNormSquaredBounds[0]<=0)fail();for(const s of [cell.start,(cell.start+cell.end)/2,cell.end]){const r=reference.source(s),cp=val(r.cp);let aux=dot(cp,cp);if(q.mode==='curve3'){const v=cross(cp,prime(r.cp));aux=dot(v,v);}if(q.mode==='ruled-normal')for(const w of [q.transverseStart!,q.transverseEnd!,0.5*(q.transverseStart!+q.transverseEnd!)]){const v=cross(add(cp,prime(r.director),w),val(r.director));if(!inside(cell.auxiliaryNormSquaredBounds,dot(v,v)))fail();}else if(!inside(cell.auxiliaryNormSquaredBounds,aux))fail();}}}
 const values=union.map(s=>reference.row(s)),residuals=values.map(x=>x.frameGramResidual).filter(finite),defined=values.every(x=>x.systemDefined)&&undefinedValidation===0;
 if(d.zeroFrameIdentityProved&&(q.mode!=='curve3'||values.some(x=>x.systemDefined||x.rules.Speed3D!==0&&x.rules.Curvature3D!==0)))fail();
 if(recover){const initial=raw.initial,g=gram(reference.initialFrame),orientation=dimension===2?reference.initialFrame[0][0]*reference.initialFrame[1][1]-reference.initialFrame[0][1]*reference.initialFrame[1][0]:dot(reference.initialFrame[0],cross(reference.initialFrame[1],reference.initialFrame[2])),compatible=g<=64*Number.EPSILON&&Math.abs(orientation-1)<=64*Number.EPSILON;
  if(!record(initial)||!keys(initial,['parameter','point','frame','frameGramResidual','frameCompatibilityTolerance','frameCompatible'])||!compare(initial.parameter,q.initialParameter)||!compare(initial.point,q.initialPoint)||!compare(initial.frame,reference.initialFrame)||!compare(initial.frameGramResidual,g,1)||initial.frameCompatibilityTolerance!==64*Number.EPSILON||initial.frameCompatible!==compatible)fail();}
 else if(raw.initial!==null)fail();
 const diag=raw.diagnostics;if(!record(diag)||!keys(diag,['validationNodes','validationUnionNodes','definedRows','undefinedGridNormals','validationUndefinedNormals','maximumFrameGramResidual','rawNormalIdentityAnalytic','integration'])||diag.validationNodes!==129||diag.validationUnionNodes!==union.length||diag.definedRows!==raw.sample.rows.filter((x:any)=>x.systemDefined).length||diag.undefinedGridNormals!==undefinedGrid||diag.validationUndefinedNormals!==undefinedValidation||!compare(diag.maximumFrameGramResidual,residuals.length?Math.max(...residuals):null,1)||typeof diag.rawNormalIdentityAnalytic!=='boolean')fail();
 if(diag.rawNormalIdentityAnalytic&&(q.mode!=='darboux3'||union.some(s=>{const r=reference.source(s),u=val(r.normal),cp=val(r.cp);return !near(dot(u,u),1,1)||!near(dot(cp,u),0,Math.hypot(...cp)*Math.hypot(...u));})))fail();
 const integration=diag.integration;if(!record(integration)||!keys(integration,['method','rtol','atol','forwardEvaluations','backwardEvaluations',...(q.ndsolveOptions?['stepOptions']:[])])||integration.method!==(recover?'DOP853':'none')||integration.rtol!==(recover?2e-12:null)||integration.atol!==(recover?2e-14:null))fail();
 for(const [key,yes] of [['forwardEvaluations',recover&&q.initialParameter!<q.parameterEnd],['backwardEvaluations',recover&&q.initialParameter!>q.parameterStart]] as const)if(!Number.isInteger(integration[key])||integration[key]<0||integration[key]>24000||(integration[key]>0)!==yes)fail();
 if(q.ndsolveOptions&&!validateNDSolveStepStamp(integration.stepOptions,q.ndsolveOptions,source.definitionCells.at(-1) as NDSolveDefinitionCell,
  q.parameterStart,q.parameterEnd,q.initialParameter!,integration.forwardEvaluations+integration.backwardEvaluations,(q.parameterEnd-q.parameterStart)/16))fail();
 const cert=raw.certification,formal=d.certified&&(recover?raw.initial.frameCompatible:q.mode==='darboux3'?diag.rawNormalIdentityAnalytic:true);
 if(!record(cert)||!keys(cert,['sourceDefinitionCertified','finiteSystemFullyDefined','formalFrameOrthonormalCertified','integrationErrorIntervalCertified','globalInjectivityChecked','selfCollisionChecked','adoptableCreasePattern','exactStraightCreaseFOLD'])||cert.sourceDefinitionCertified!==d.certified||cert.finiteSystemFullyDefined!==defined||cert.formalFrameOrthonormalCertified!==formal||['integrationErrorIntervalCertified','globalInjectivityChecked','selfCollisionChecked','adoptableCreasePattern','exactStraightCreaseFOLD'].some(k=>cert[k]!==false))fail();
 return raw as GenericSystemHelpersResult;
}
export async function fetchGenericSystemHelpersWhenIdle(input:unknown,signal?:AbortSignal):Promise<GenericSystemHelpersResult>{const query=validateGenericSystemHelpersQuery(input);while(true){signal?.throwIfAborted();try{return parseGenericSystemHelpersResult(await api('tessellation/curved-system-helpers-generic',query,signal),query);}catch(cause){if(signal?.aborted||!(cause instanceof Error)||!/(正在计算|已有镶嵌计算正在进行|计算器.*忙|稍后重试)/.test(cause.message))throw cause;
 await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(signal?.reason??new DOMException('Aborted','AbortError'));};const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},250);signal?.addEventListener('abort',abort,{once:true});});}}}
