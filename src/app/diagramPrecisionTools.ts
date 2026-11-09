import type {Point,Segment} from '../core/types';
import {ratioParameter} from './segmentTools';
import {snapAnglePoint,snapAnglePointOnDirection,type AngleSnapOptions} from './angleSystem';
import {validateDiagramAnglePreset,diagramAnglePresetDirection} from './diagramAnglePreset';

function validPoint(point:Point):void{
  if(!Array.isArray(point)||point.length!==2||point.some(value=>!Number.isFinite(value)||Math.abs(value)>1e6))
    throw new Error('取点坐标须为 ±1000000 内的有限数。');
}

function internalPoint(a:Point,b:Point,t:number):Point{
  validPoint(a);validPoint(b);
  if(!Number.isFinite(t)||t<=0||t>=1)throw new Error('分点比例须满足 0 < AP/AB < 1。');
  if(Math.hypot(b[0]-a[0],b[1]-a[1])<=1e-6)throw new Error('两个取点端点不能重合或过近。');
  const result:Point=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];
  if((result[0]===a[0]&&result[1]===a[1])||(result[0]===b[0]&&result[1]===b[1]))
    throw new Error('比例过于悬殊，分点与端点无法区分。');
  validPoint(result);return result;
}

/** AP:PB=m:n, measured from the first selected endpoint toward the second. */
export function diagramRatioPoint(a:Point,b:Point,m:number,n:number):Point{
  return internalPoint(a,b,ratioParameter(m,n));
}

/**
 * Parse arithmetic only: decimals, √, sqrt(...), +, -, *, / and parentheses.
 * Division requires a positive divisor; no variables, property access or code.
 */
export function evaluateDiagramRatio(expression:string):number{
  if(typeof expression!=='string'||expression.length>256||!expression.trim())
    throw new Error('请输入不超过 256 字符的取点比例算式。');
  const source=expression.replaceAll('−','-').replaceAll('×','*').replaceAll('÷','/');
  let cursor=0,operations=0;
  const fail=()=>{throw new Error('比例算式无效，仅支持数字、√、sqrt、加减乘除和括号。');};
  const skip=()=>{while(/\s/.test(source[cursor]??'')&&cursor<source.length)cursor++;};
  const take=(token:string):boolean=>{skip();if(!source.startsWith(token,cursor))return false;cursor+=token.length;return true;};
  const finite=(value:number):number=>{
    if(++operations>128)throw new Error('比例算式过长，请简化。');
    if(!Number.isFinite(value))throw new Error('比例计算超出有限数范围。');
    return value;
  };
  const root=(value:number):number=>{
    if(value<0)throw new Error('根号内数值不能为负。');
    return finite(Math.sqrt(value));
  };
  function primary(depth:number):number{
    if(depth>32)throw new Error('比例算式括号嵌套过多，请简化。');
    if(take('(')){const value=addition(depth+1);if(!take(')'))return fail();return value;}
    if(take('sqrt')){
      if(!take('('))return fail();
      const value=addition(depth+1);if(!take(')'))return fail();return root(value);
    }
    skip();
    const number=source.slice(cursor).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
    if(!number)return fail();cursor+=number[0].length;return finite(Number(number[0]));
  }
  function unary(depth:number):number{
    if(depth>32)throw new Error('比例算式嵌套过多，请简化。');
    if(take('+'))return finite(unary(depth+1));
    if(take('-'))return finite(-unary(depth+1));
    if(take('√'))return root(unary(depth+1));
    return primary(depth);
  }
  function product(depth:number):number{
    let value=unary(depth);
    while(true){
      if(take('*'))value=finite(value*unary(depth));
      else if(take('/')){
        const denominator=unary(depth);
        if(denominator<=0)throw new Error('除数须为正数，不能为零或负数。');
        value=finite(value/denominator);
      }else return value;
    }
  }
  function addition(depth:number):number{
    let value=product(depth);
    while(true){
      if(take('+'))value=finite(value+product(depth));
      else if(take('-'))value=finite(value-product(depth));
      else return value;
    }
  }
  const result=addition(0);skip();if(cursor!==source.length)return fail();
  if(result<=0||result>=1)throw new Error('取点比例 AP/AB 须大于 0 且小于 1。');
  return result;
}

/** expression is AP/AB (not AP:PB); P stays strictly inside segment AB. */
export function diagramSpecialPoint(a:Point,b:Point,expression:string):Point{
  return internalPoint(a,b,evaluateDiagramRatio(expression));
}

export interface DiagramAngleOptions {
  /** Baseline direction in document coordinates; defaults to horizontal. */
  baselineDegrees?:number;
  radius?:number;
  vertices?:Point[];
  segments?:Segment[];
  eps?:number;
}

/**
 * 0 leaves the pointer free. Other increments select axes in each half-turn;
 * increments need not divide 180° (e.g. 17.3° and 37.5° are supported).
 * Reuses the crease editor's orthogonal projection and finite, same-ray snapping.
 */
export function diagramAnglePoint(anchor:Point,pointer:Point,stepDegrees:number,options:DiagramAngleOptions={}):Point{
  validPoint(anchor);validPoint(pointer);
  validateDiagramAnglePreset(stepDegrees);
  const {baselineDegrees=0,radius=0,vertices=[],segments=[],eps=1e-6}=options;
  if(!Number.isFinite(baselineDegrees)||!Number.isFinite(radius)||radius<0||!Number.isFinite(eps)||eps<=0)
    throw new Error('角度基线、吸附半径或容差无效。');
  if(stepDegrees===0)return[...pointer];
  const divider=180/stepDegrees;
  const project=(origin:Point,target:Point,snapping:AngleSnapOptions):Point=>Number.isInteger(divider)
    ?snapAnglePoint(origin,target,{kind:'divided',divider},snapping)
    :snapAnglePointOnDirection(origin,target,diagramAnglePresetDirection(Math.atan2(target[1]-origin[1],target[0]-origin[0])*180/Math.PI,stepDegrees),snapping);
  if(baselineDegrees%360===0)return project(anchor,pointer,{radius,vertices,segments,eps});

  // An origin-centred scaled frame keeps valid world coordinates inside the
  // existing editor's coordinate bounds even near a paper's far corner.
  const points=[pointer,...vertices,...segments.flatMap(segment=>[segment.a,segment.b])];
  let longest=0;
  for(const point of points){validPoint(point);longest=Math.max(longest,Math.hypot(point[0]-anchor[0],point[1]-anchor[1]));}
  const scale=Math.max(1,2*longest/1e6),radians=(baselineDegrees%360)*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians);
  const local=(point:Point):Point=>{
    const x=(point[0]-anchor[0])/scale,y=(point[1]-anchor[1])/scale;
    return[c*x+s*y,-s*x+c*y];
  };
  const point=project([0,0],local(pointer),{
    radius:radius/scale,eps:eps/scale,vertices:vertices.map(local),
    segments:segments.map(segment=>({...segment,a:local(segment.a),b:local(segment.b)})),
  });
  const result:Point=[anchor[0]+scale*(c*point[0]-s*point[1]),anchor[1]+scale*(s*point[0]+c*point[1])];
  // Rotating a boundary point out and back can exceed the exact coordinate
  // bound by a few floating-point units. Only remove that round-off noise.
  const noise=16*Number.EPSILON*1e6;
  for(const axis of [0,1] as const)if(Math.abs(result[axis])>1e6&&Math.abs(result[axis])-1e6<=noise)
    result[axis]=Math.sign(result[axis])*1e6;
  validPoint(result);return result;
}
