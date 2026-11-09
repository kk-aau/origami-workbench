import {preferenceStorage} from './preferenceStorage';

export interface AdaptiveLineSpan {length:number;offset:number}
export interface AdaptiveLineOptions {enabled:boolean;units:number;span?:AdaptiveLineSpan;linecap?:'round'|'butt'}
export interface AdaptiveLineStroke {width:number;dash?:string;dashOffset?:number;limited:boolean}
export const ADAPTIVE_LINE_STYLE_KEY='zhezhi.adaptive-line-style.v1';
export const ADAPTIVE_LINE_STYLE_EVENT='zhezhi:adaptive-line-style-change';
const MIN_GAP_PIXELS=.7;
const MIN_WIDTH_PIXELS=.65;
const finitePositive=(value:number)=>Number.isFinite(value)&&value>0;
const DASH_TOKEN='\\+?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?';
const DASH_PATTERN=new RegExp(`^\\s*${DASH_TOKEN}(?:(?:\\s*,\\s*|\\s+)${DASH_TOKEN})*\\s*$`);
// A canvas has thousands of strokes but only a few dash styles at each zoom.
// Bound this cache because world-space patterns may change continuously.
const patternCache=new Map<string,number[]|null>();

function patternFor(dash:string):number[]|null {
  if(dash.length>1024)return null;
  if(patternCache.has(dash))return patternCache.get(dash)!;
  if(!DASH_PATTERN.test(dash))return null;
  const pattern=dash.trim().split(/[\s,]+/).map(Number);
  if(pattern.length>64||pattern.some(value=>!Number.isFinite(value)||value<0))return null;
  const result=pattern.length%2?[...pattern,...pattern]:pattern;
  if(patternCache.size>=64)patternCache.delete(patternCache.keys().next().value!);
  patternCache.set(dash,result);return result;
}
function phaseOffset(phase:number,offset:number,period:number):number {
  const remainder=offset%period,value=((phase+remainder)%period+period)%period;
  return value===0?0:value;
}

/** Adapt one logical stroke, never its individual occlusion fragments. The
 * returned values affect presentation only; callers retain authored geometry,
 * width, custom dash ratios and material/CP identities unchanged. */
export function adaptiveLineStroke(length:number,width:number,dash:string|undefined,options:AdaptiveLineOptions):AdaptiveLineStroke {
  const original:AdaptiveLineStroke={width,...(dash!==undefined?{dash}:{}),limited:false};
  if(!options.enabled||!dash||!finitePositive(width)||!finitePositive(options.units)||!finitePositive(length))return original;
  const pattern=patternFor(dash);if(!pattern)return original;
  const period=pattern.reduce((sum,value)=>sum+value,0);if(!finitePositive(period))return original;
  const total=options.span?.length??length,offset=options.span?.offset??0;
  if(!finitePositive(total)||!Number.isFinite(offset))return original;
  const gapFloor=MIN_GAP_PIXELS*options.units,widthFloor=Math.min(width,MIN_WIDTH_PIXELS*options.units),rounded=options.linecap==='round';
  const inkFloor=MIN_WIDTH_PIXELS*options.units,capWidth=rounded?width:0;
  const gaps=pattern.filter((_,index)=>index%2===1),ink=pattern.filter((_,index)=>index%2===0),minGap=Math.min(...gaps),minInk=Math.min(...ink);
  const limited:AdaptiveLineStroke={width:widthFloor,limited:true};
  // World-space diagram patterns can become subpixel even on a very long
  // source line. Enlarge only such unreadable patterns before counting repeats.
  const inkScale=minInk>0?Math.max(0,inkFloor-capWidth)/minInk:capWidth>=inkFloor?1:Infinity;
  const pitchScale=Math.max(1,(gapFloor+capWidth)/minGap,inkScale),readablePeriod=period*pitchScale;
  if(!finitePositive(pitchScale)||!finitePositive(readablePeriod))return limited;
  const emitted=(scale:number)=>{
    const numbers=scale===1?pattern:pattern.map(value=>Number((value*scale).toPrecision(12)));
    return {dash:scale===1?dash:numbers.join(' '),numbers,period:numbers.reduce((sum,value)=>sum+value,0)};
  };
  if(total/readablePeriod>=2){
    const shown=emitted(pitchScale),dashOffset=phaseOffset(0,offset,shown.period),stroke=pitchScale===1?original:{width,dash:shown.dash,limited:false};
    return dashOffset?{...stroke,dashOffset}:stroke;
  }
  for(const cycles of [2,1]){
    const scale=Math.min(pitchScale,total/period/cycles),scaledGap=minGap*scale;
    // Two round end caps together consume one stroke width from every gap.
    const availableWidth=rounded?scaledGap-gapFloor:width;
    if(scaledGap<gapFloor||availableWidth<widthFloor)continue;
    const shownWidth=Math.min(width,availableWidth);
    if(minInk*scale+(rounded?shownWidth:0)<inkFloor)continue;
    const shown=emitted(scale);if(!finitePositive(shown.period))continue;
    return {width:shownWidth,dash:shown.dash,dashOffset:phaseOffset(shown.numbers[0]/2,offset,shown.period),limited:false};
  }
  // At this zoom a readable gap is impossible even with one repeat. Keep a
  // visible, same-colour fine stroke; the caller can explain the display limit.
  return limited;
}

export function readAdaptiveLineStyle(storage:Pick<Storage,'getItem'>=preferenceStorage):boolean {
  try{
    const raw=storage.getItem(ADAPTIVE_LINE_STYLE_KEY);if(raw===null)return true;
    const value=JSON.parse(raw);
    return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===2&&value.version===1&&typeof value.enabled==='boolean'?value.enabled:true;
  }catch{return true;}
}
export function saveAdaptiveLineStyle(enabled:boolean,storage:Pick<Storage,'setItem'>=preferenceStorage):void {
  if(typeof enabled!=='boolean')throw new Error('自适应线型设置必须为布尔值。');
  storage.setItem(ADAPTIVE_LINE_STYLE_KEY,JSON.stringify({version:1,enabled}));
  if(typeof window!=='undefined')window.dispatchEvent(new Event(ADAPTIVE_LINE_STYLE_EVENT));
}
