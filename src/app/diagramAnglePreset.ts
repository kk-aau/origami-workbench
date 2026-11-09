export const DIAGRAM_ANGLE_PRESET_MIN=.5;
export const DIAGRAM_ANGLE_PRESET_MAX=90;

export function isValidDiagramAnglePreset(value:unknown):value is number{
  return typeof value==='number'&&Number.isFinite(value)&&(value===0||value>=DIAGRAM_ANGLE_PRESET_MIN&&value<=DIAGRAM_ANGLE_PRESET_MAX);
}

export function validateDiagramAnglePreset(value:unknown):asserts value is number{
  if(!isValidDiagramAnglePreset(value))throw new Error('预设角度须为自由绘制（0°），或 0.5 到 90 度之间的有限数，可输入小数。');
}

/** Axes start at 0°, advance by the requested increment while below 180°,
 * and repeat in the opposite half-turn. The final gap can be shorter; never
 * repeatedly wrap an increment around 180° and manufacture denser axes. */
export function diagramAnglePresetDirection(rawDegrees:number,stepDegrees:number):number{
  validateDiagramAnglePreset(stepDegrees);
  if(!Number.isFinite(rawDegrees))throw new Error('绘线方向无效。');
  if(stepDegrees===0)return rawDegrees;
  const raw=((rawDegrees%360)+360)%360,half=raw%180,lower=Math.floor(half/stepDegrees)*stepDegrees,upper=Math.min(180,lower+stepDegrees);
  // Prefer the higher axis at a tie, as the existing divided-angle tool does.
  // The tolerance only stabilizes round-off when reversing the same line.
  const tie=32*Number.EPSILON*360,axis=half-lower<upper-half-tie?lower:upper;
  return axis+(raw>=180?180:0);
}
