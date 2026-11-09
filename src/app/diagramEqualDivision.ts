import type {Point} from '../core/types';
import {validateDiagramAnnotations,type DiagramSymbolAnnotation} from './diagramAnnotations';
import {buildCadSymbolGeometry} from './diagramCadSymbolGeometry';
import {cadAttributeDefinitions,cadPropertyDefinitions} from './diagramCadSymbols';

export interface DiagramEqualDivisionLabel {key:string;label:string;text:string;point:Point}
const LEFT_ATTRIBUTE='13648',RIGHT_ATTRIBUTE='13650';
const LEFT_DISTANCE='距离2',RIGHT_DISTANCE='距离1';

function world(annotation:DiagramSymbolAnnotation,point:Point):Point{
  const radians=annotation.rotation*Math.PI/180,x=point[0]*annotation.size/100*(annotation.mirrored?-1:1),y=point[1]*annotation.size/100;
  return [annotation.position[0]+x*Math.cos(radians)-y*Math.sin(radians),annotation.position[1]+x*Math.sin(radians)+y*Math.cos(radians)];
}

/** Original ATTDEF identities and evaluated label positions, shared by inline
 * editing and exports. These labels are lengths/ratios, not a tick count. */
export function diagramEqualDivisionLabels(annotation:DiagramSymbolAnnotation):DiagramEqualDivisionLabel[]{
  if(annotation.symbol!=='equalDivision')return [];
  const geometry=buildCadSymbolGeometry(annotation);
  return cadAttributeDefinitions(annotation.symbol).flatMap(definition=>{
    const text=geometry.primitives.find(primitive=>primitive.kind==='text'&&String(primitive.sourceHandle)===definition.key);
    return text?.kind==='text'?[{key:definition.key,label:definition.label,text:text.text,point:world(annotation,text.point)}]:[];
  });
}

/** The two verified source LINE entities retain the outer extent even if the
 * original-plugin grip policy changes. Whole-symbol mirrors/rotation apply too. */
function outerCenter(annotation:DiagramSymbolAnnotation):Point{
  const geometry=buildCadSymbolGeometry(annotation),left=geometry.primitives.find(primitive=>primitive.sourceHandle===13646&&primitive.kind==='path'),right=geometry.primitives.find(primitive=>primitive.sourceHandle===13647&&primitive.kind==='path');
  if(left?.kind!=='path'||!left.start||right?.kind!=='path'||!right.end)throw new Error('等分标记缺少原始左右线段。');
  return world(annotation,[(left.start[0]+right.end[0])/2,(left.start[1]+right.end[1])/2]);
}

function positiveNumber(text:string,label:string):number{
  const value=Number(text);
  if(!text.trim()||!/^\s*(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?\s*$/i.test(text)||!Number.isFinite(value)||value<=0)throw new Error(`${label}须为大于零的有限数字，可输入小数。`);
  return value;
}

/** An explicit numeric edit changes both its ATTDEF and the two native Stretch
 * distances. Saved illustrations are untouched until the user makes this edit;
 * the old total span and its world-space center remain fixed. */
export function editDiagramEqualDivisionRatio(annotation:DiagramSymbolAnnotation,key:string,value:string):DiagramSymbolAnnotation{
  if(annotation.symbol!=='equalDivision'||![LEFT_ATTRIBUTE,RIGHT_ATTRIBUTE].includes(key))throw new Error('请选择等分标记的长度1或长度2。');
  validateDiagramAnnotations([annotation]);
  const labels=diagramEqualDivisionLabels(annotation),leftText=key===LEFT_ATTRIBUTE?value:labels.find(label=>label.key===LEFT_ATTRIBUTE)!.text,rightText=key===RIGHT_ATTRIBUTE?value:labels.find(label=>label.key===RIGHT_ATTRIBUTE)!.text;
  const left=positiveNumber(leftText,'长度1'),right=positiveNumber(rightText,'长度2'),definitions=cadPropertyDefinitions(annotation.symbol),leftDefinition=definitions.find(definition=>definition.key===LEFT_DISTANCE)!,rightDefinition=definitions.find(definition=>definition.key===RIGHT_DISTANCE)!;
  const total=(annotation.cadProperties?.[LEFT_DISTANCE]??leftDefinition.defaultValue)+(annotation.cadProperties?.[RIGHT_DISTANCE]??rightDefinition.defaultValue),scale=Math.max(left,right),sum=left/scale+right/scale,leftDistance=total*(left/scale)/sum,rightDistance=total*(right/scale)/sum;
  if(leftDistance<leftDefinition.min||leftDistance>leftDefinition.max||rightDistance<rightDefinition.min||rightDistance>rightDefinition.max)throw new Error('此比例超出等分标记的可用长度范围，请使用较接近的比例。');
  const next:DiagramSymbolAnnotation={...structuredClone(annotation),cadAttributes:{...annotation.cadAttributes,[key]:value.trim()},cadProperties:{...annotation.cadProperties,[LEFT_DISTANCE]:leftDistance,[RIGHT_DISTANCE]:rightDistance}};
  const before=outerCenter(annotation),after=outerCenter(next);next.position=[next.position[0]+before[0]-after[0],next.position[1]+before[1]-after[1]];
  validateDiagramAnnotations([next]);return next;
}
