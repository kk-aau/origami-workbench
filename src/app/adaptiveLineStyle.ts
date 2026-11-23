import {preferenceStorage} from './preferenceStorage';

export interface AdaptiveLineSpan {length:number;offset:number}
export interface AdaptiveLineOptions {enabled:boolean;units:number;span?:AdaptiveLineSpan;linecap?:'round'|'butt'}
export interface AdaptiveLineStroke {width:number;dash?:string;dashOffset?:number;limited:boolean}
export const ADAPTIVE_LINE_STYLE_KEY='zhezhi.adaptive-line-style.v1';
export const ADAPTIVE_LINE_STYLE_EVENT='zhezhi:adaptive-line-style-change';
export const MIN_GAP_PIXELS=.7;
export const MIN_WIDTH_PIXELS=.65;
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

/** Calibrate SVG path distance over the whole fold, including clipped pieces.
 * Both ends land halfway through the first ink dash of the repeating pattern. */
function fitDashEndpoints(length:number,dash:string|undefined,span?:AdaptiveLineSpan){
  const pattern=dash&&patternFor(dash),total=span?.length??length;
  if(!pattern||!finitePositive(total)||!finitePositive(length))return;
  const period=pattern.reduce((sum,value)=>sum+value,0);
  if(!finitePositive(period))return;
  const repeats=total/period,nearest=Math.round(repeats);
  // Rounding of an already adapted pattern must not drop a whole repeat.
  const count=Math.max(1,Math.abs(nearest-repeats)<1e-9?nearest:Math.floor(repeats));
  const scale=count*period/total;
  return {pathLength:length*scale,dashOffset:phaseOffset(pattern[0]/2,(span?.offset??0)*scale,period)};
}

/** Adapt one logical stroke, never its individual occlusion fragments. The
 * returned values affect presentation only; callers retain authored geometry,
 * width, custom dash ratios and material/CP identities unchanged. */
function adaptDashToLength(length:number,width:number,dash:string|undefined,options:AdaptiveLineOptions):AdaptiveLineStroke {
  const original:AdaptiveLineStroke={width,...(dash!==undefined?{dash}:{}),limited:false};
  if(!options.enabled||!dash)return original;
  const pattern=patternFor(dash);if(!pattern)return original;
  const period=pattern.reduce((sum,value)=>sum+value,0);if(!finitePositive(period))return original;
  const total=options.span?.length??length;
  const gapFloor=MIN_GAP_PIXELS*options.units,widthFloor=Math.min(width,MIN_WIDTH_PIXELS*options.units),rounded=options.linecap==='round';
  const inkFloor=MIN_WIDTH_PIXELS*options.units,capWidth=rounded?width:0;
  const gaps=pattern.filter((_,index)=>index%2===1),ink=pattern.filter((_,index)=>index%2===0),minGap=Math.min(...gaps),minInk=Math.min(...ink);
  const limited:AdaptiveLineStroke={width:widthFloor,limited:true};
  // World-space diagram patterns can become subpixel even on a very long
  // source line. Enlarge only such unreadable patterns before counting repeats.
  const inkScale=minInk>0?Math.max(0,inkFloor-capWidth)/minInk:capWidth>=inkFloor?1:Infinity;
  const pitchScale=Math.max(1,(gapFloor+capWidth)/minGap,inkScale),readablePeriod=period*pitchScale;
  if(!finitePositive(pitchScale)||!finitePositive(readablePeriod))return limited;
  const emitted=(scale:number)=>scale===1?dash:pattern.map(value=>Number((value*scale).toPrecision(12))).join(' ');
  if(total/readablePeriod>=2)return {width,dash:emitted(pitchScale),limited:false};
  for(const cycles of [2,1]){
    const scale=Math.min(pitchScale,total/period/cycles),scaledGap=minGap*scale;
    // Two round end caps together consume one stroke width from every gap.
    const availableWidth=rounded?scaledGap-gapFloor:width;
    if(scaledGap<gapFloor||availableWidth<widthFloor)continue;
    const shownWidth=Math.min(width,availableWidth);
    if(minInk*scale+(rounded?shownWidth:0)<inkFloor)continue;
    return {width:shownWidth,dash:emitted(scale),limited:false};
  }
  // At this zoom a readable gap is impossible even with one repeat. Keep a
  // visible, same-colour fine stroke; the caller can explain the display limit.
  return limited;
}

type StrokeDisplay = AdaptiveLineOptions & {pen?:'paper'|'pixels'};

/** length, span and the result use drawing coordinates. A paper pen follows the
 * drawing within a readable screen range; a pixel pen follows its UI setting. */
export function resolveLineStroke(length:number,width:number,dash:string|undefined,options:StrokeDisplay):AdaptiveLineStroke & {pathLength?:number} {
  options={...options,enabled:true};
  const units=options.units;
  if(!finitePositive(units)||!finitePositive(width)||!finitePositive(length)||options.span&&(!finitePositive(options.span.length)||!Number.isFinite(options.span.offset))){
    return {width,...(dash!==undefined?{dash}:{}),limited:false};
  }
  let scale=1;
  if(options.pen==='pixels')scale=units;
  if(options.pen==='paper'&&options.enabled)scale=Math.min(1,2.5*units);
  const scaledPattern=scale!==1&&dash?patternFor(dash):null;
  const pattern=scaledPattern?scaledPattern.map(value=>value*scale).join(' '):dash;
  const floor=options.pen==='paper'&&options.enabled?Math.min(MIN_WIDTH_PIXELS,width*1.5)*units:0;
  const penWidth=Math.max(width*scale,floor);
  const stroke=adaptDashToLength(length,penWidth,pattern,options);
  return stroke.dash?{...stroke,...fitDashEndpoints(length,stroke.dash,options.span)}:stroke;
}

/** SVG presentation attributes for finite segments, shared by editor previews. */
export function svgLineStroke(a:readonly number[],b:readonly number[],width:number,dash:string|undefined,options:StrokeDisplay){
  const stroke=resolveLineStroke(Math.hypot(b[0]-a[0],b[1]-a[1]),width,dash,options);
  return {strokeWidth:stroke.width,strokeDasharray:stroke.dash,strokeDashoffset:stroke.dashOffset,pathLength:stroke.pathLength};
}

export function readAdaptiveLineStyle(storage:Pick<Storage,'getItem'>=preferenceStorage):boolean {
  return true;
}
export function saveAdaptiveLineStyle(enabled:boolean,storage:Pick<Storage,'setItem'>=preferenceStorage):void {
  if(typeof enabled!=='boolean')throw new Error('自适应线型设置必须为布尔值。');
  storage.setItem(ADAPTIVE_LINE_STYLE_KEY,JSON.stringify({version:1,enabled}));
  if(typeof window!=='undefined')window.dispatchEvent(new Event(ADAPTIVE_LINE_STYLE_EVENT));
}
