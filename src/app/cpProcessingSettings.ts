import type {Assignment,Point} from '../core/types';
import type {CPPathOptimizerOptions} from '../core/cpPathOptimizer';

export const PROCESSING_ASSIGNMENTS:Assignment[]=['M','V','B','A','U','F'];
export const PROCESSING_LABELS:Record<Assignment,string>={M:'山折',V:'谷折',B:'边界',A:'辅助',U:'未指派',F:'展开线'};
export const PROCESSING_COLORS:Record<Assignment,string>={M:'#c54248',V:'#3568c7',B:'#354b40',A:'#21969b',U:'#8b6a46',F:'#6b8191'};
export interface ProcessingSettingDraft {
  enabled:boolean;operation:'crease';tool:string;speed:string;pressure:string;passes:string;
}
export type ProcessingSettingsDraft=Record<Assignment,ProcessingSettingDraft>;
export function defaultProcessingSettings():ProcessingSettingsDraft {
  return Object.fromEntries(PROCESSING_ASSIGNMENTS.map(assignment=>[assignment,{
    enabled:true,operation:'crease',
    tool:'压痕工具',speed:'',pressure:'',passes:'1',
  }])) as ProcessingSettingsDraft;
}
function optionalNumber(value:string,label:string):number|null {
  if(!value.trim())return null;
  const number=Number(value);
  if(!Number.isFinite(number)||number<0||number>1_000_000)throw Error(`${label}须为 0—1,000,000 的有限数值，或留空。`);
  return number;
}
/** These labels are an export grouping contract, never device commands. */
export function processingOptions(settings:ProcessingSettingsDraft,mergeSameSettings:boolean,retainOverlaps:boolean,origin:Point,pathMode:CPPathOptimizerOptions['pathMode']='collinear',parameters:{maxTurns?:string;maxMergedLength?:string;maxMergedSegments?:string}={}):CPPathOptimizerOptions {
  if(!origin.every(n=>Number.isFinite(n)&&Math.abs(n)<=1_000_000))throw Error('空走起点须为 ±1,000,000 毫米内的有限坐标。');
  const profiles=Object.fromEntries(PROCESSING_ASSIGNMENTS.map(assignment=>{
    const row=settings[assignment],label=PROCESSING_LABELS[assignment],passes=Number(row.passes);
    if(!row.enabled)return [assignment,{enabled:false}];
    if(row.operation!=='crease')throw Error('加工方式固定为压痕。');
    if(!row.tool.trim()||row.tool.length>80)throw Error(`${label}工具名称须为 1—80 个字符。`);
    if(!row.passes.trim()||!Number.isInteger(passes)||passes<1||passes>20)throw Error(`${label}加工次数须为 1—20 的整数。`);
    const speed=optionalNumber(row.speed,`${label}速度`),pressure=optionalNumber(row.pressure,`${label}压力`);
    return [assignment,{enabled:true,groupId:assignment,passes,
      settingsKey:JSON.stringify({operation:row.operation,tool:row.tool.trim(),speed,pressure,passes})}];
  }));
  let maxTurns:number|null=null,maxMergedLength:number|null=null,maxMergedSegments:number|null=null;
  if(pathMode==='continuous'){
    const value=parameters.maxTurns??'1';maxTurns=Number(value);
    if(!value.trim()||!Number.isInteger(maxTurns)||maxTurns<0||maxTurns>48_000)throw Error('每条规划路径的转弯上限须为 0—48,000 的整数。');
  }else if(pathMode==='collinear'){
    if(parameters.maxMergedLength?.trim()){
      maxMergedLength=Number(parameters.maxMergedLength);
      if(!Number.isFinite(maxMergedLength)||maxMergedLength<=0||maxMergedLength>3_000_000)throw Error('最大合并长度须大于零且不超过 3,000,000 毫米，或留空。');
    }
    if(parameters.maxMergedSegments?.trim()){
      maxMergedSegments=Number(parameters.maxMergedSegments);
      if(!Number.isInteger(maxMergedSegments)||maxMergedSegments<1||maxMergedSegments>48_000)throw Error('最多合并段数须为 1—48,000 的整数，或留空。');
    }
  }
  return {profiles,pathMode,maxTurns,maxMergedLength,maxMergedSegments,optimizeTravel:false,mergeSameSettings,overlapPolicy:retainOverlaps?'retain':'reject',origin:[...origin]};
}
