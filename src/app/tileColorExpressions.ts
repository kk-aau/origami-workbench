/** A deliberately small, non-evaluating subset of Mathematica color expressions. */
type RGB=[number,number,number];

const NAMED_COLORS:Record<string,RGB>={
  Black:[0,0,0],Blue:[0,0,1],Brown:[.6,.4,.2],Cyan:[0,1,1],
  Gray:[.5,.5,.5],Green:[0,1,0],Magenta:[1,0,1],Orange:[1,.5,0],
  Pink:[1,.5,.5],Purple:[.5,0,.5],Red:[1,0,0],White:[1,1,1],Yellow:[1,1,0],
};
const MAX_LENGTH=160,MAX_DEPTH=8;
const component=(value:number)=>Math.round(value*255).toString(16).padStart(2,'0');
const hex=(rgb:RGB)=>`#${rgb.map(component).join('')}`;

/** Returns an opaque SVG RGB color, or null when a token or syntax is outside the supported subset. */
export function parseTileColorExpression(source:string):string|null{
  if(typeof source!=='string'||source.length===0||source.length>MAX_LENGTH)return null;
  const literal=source.trim();
  if(/^#[0-9a-fA-F]{6}$/.test(literal))return literal.toLowerCase();
  let index=0,nodes=0;
  const white=()=>{while(/\s/.test(source[index]??'')&&index<source.length)index++;};
  const take=(character:string)=>{white();if(source[index]!==character)throw Error('syntax');index++;};
  const number=():number=>{
    white();
    const first=/^(?:\d+(?:\.\d*)?|\.\d+)/.exec(source.slice(index));
    if(!first)throw Error('number');
    index+=first[0].length;
    let value=Number(first[0]);
    white();
    if(source[index]==='/'){
      index++;white();
      const denominator=/^(?:\d+(?:\.\d*)?|\.\d+)/.exec(source.slice(index));
      if(!denominator)throw Error('denominator');
      index+=denominator[0].length;
      value/=Number(denominator[0]);
    }
    if(!Number.isFinite(value)||value<0||value>1)throw Error('range');
    return value;
  };
  const numericArgs=(count:number):number[]=>{
    take('[');
    const values:number[]=[];
    for(let i=0;i<count;i++){
      if(i)take(',');
      values.push(number());
    }
    take(']');
    return values;
  };
  const color=(depth:number):RGB=>{
    if(++nodes>32||depth>MAX_DEPTH)throw Error('complexity');
    white();
    const token=/^[A-Za-z]+/.exec(source.slice(index));
    if(!token)throw Error('color');
    index+=token[0].length;
    const name=token[0];
    white();
    if(source[index]!=='['){
      if(!Object.hasOwn(NAMED_COLORS,name))throw Error('named color');
      return NAMED_COLORS[name];
    }
    if(name==='RGBColor')return numericArgs(3) as RGB;
    if(name==='GrayLevel'){
      const [gray]=numericArgs(1);
      return [gray,gray,gray];
    }
    if(name==='CMYKColor'){
      take('[');
      const cyan=number();take(',');
      const magenta=number();take(',');
      const yellow=number();white();
      let black=0;
      if(source[index]===','){index++;black=number();}
      take(']');
      // The unprofiled screen conversion, rather than a printer ICC transform.
      return [(1-cyan)*(1-black),(1-magenta)*(1-black),(1-yellow)*(1-black)];
    }
    if(name==='Hue'){
      take('[');
      const hue=number();
      let saturation=1,brightness=1;
      white();
      if(source[index]===','){
        index++;saturation=number();white();
        if(source[index]===','){index++;brightness=number();}
      }
      take(']');
      const h=(hue%1)*6,sector=Math.floor(h),fraction=h-sector;
      const p=brightness*(1-saturation),q=brightness*(1-saturation*fraction),t=brightness*(1-saturation*(1-fraction));
      return ([[brightness,t,p],[q,brightness,p],[p,brightness,t],[p,q,brightness],[t,p,brightness],[brightness,p,q]] as RGB[])[sector];
    }
    if(name==='Lighter'||name==='Darker'){
      take('[');
      const base=color(depth+1);
      white();
      let fraction=1/3;
      if(source[index]===','){index++;fraction=number();}
      take(']');
      return base.map(value=>name==='Lighter'?value*(1-fraction)+fraction:value*(1-fraction)) as RGB;
    }
    throw Error('function');
  };
  try{
    const rgb=color(0);
    white();
    return index===source.length?hex(rgb):null;
  }catch{return null;}
}
