import {BoundsIndex,type Bounds2} from './boundsIndex';
import {createGpuBoxPairFilter,GpuBoxPairError,type GpuBoxPairFilter} from './gpuBoxPairs';
import {reportFlatComputationProgress} from './flatComputationProgress';

export type LayerPairBackend='cpu'|'auto'|'gpu';
// Enabled in a calculation Worker only. Core/UI callers retain a CPU path.
let backend:LayerPairBackend='cpu';
export function installLayerPairScreening(value:LayerPairBackend='auto'){backend=value;}
export interface LayerPairOptions {padding?:number;positiveArea?:boolean}
const accepts=(a:Bounds2,b:Bounds2,{padding=0,positiveArea=false}:LayerPairOptions)=>positiveArea
 ?Math.min(a[2],b[2])-Math.max(a[0],b[0])>0&&Math.min(a[3],b[3])-Math.max(a[1],b[1])>0
 :a[0]<=b[2]+padding&&b[0]<=a[2]+padding&&a[1]<=b[3]+padding&&b[1]<=a[3]+padding;

function cpuPairs(bounds:readonly Bounds2[],visitor:(a:number,b:number)=>void,options:LayerPairOptions,progress=false){
 const index=bounds.length>=64?new BoundsIndex(bounds):undefined;
 for(let a=0;a<bounds.length;a++){
  if(index){for(const b of index.query(bounds[a],options.padding??0,a))if(accepts(bounds[a],bounds[b],options))visitor(a,b);}
  else for(let b=a+1;b<bounds.length;b++)if(accepts(bounds[a],bounds[b],options))visitor(a,b);
  if(progress&&(a&255)===0)reportFlatComputationProgress({stage:'cpu-screening',label:'CPU 筛选并精确复核重叠',completed:a+1,total:bounds.length});
 }
 if(progress)reportFlatComputationProgress({stage:'cpu-screening',label:'重叠精确复核已完成',completed:bounds.length,total:bounds.length});
}
function gpuBounds(bounds:readonly Bounds2[],padding=0):readonly Bounds2[]{
 // Expand BOTH boxes. GPU may retain extra pairs; accepts() still applies the
 // original max+padding expression on untouched doubles before exact geometry.
 return padding?bounds.map(([x,y,X,Y])=>[x-padding,y-padding,X+padding,Y+padding] as const):bounds;
}

/** Calibrate on a distributed subset, including transfer/readback and CPU
 * candidate handling. Sparse models favor the CPU index. The sample also
 * checks every accepted pair, detecting unsupported/broken GPU output. */
function worthwhile(bounds:readonly Bounds2[],options:LayerPairOptions):boolean {
 if(bounds.length<8192||typeof OffscreenCanvas==='undefined')return false;
 reportFlatComputationProgress({stage:'screening-calibration',label:'选择重叠筛选方式'});
 const calibrationStart=performance.now(),count=2048,sample=Array.from({length:count},(_,i)=>bounds[Math.floor(i*bounds.length/count)]),bits=new Uint32Array(Math.ceil(count*count/32));
 let pairs=0;
 cpuPairs(sample,(a,b)=>{const id=a*count+b;bits[id>>>5]|=1<<(id&31);pairs++;},options);
 if(pairs<count*8)return false;
 // The small sample is sensitive to JIT and scheduler noise. Warm both paths,
 // then use the fastest of three equivalent count-only passes for each.
 let cpuMs=Infinity;
 for(let run=0;run<3;run++){
  let accepted=0;const start=performance.now();cpuPairs(sample,()=>{accepted++;},options);
  cpuMs=Math.min(cpuMs,performance.now()-start);
  if(accepted!==pairs)throw new Error('CPU 筛选校准不一致。');
 }
 let filter:GpuBoxPairFilter|null=null;
 try{
  filter=createGpuBoxPairFilter(gpuBounds(sample,options.padding));if(!filter)return false;
  filter.forEachPair((a,b)=>{
   if(!accepts(sample[a],sample[b],options))return;
   const id=a*count+b,bit=1<<(id&31);if(!(bits[id>>>5]&bit))throw new GpuBoxPairError('GPU 筛选校准包含重复或不一致的纸面对。');bits[id>>>5]&=~bit;
  });
  if(bits.some(word=>word!==0))throw new GpuBoxPairError('GPU 筛选校准遗漏纸面对，使用完整 CPU 计算。');
  // The first draw can compile the shader. Treat it as fixed calibration
  // cost, never multiply it by the full graph's pair count.
  let gpuMs=Infinity,initializationMs=0;
  for(let run=0;run<3;run++){
   let accepted=0;
   const stats=filter.forEachPair((a,b)=>{if(accepts(sample[a],sample[b],options))accepted++;});
   if(accepted!==pairs)throw new GpuBoxPairError('GPU 重复筛选校准不一致，使用完整 CPU 计算。');
   gpuMs=Math.min(gpuMs,stats.filterMs+stats.visitMs);initializationMs=stats.initializationMs;
  }
  const scale=(bounds.length*(bounds.length-1))/(count*(count-1));
  const cpuEstimate=cpuMs*scale,gpuEstimate=initializationMs+gpuMs*scale;
  // Require headroom for sampling, setup and variation; never select a GPU
  // merely because a context exists or because the graph is large.
  return gpuEstimate+(performance.now()-calibrationStart)<cpuEstimate*.8;
 }finally{filter?.dispose();}
}

/** GPU is rejection-only. Every emitted pair passes the original CPU bounds
 * predicate before the caller's exact geometry visitor. A device failure
 * discards partial derived output and restarts the complete indexed CPU path. */
export function screenLayerPairs(bounds:readonly Bounds2[],visitor:(a:number,b:number)=>void,reset:()=>void,options:LayerPairOptions={}):'cpu'|'gpu'{
 let filter:GpuBoxPairFilter|null=null,visitorFailed=false;const announce=bounds.length>=256;
 try{
  if(backend==='gpu'||backend==='auto'&&worthwhile(bounds,options))filter=createGpuBoxPairFilter(gpuBounds(bounds,options.padding));
  if(filter){
   reportFlatComputationProgress({stage:'gpu-screening',label:'GPU 批量筛选 · CPU 精确复核',completed:0,total:bounds.length*(bounds.length-1)/2});
   filter.forEachPair((a,b)=>{
    if(!accepts(bounds[a],bounds[b],options))return;
    try{visitor(a,b);}catch(error){visitorFailed=true;throw error;}
   },progress=>reportFlatComputationProgress({stage:'gpu-screening',label:'GPU 批量筛选 · CPU 精确复核',...progress}));
   return 'gpu';
  }
 }catch(error){
  if(visitorFailed||!(error instanceof GpuBoxPairError))throw error;
  reset();reportFlatComputationProgress({stage:'gpu-fallback',label:'改用 CPU 完整筛选',detail:'GPU 筛选不可用，重新复核全部候选'});
 }finally{filter?.dispose();}
 if(announce)reportFlatComputationProgress({stage:'cpu-screening',label:'CPU 筛选并精确复核重叠',completed:0,total:bounds.length});
 cpuPairs(bounds,visitor,options,announce);return 'cpu';
}
