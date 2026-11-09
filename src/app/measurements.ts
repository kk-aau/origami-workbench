import type {Point} from '../core/types';
import {distance} from '../core/geometry';

export type LengthRegister='L1'|'L2';
export type AngleRegister='A1'|'A2'|'A3';
export type MeasurementRegister=LengthRegister|AngleRegister;
export type Measurements=Record<MeasurementRegister,number>;
export const emptyMeasurements=():Measurements=>({L1:0,L2:0,A1:0,A2:0,A3:0});
const registers:MeasurementRegister[]=['L1','L2','A1','A2','A3'];
function point(p:Point){if(!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6))throw new Error('测量点坐标须在 ±1000000 mm 内。');}

/** L registers use grid units, not physical mm. Pass the actual displayed grid spacing. */
export function measureLength(a:Point,b:Point,gridStepMm:number):{mm:number;grid:number;gridStepMm:number}{
  point(a);point(b);
  if(!Number.isFinite(gridStepMm)||gridStepMm<=0)throw new Error('测量所用网格间距必须为有限正数。');
  const mm=distance(a,b),grid=mm/gridStepMm;
  if(!Number.isFinite(grid))throw new Error('网格过密，测量值超出数值范围。');
  return{mm,grid,gridStepMm};
}

/** Preserve Oriedita's three distinct register conventions; do not normalize all to ±180. */
export function angleRegisterValue(degrees:number,register:AngleRegister):number{
  if(!['A1','A2','A3'].includes(register)||!Number.isFinite(degrees)||degrees<0||degrees>360)
    throw new Error('原始测量角须为 0–360°，并选择 A1／A2／A3。');
  const threshold={A1:180,A2:280,A3:380}[register];
  const value=degrees>threshold?degrees-360:degrees;
  return value===0?0:value;
}

/** Click first arm, vertex, second arm. Directed angle goes second ray → first ray. */
export function measureAngle(first:Point,vertex:Point,last:Point,register:AngleRegister):number{
  [first,vertex,last].forEach(point);
  if(distance(first,vertex)<=1e-6||distance(last,vertex)<=1e-6)throw new Error('角度测量的顶点不能与角边点重合或过近。');
  const degrees=(Math.atan2(first[1]-vertex[1],first[0]-vertex[0])-Math.atan2(last[1]-vertex[1],last[0]-vertex[0]))*180/Math.PI;
  return angleRegisterValue((degrees%360+360)%360,register);
}

export function setMeasurement(values:Measurements,register:MeasurementRegister,value:number):Measurements{
  if(!registers.includes(register)||!Number.isFinite(value)||(register.startsWith('L')&&value<0))throw new Error('测量寄存器或数值无效。');
  return values[register]===value?values:{...values,[register]:value};
}

/** Only a finite decimal literal or an exact register token; never eval arbitrary input. */
export function resolveMeasurementValue(input:string,values:Measurements):number{
  const text=input.trim();
  if(registers.includes(text as MeasurementRegister)){
    const value=values[text as MeasurementRegister];
    if(!Number.isFinite(value))throw new Error('引用的测量值无效，请重新测量。');
    return value;
  }
  if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text))
    throw new Error('请输入数字或 L1、L2、A1、A2、A3；不支持算术表达式。');
  const value=Number(text);
  if(!Number.isFinite(value))throw new Error('输入数值超出范围。');
  return value;
}
