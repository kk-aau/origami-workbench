import {makeGenericSystemHelpersReference,parseGenericSystemHelpersResult,type GenericSystemHelpersResult} from './curvedNativeSystemHelpers';
import {styledFrenetTrihedron,type FrenetStyle,type TrihedronGraphics} from './curvedSystemGraphics';
export type DropSpec=number|'All'|'None'|[number]|[number,number]|[number,number,number]|{UpTo:number};
export type Graphics3Options={Axes?:boolean|boolean[];Boxed?:boolean;BoxRatios?:'Automatic'|number[];PlotRange?:'All'|number[][];ViewPoint?:number[];ImageSize?:'Automatic'|number|number[];AxesLabel?:'None'|string[];PlotLabel?:'None'|string;Background?:'None'|number[]};
export type FrenetPlotOptions=FrenetStyle&Graphics3Options&{FrenetTrihedrons?:number;FrenetDrop?:DropSpec;CurveDivisions?:number};
const record=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x),finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x),vector=(x:unknown,n:number):x is number[]=>Array.isArray(x)&&x.length===n&&x.every(v=>finite(v)&&Math.abs(v)<=1e12);
const same=(a:unknown,b:unknown):boolean=>Array.isArray(b)?Array.isArray(a)&&a.length===b.length&&b.every((x,i)=>same(a[i],x)):record(b)?record(a)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(b).every(k=>Object.hasOwn(a,k)&&same(a[k],b[k])):a===b;
const defaults:Required<Graphics3Options>={Axes:false,Boxed:true,BoxRatios:'Automatic',PlotRange:'All',ViewPoint:[1.3,-2.4,2],ImageSize:'Automatic',AxesLabel:'None',PlotLabel:'None',Background:'None'};
const styleKeys=['FrenetVectorLength','FrenetVectorLabels','VectorThickness2D','VectorThickness3D','VectorLabelPosition'],graphicsKeys=Object.keys(defaults);
function fail(message:string):never{throw Error(message);}
/** A single Drop sequence, using original 1-based positions; never clamped except explicit UpTo. */
export function dropKeptIndices(count:number,spec:unknown):number[]{
 if(!Number.isInteger(count)||count<0||count>129)fail('Drop 列表长度超出预算。');const all=Array.from({length:count},(_,i)=>i),removed=new Set<number>();
 if(spec==='All')return [];if(spec==='None')return all;
 if(record(spec)&&Object.keys(spec).length===1&&Object.hasOwn(spec,'UpTo')&&Number.isInteger(spec.UpTo)&&spec.UpTo>=0)return all.slice(Math.min(count,spec.UpTo));
 if(Number.isInteger(spec)){const n=spec as number;if(Math.abs(n)>count)fail('FrenetDrop 超出标架列表长度。');return n>=0?all.slice(n):all.slice(0,count+n);}
 if(!Array.isArray(spec)||spec.length<1||spec.length>3||!spec.every(Number.isInteger))fail('FrenetDrop 须为整数、All、None、UpTo 或一层位置范围。');
 const position=(n:number)=>{if(n===0||Math.abs(n)>count)fail('FrenetDrop 位置须为列表内的非零索引。');return n>0?n:count+n+1;},start=position(spec[0]),end=spec.length===1?start:position(spec[1]),step=spec.length===3?spec[2]:1;
 if(step===0||Math.abs(step)>129)fail('FrenetDrop 步长须为非零有限整数。');
 if((end-start)*step<0)fail('FrenetDrop 范围与步长方向不一致。');for(let n=start;step>0?n<=end:n>=end;n+=step)removed.add(n-1);return all.filter(i=>!removed.has(i));
}
export function validateFrenetPlotOptions(value:unknown):FrenetPlotOptions{
 if(!record(value)||Object.keys(value).some(k=>![...styleKeys,...graphicsKeys,'FrenetTrihedrons','FrenetDrop','CurveDivisions'].includes(k)))fail('含未支持的 Frenet 或 Graphics3D 选项。');
 const out=structuredClone(value),fn=out.FrenetTrihedrons??5;
 if(!Number.isInteger(fn)||fn< -128||fn>129||fn===1)fail('标架数须为 −128–0 或 2–129 的整数；原 fn=1 会除零。');
 if(Object.hasOwn(out,'CurveDivisions')&&(!Number.isInteger(out.CurveDivisions)||out.CurveDivisions<1||out.CurveDivisions>1024))fail('CurveDivisions 须为 1–1024 的整数；原此参数未传入基线。');
 const style=Object.fromEntries(styleKeys.filter(k=>Object.hasOwn(out,k)).map(k=>[k,out[k]]));styledFrenetTrihedron([0,0,0],[1,0,0],[0,1,0],[0,0,1],style);
 const g:Record<string,any>={...defaults,...Object.fromEntries(graphicsKeys.filter(k=>Object.hasOwn(out,k)).map(k=>[k,out[k]]))};
 if(!(typeof g.Axes==='boolean'||Array.isArray(g.Axes)&&g.Axes.length===3&&g.Axes.every(x=>typeof x==='boolean'))||typeof g.Boxed!=='boolean')fail('Axes / Boxed 须为布尔值或三个 Axes 布尔值。');
 if(g.BoxRatios!=='Automatic'&&(!vector(g.BoxRatios,3)||g.BoxRatios.some(x=>x<=0||x>1e6)))fail('BoxRatios 须为 Automatic 或三个正数。');
 if(g.PlotRange!=='All'&&(!Array.isArray(g.PlotRange)||g.PlotRange.length!==3||!g.PlotRange.every(r=>vector(r,2)&&r[0]<r[1])))fail('PlotRange 须为 All 或三个递增有限范围。');
 if(!vector(g.ViewPoint,3)||Math.hypot(...g.ViewPoint)===0)fail('ViewPoint 须为非零有限三维向量。');
 const size=(x:unknown)=>finite(x)&&x>=64&&x<=4096;if(g.ImageSize!=='Automatic'&&!(size(g.ImageSize)||Array.isArray(g.ImageSize)&&g.ImageSize.length===2&&g.ImageSize.every(size)))fail('ImageSize 须为 Automatic 或 64–4096 的宽度/宽高。');
 if(g.AxesLabel!=='None'&&(!Array.isArray(g.AxesLabel)||g.AxesLabel.length!==3||g.AxesLabel.some(x=>typeof x!=='string'||x.length>120)))fail('AxesLabel 须为 None 或三个文本标签。');
 if(typeof g.PlotLabel!=='string'||g.PlotLabel.length>240)fail('PlotLabel 须为至多 240 字的文本。');
 if(g.Background!=='None'&&(!vector(g.Background,3)||g.Background.some(x=>x<0||x>1)))fail('Background 须为 None 或 0–1 的 RGB。');
 if(fn>0)dropKeptIndices(fn,out.FrenetDrop??0);else if(!same(out.FrenetDrop??0,0))dropKeptIndices(129,out.FrenetDrop);return out;
}
export type FrenetTrihedronPlot={family:'origamica-frenet-trihedron-plot';system:GenericSystemHelpersResult;options:FrenetPlotOptions;source:{function:'FrenetTrihedronPlot3D';definitionCell:'In[3713]';optionsCell:'In[3712]';definitionLines:number[];declaredDefaults:{FrenetVectorLength:.1;FrenetTrihedrons:5;FrenetDrop:0};effectiveVectorLength:number;lengthDefaultForwarded:false;curveDivisionsForwarded:false;styledCurveCell:'In[1711]';numericFunctionSubset:true;wolframGraphicsObjectReproduced:false;wolframRenderingReproduced:false;wolframMachineTableReproduced:false};graphicsOptions:Graphics3Options;curve:{divisions:100;directed:false;tube:false;style:{color:'Black';relativeThickness:.01};samples:{parameter:number;point:number[]}[];segments:[number,number][]};frameSampling:{parameters:number[];keptIndices:number[];droppedIndices:number[]};frames:{index:number;parameter:number;point:number[];tangent:number[]|null;normal:number[]|null;binormal:number[]|null;undefinedReasons:string[];graphics:TrihedronGraphics|null}[]};
export function frenetTrihedronPlot3D(value:unknown,inputOptions:FrenetPlotOptions={}):FrenetTrihedronPlot{
 const system=parseGenericSystemHelpersResult(value);if(system.query.mode!=='curve3')fail('此原 Function 合同需要安全表达式三维曲线；恢复插值或其它系统尚未支持。');
 const options=validateFrenetPlotOptions(inputOptions),fn=options.FrenetTrihedrons??5,q=system.query,a=q.parameterStart,b=q.parameterEnd,parameters=fn>0?Array.from({length:fn},(_,i)=>i===fn-1?b:a+i*(b-a)/(fn-1)):[],keptIndices=fn>0?dropKeptIndices(fn,options.FrenetDrop??0):[],style=Object.fromEntries(styleKeys.filter(k=>Object.hasOwn(options,k)).map(k=>[k,options[k as keyof FrenetPlotOptions]])),reference=makeGenericSystemHelpersReference(q,parameters),curveParameters=Array.from({length:101},(_,i)=>i===100?b:a+i*(b-a)/100);
 const samples=curveParameters.map(parameter=>{const point=reference.row(parameter).curve;if(!vector(point,3))fail('基线原位置非有限。');return {parameter,point};}),segments:[number,number][]=[];
 for(let i=0;i<100;i++)if(!system.domain.unresolved.some(([lo,hi])=>samples[i+1].parameter>lo&&samples[i].parameter<hi))segments.push([i,i+1]);
 const frames=keptIndices.map(index=>{const parameter=parameters[index],row=reference.row(parameter),r=row.rules,tangent=r.TangentVector3D as number[]|null,normal=r.NormalVector3D as number[]|null,binormal=r.BinormalVector3D as number[]|null;return {index,parameter,point:row.curve,tangent,normal,binormal,undefinedReasons:row.undefinedReasons,graphics:tangent&&normal&&binormal?styledFrenetTrihedron(row.curve,tangent,normal,binormal,style):null};});
 return {family:'origamica-frenet-trihedron-plot',system:structuredClone(system),options,source:{function:'FrenetTrihedronPlot3D',definitionCell:'In[3713]',optionsCell:'In[3712]',definitionLines:[294184,294318],declaredDefaults:{FrenetVectorLength:.1,FrenetTrihedrons:5,FrenetDrop:0},effectiveVectorLength:options.FrenetVectorLength??1,lengthDefaultForwarded:false,curveDivisionsForwarded:false,styledCurveCell:'In[1711]',numericFunctionSubset:true,wolframGraphicsObjectReproduced:false,wolframRenderingReproduced:false,wolframMachineTableReproduced:false},graphicsOptions:structuredClone({...defaults,...Object.fromEntries(graphicsKeys.filter(k=>Object.hasOwn(options,k)).map(k=>[k,options[k as keyof FrenetPlotOptions]]))}) as Graphics3Options,curve:{divisions:100,directed:false,tube:false,style:{color:'Black',relativeThickness:.01},samples,segments},frameSampling:{parameters,keptIndices,droppedIndices:parameters.map((_,i)=>i).filter(i=>!keptIndices.includes(i))},frames};
}
export function readFrenetTrihedronPlot(raw:unknown):FrenetTrihedronPlot{
 if(!record(raw))fail('需要完整原标架图数据。');const expected=frenetTrihedronPlot3D(raw.system,raw.options);
 // Chrome and Node Math.sin/cos can differ by one ulp. Only replayed geometric coordinates allow roundoff;
 // source, options, parameters, indices, colors, topology, nulls and all diagnostics remain exact.
 const point=/^\/(?:curve\/samples\/\d+\/point\/\d+|frames\/\d+\/(?:point\/\d+|graphics\/(?:arguments\/point\/\d+|graphics\/\d+\/(?:arrow\/points\/\d+\/\d+|text\/position\/\d+))))$/,
  direction=/^\/frames\/\d+\/(?:tangent\/\d+|normal\/\d+|binormal\/\d+|graphics\/arguments\/vectors\/\d+\/\d+)$/,
  match=(a:unknown,b:unknown,path=''):boolean=>{
   if(finite(a)&&finite(b)&&(point.test(path)||direction.test(path))){const natural=direction.test(path)?1:Math.max(expected.system.normalization.scale,path.includes('/arrow/points/1/')||path.includes('/text/position/')?Math.abs(expected.source.effectiveVectorLength):0);return Math.abs(a-b)<=32*Number.EPSILON*Math.max(Math.abs(b),natural)+Number.MIN_VALUE;}
   return Array.isArray(b)?Array.isArray(a)&&a.length===b.length&&b.every((x,i)=>match(a[i],x,path+'/'+i)):record(b)?record(a)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(b).every(k=>Object.hasOwn(a,k)&&match(a[k],b[k],path+'/'+k)):a===b;
  };
 if(!match(raw,expected))fail('标架参数、Drop、原向量、图形选项或来源回读不一致。');return expected;
}

