/** A global target-percentage timeline. It does not describe individual crease motions. */
export type SimTargetAnimationStep =
  | {id:string;kind:'fold';target:number;duration:number}
  | {id:string;kind:'hold';duration:number};

export interface SimTargetAnimationSegment {
  readonly id:string;
  readonly kind:'fold'|'hold';
  readonly startMs:number;
  readonly endMs:number;
  readonly from:number;
  readonly to:number;
}

export interface SimTargetAnimationPath {
  readonly startPercent:number;
  readonly endPercent:number;
  readonly durationMs:number;
  readonly segments:readonly SimTargetAnimationSegment[];
}

export interface SimTargetAnimationSample {
  percent:number;
  done:boolean;
  /** The next segment owns an internal boundary; an empty sequence has index -1. */
  stepIndex:number;
}

export const MAX_SIM_TARGET_ANIMATION_STEPS=20;
export const MAX_SIM_TARGET_ANIMATION_DURATION_SECONDS=600;
export const MIN_SIM_TARGET_ANIMATION_STEP_SECONDS=.1;
export const MAX_SIM_TARGET_ANIMATION_STEP_SECONDS=120;
export const DEFAULT_SIM_TARGET_ANIMATION_STEPS:readonly SimTargetAnimationStep[]=Object.freeze([
  Object.freeze({id:'fold-to-100',kind:'fold' as const,target:100,duration:10}),
]);

function finite(value:unknown,label:string):number {
  if(typeof value!=='number'||!Number.isFinite(value))throw new Error(`${label}必须是有限数字。`);
  return value;
}

function percent(value:unknown,label:string):number {
  const number=finite(value,label);
  if(number < -100||number > 100)throw new Error(`${label}须在 -100% 至 100% 之间。`);
  return number;
}

function record(value:unknown):value is Record<string,unknown> {
  return value!==null&&typeof value==='object'&&!Array.isArray(value);
}

/** Validate untrusted saved settings and return a detached, normalized copy. */
export function validateSimTargetAnimationSteps(value:unknown):SimTargetAnimationStep[] {
  if(!Array.isArray(value))throw new Error('目标播放序列必须是列表。');
  if(value.length>MAX_SIM_TARGET_ANIMATION_STEPS)throw new Error('目标播放序列最多 20 段。');
  const ids=new Set<string>();
  let durationMs=0;
  return Array.from(value,(item,index)=>{
    if(!record(item))throw new Error(`第 ${index+1} 段播放设置无效。`);
    const {id,kind}=item;
    if(typeof id!=='string'||!id.trim()||ids.has(id))throw new Error('播放段编号须为非空且不重复的字符串。');
    ids.add(id);
    if(kind!=='fold'&&kind!=='hold')throw new Error(`第 ${index+1} 段须为折叠或停留。`);
    const duration=finite(item.duration,`第 ${index+1} 段时长`);
    if(duration<MIN_SIM_TARGET_ANIMATION_STEP_SECONDS||duration>MAX_SIM_TARGET_ANIMATION_STEP_SECONDS)throw new Error('每段时长须在 0.1 至 120 秒之间。');
    durationMs+=duration*1000;
    if(durationMs>MAX_SIM_TARGET_ANIMATION_DURATION_SECONDS*1000)throw new Error('目标播放序列总时长不能超过 600 秒。');
    if(kind==='hold')return {id,kind,duration};
    return {id,kind,target:percent(item.target,`第 ${index+1} 段目标折叠比例`),duration};
  });
}

/** Compile from the current target percentage; no implicit reset to zero is inserted. */
export function compileSimTargetAnimation(startPercent:number,steps:readonly SimTargetAnimationStep[]):SimTargetAnimationPath {
  const start=percent(startPercent,'起始折叠比例');
  const validated=validateSimTargetAnimationSteps(steps);
  let elapsed=0,last=start;
  const segments=validated.map(step=>{
    const from=last,to=step.kind==='hold'?from:step.target,startMs=elapsed;
    elapsed+=step.duration*1000;
    last=to;
    return Object.freeze({id:step.id,kind:step.kind,startMs,endMs:elapsed,from,to});
  });
  return Object.freeze({startPercent:start,endPercent:last,durationMs:elapsed,segments:Object.freeze(segments)});
}

function validatePath(path:SimTargetAnimationPath):void {
  if(!record(path))throw new Error('目标播放路径无效。');
  percent(path.startPercent,'路径起始比例');
  percent(path.endPercent,'路径结束比例');
  const duration=finite(path.durationMs,'路径总时长');
  if(duration<0||duration>MAX_SIM_TARGET_ANIMATION_DURATION_SECONDS*1000||!Array.isArray(path.segments)||path.segments.length>MAX_SIM_TARGET_ANIMATION_STEPS)throw new Error('目标播放路径超出允许范围。');
  let elapsed=0,last=path.startPercent;
  const ids=new Set<string>();
  for(const segment of path.segments){
    if(!record(segment)||typeof segment.id!=='string'||!segment.id.trim()||ids.has(segment.id))throw new Error('播放路径段无效。');
    ids.add(segment.id);
    const start=finite(segment.startMs,'播放段开始时间'),end=finite(segment.endMs,'播放段结束时间');
    percent(segment.from,'播放段起始比例');const to=percent(segment.to,'播放段结束比例');
    const span=end-start;
    if(start!==elapsed||span<MIN_SIM_TARGET_ANIMATION_STEP_SECONDS*1000-1e-7||span>MAX_SIM_TARGET_ANIMATION_STEP_SECONDS*1000+1e-7||segment.from!==last||(segment.kind!=='fold'&&segment.kind!=='hold')||(segment.kind==='hold'&&segment.from!==segment.to))throw new Error('播放路径必须连续且具有有效的时长和目标。');
    elapsed=end;last=to;
  }
  if(elapsed!==duration||last!==path.endPercent)throw new Error('播放路径的结束时间或目标不一致。');
}

/** Stateless sampling supports seeking backwards. Negative time samples the initial state. */
export function evaluateSimTargetAnimation(path:SimTargetAnimationPath,elapsedMs:number):SimTargetAnimationSample {
  const elapsed=Math.max(0,finite(elapsedMs,'播放时间'));
  validatePath(path);
  if(elapsed>=path.durationMs)return {percent:path.endPercent,done:true,stepIndex:path.segments.length-1};
  const stepIndex=path.segments.findIndex(segment=>elapsed<segment.endMs),segment=path.segments[stepIndex];
  const progress=(elapsed-segment.startMs)/(segment.endMs-segment.startMs);
  return {percent:segment.from+(segment.to-segment.from)*progress,done:false,stepIndex};
}
