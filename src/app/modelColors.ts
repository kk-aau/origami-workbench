export interface ModelColors {front:string;back:string;line:string}
export const defaultModelColors=():ModelColors=>({front:'#c5dac2',back:'#f3e6ce',line:'#41634e'});
export function validateModelColors(value:unknown):asserts value is ModelColors{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='back,front,line'||Object.values(value).some(v=>typeof v!=='string'||!/^#[0-9a-f]{6}$/i.test(v)))throw new Error('模型配色必须是三种有效的 RGB 颜色。');
}
