/** Coarse project-file filter; the backend parses and certifies every formula. */
export function validRingVectorFormulaText(value:unknown):value is string{
  if(typeof value!=='string'||value.length<1||value.length>120||
    !/^[A-Za-z0-9_+\-*/(),.\[\]{}^<>=:;\\\sφϕπτ°≤≥]+$/u.test(value))return false;
  let outside=value;
  while(true){
    const match=/\bModule\s*\[/.exec(outside);if(!match)break;
    const open=outside.indexOf('[',match.index);let end=open+1,depth=1;
    while(end<outside.length&&depth){if(outside[end]==='[')depth++;if(outside[end]===']')depth--;end++;}
    if(depth)return false;outside=outside.slice(0,match.index)+'0'+outside.slice(end);
  }
  return !/[;:]/.test(outside);
}
