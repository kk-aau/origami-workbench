import type {DiagramSymbolAnnotation,DiagramSymbolKind} from './diagramAnnotations';

/** Physical view instruction, independent of the glyph's placement rotation. */
export const DIAGRAM_DEFAULT_TURN_ANGLE=45;
export const isDiagramRotationSymbol=(kind:DiagramSymbolKind):boolean=>kind==='rotate'||kind==='rotateCCW';
type TurnSymbol=Pick<DiagramSymbolAnnotation,'symbol'|'turnAngle'|'mirrored'|'cadProperties'>;
export function diagramSymbolTurnAngle(annotation:Pick<TurnSymbol,'symbol'|'turnAngle'>):number{
  const angle=annotation.turnAngle??DIAGRAM_DEFAULT_TURN_ANGLE;
  if(!Number.isFinite(angle)||angle<0||angle>360)throw Error('旋转动作角度必须为 0 到 360 度之间的有限数字。');
  return angle;
}
/** Positive angles turn the next screen view clockwise. Reflections of either
 * the whole glyph or its original CAD flip action also reverse its arrow. */
export function diagramSymbolTurnDegrees(annotation:TurnSymbol):number{
  if(!isDiagramRotationSymbol(annotation.symbol))return 0;
  const reversed=(Number(annotation.symbol==='rotateCCW')+Number(annotation.mirrored===true)+Number(annotation.cadProperties?.['翻转状态1']===1))%2;
  return (reversed?-1:1)*diagramSymbolTurnAngle(annotation);
}