/** Display only: raw world primitives above are unchanged; this is an orthographic preview, not Wolfram rendering. */
export function frenetPlotPreview(scene:FrenetTrihedronPlot){
 const options=scene.graphicsOptions,all=scene.curve.samples.map(r=>r.point).concat(scene.frames.flatMap(f=>f.graphics?.graphics.flatMap(g=>g.arrow.points)??[])),range=options.PlotRange==='All'?Array.from({length:3},(_,i)=>{const values=all.map(p=>p[i]),lo=Math.min(...values),hi=Math.max(...values);return hi>lo?[lo,hi]:[lo-.5,hi+.5];}):options.PlotRange as number[][],
  spans=range.map(([lo,hi])=>hi-lo),center=range.map(([lo,hi])=>lo/2+hi/2),factor=options.BoxRatios==='Automatic'?spans.map(()=>1):spans.map((span,i)=>(options.BoxRatios as number[])[i]/span),
  unit=(v:number[])=>{const n=Math.hypot(...v);return v.map(x=>x/n);},cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],direction=unit(options.ViewPoint as number[]),right=unit(cross(Math.abs(direction[2])>.999?[0,1,0]:[0,0,1],direction)),up=cross(direction,right),
  project=(p:number[])=>{const v=p.map((x,i)=>(x-center[i])*factor[i]);return [v.reduce((s,x,i)=>s+x*right[i],0),-v.reduce((s,x,i)=>s+x*up[i],0)];},inside=(p:number[])=>p.every((x,i)=>x>=range[i][0]&&x<=range[i][1]),
  clip=(a:number[],b:number[])=>{let lo=0,hi=1;for(let i=0;i<3;i++){const d=b[i]-a[i];if(d===0){if(a[i]<range[i][0]||a[i]>range[i][1])return null;}else{const u=(range[i][0]-a[i])/d,v=(range[i][1]-a[i])/d;lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v));if(lo>hi)return null;}}return [project(a.map((x,i)=>x+lo*(b[i]-x))),project(a.map((x,i)=>x+hi*(b[i]-x)))];};
 const corners=Array.from({length:8},(_,i)=>range.map(([lo,hi],j)=>i&(1<<j)?hi:lo)),projected=corners.map(project),xs=projected.map(p=>p[0]),ys=projected.map(p=>p[1]),span=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys),.01),margin=span*.12,
  box=options.Boxed?corners.flatMap((p,i)=>[0,1,2].filter(j=>!(i&(1<<j))).map(j=>[project(p),project(corners[i|(1<<j)])])):[],axes=Array.from({length:3},(_,i)=>{const enabled=Array.isArray(options.Axes)?options.Axes[i]:options.Axes;if(!enabled)return null;const a=range.map(([lo])=>lo),b=a.slice();b[i]=range[i][1];return {axis:i,points:[project(a),project(b)],label:options.AxesLabel==='None'?'':(options.AxesLabel as string[])[i]};}).filter(x=>x!==null),
  curve=scene.curve.segments.map(([a,b])=>clip(scene.curve.samples[a].point,scene.curve.samples[b].point)).filter(x=>x!==null),arrows=scene.frames.flatMap(f=>f.graphics?.graphics.map((g,i)=>({index:f.index,vector:i,points:clip(g.arrow.points[0],g.arrow.points[1]),tipVisible:inside(g.arrow.points[1]),text:g.text,tip:project(g.arrow.points[1]),color:g.arrow.curveVectorStyleCMYK,thickness:g.arrow.absoluteThickness,tubeThickness:g.arrow.tubeThickness})).filter(g=>g.points!==null)??[]);
 return {range,projection:'orthographic' as const,viewBox:[Math.min(...xs)-margin,Math.min(...ys)-margin,Math.max(...xs)-Math.min(...xs)+2*margin,Math.max(...ys)-Math.min(...ys)+2*margin],span,box,axes,curve,arrows};
}
