import {parseTileColorExpression} from './tileColorExpressions';

export type GraphicsPoint=[number,number];
export type GraphicsPalette={textColor:string;lineColor:string;fillColor:string};
export type TileGraphicsSpec={source:string;frame:GraphicsPoint[]};
export type GraphicsStroke={color:string;width:number;cap:'butt'|'round'|'square';join:'miter'|'round'|'bevel';dash?:number[]};
export type TileGraphicsPrimitive={kind:'point'|'line'|'polygon'|'text';points:GraphicsPoint[];paths?:GraphicsPoint[][];placementMode?:'rows';color:string;stroke:GraphicsStroke|null;fontSize:number;pointSize:number;text?:string;offset?:GraphicsPoint;direction?:GraphicsPoint};
export const MAX_TILE_GRAPHICS_SOURCE=8192;
const MAX_POINTS=512,MAX_PRIMITIVES=128,MAX_COORDINATE=1e6;
type Expr={kind:'number';value:number;source:string}|{kind:'string';value:string;source:string}|{kind:'symbol';value:string;source:string}|{kind:'list';args:Expr[];source:string}|{kind:'call';head:string;args:Expr[];source:string}|{kind:'rule';left:Expr;right:Expr;source:string};
type Style={color:string;stroke:GraphicsStroke;edge:GraphicsStroke|null;face:string|null|undefined;fontSize:number;pointSize:number};
const defaultPalette:GraphicsPalette={textColor:'#1f140a',lineColor:'#ff8000',fillColor:'#bb9977'};
const fail=():never=>{throw Error('unsupported tile graphics');};
const numeric=(node:Expr):number=>node.kind==='number'?node.value:fail();
const list=(node:Expr):Expr[]=>node.kind==='list'?node.args:fail();
const clone=(style:Style):Style=>({...style,stroke:{...style.stroke},edge:style.edge?{...style.edge}:null});
const bounded=(value:number,min:number,max:number)=>Number.isFinite(value)&&value>=min&&value<=max?value:fail();
const lighter=(color:string,fraction:number)=>'#'+[1,3,5].map(i=>Math.round(parseInt(color.slice(i,i+2),16)*(1-fraction)+255*fraction).toString(16).padStart(2,'0')).join('');

/** No evaluation: only literals, lists, supported heads and FontSize rules. */
function parse(source:string):Expr{
  let index=0,nodes=0;
  const white=()=>{while(index<source.length&&/\s/.test(source[index]))index++;};
  const take=(c:string)=>{white();if(source[index++]!==c)fail();};
  const expression=(depth:number):Expr=>{
    if(++nodes>4096||depth>20)fail();
    white();const start=index;let result:Expr;
    if(source[index]==='{'){
      index++;const args:Expr[]=[];white();
      if(source[index]!=='}')for(;;){args.push(expression(depth+1));white();if(source[index]!==',')break;index++;}
      take('}');result={kind:'list',args,source:source.slice(start,index)};
    }else if(source[index]==='"'){
      index++;let value='';
      while(index<source.length&&source[index]!=='"'){
        let character=source[index++];
        if(character==='\\'){character=source[index++];if(character!=='"'&&character!=='\\')fail();}
        if(!character||/[\x00-\x1f\x7f]/.test(character))fail();
        value+=character;if(value.length>128)fail();
      }
      take('"');result={kind:'string',value,source:source.slice(start,index)};
    }else{
      const literal=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:(?:[eE]|\*\^)[+-]?\d+)?/.exec(source.slice(index));
      if(literal){
        index+=literal[0].length;let value=Number(literal[0].replace('*^','e'));white();
        if(source[index]==='/'){
          index++;white();const denominator=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:(?:[eE]|\*\^)[+-]?\d+)?/.exec(source.slice(index));
          if(!denominator)fail();index+=denominator![0].length;value/=Number(denominator![0].replace('*^','e'));
        }
        if(!Number.isFinite(value))fail();result={kind:'number',value,source:source.slice(start,index)};
      }else{
        const symbol=/^[A-Za-z][A-Za-z0-9]*/.exec(source.slice(index));if(!symbol)fail();
        index+=symbol![0].length;white();
        if(source[index]==='['){
          index++;const args:Expr[]=[];white();
          if(source[index]!==']')for(;;){args.push(expression(depth+1));white();if(source[index]!==',')break;index++;}
          take(']');result={kind:'call',head:symbol![0],args,source:source.slice(start,index)};
        }else result={kind:'symbol',value:symbol![0],source:source.slice(start,index)};
      }
    }
    white();
    if(source.slice(index,index+2)==='->'){
      index+=2;const right=expression(depth+1);result={kind:'rule',left:result,right,source:source.slice(start,index)};
    }
    return result;
  };
  const root=expression(0);white();if(index!==source.length)fail();return root;
}

/** Origamica In[2786], FunctionTransform In[76] and MatrixTransform In[78].
 * The result is a finite display list, never an executable Wolfram expression.
 */
export function parseTileGraphicsSource(source:string,palette:GraphicsPalette=defaultPalette):TileGraphicsPrimitive[]|null{
  if(typeof source!=='string'||!source.trim()||source.length>MAX_TILE_GRAPHICS_SOURCE)return null;
  try{
    const root=parse(source),result:TileGraphicsPrimitive[]=[];
    let pointCount=0;
    const color=(node:Expr)=>parseTileColorExpression(node.source)??fail();
    const directive=(node:Expr,style:Style):boolean=>{
      if(node.kind==='list'){for(const item of node.args)if(!directive(item,style))fail();return true;}
      if(node.kind==='symbol'&&node.value.startsWith('Tiling')){
        if(node.value==='TilingText'){style.color=palette.textColor;style.stroke.color=palette.textColor;}
        else if(node.value==='TilingLine'){style.color=palette.lineColor;style.stroke={color:palette.lineColor,width:1,cap:'round',join:'round'};}
        else if(['TilingNoFill','TilingLightFill','TilingMedFill','TilingDarkFill'].includes(node.value)){
          style.edge=null;style.face=node.value==='TilingNoFill'?null:node.value==='TilingLightFill'?lighter(palette.fillColor,.7):node.value==='TilingMedFill'?lighter(palette.fillColor,.5):palette.fillColor;
        }else fail();return true;
      }
      const parsedColor=parseTileColorExpression(node.source);
      if(parsedColor){style.color=parsedColor;style.stroke.color=parsedColor;return true;}
      if(node.kind==='rule'){
        if(node.left.kind!=='symbol'||node.left.value!=='FontSize')fail();
        style.fontSize=bounded(numeric(node.right),6,72);return true;
      }
      if(node.kind!=='call')return false;
      const {head,args}=node;
      if(head==='Directive'){for(const item of args)if(!directive(item,style))fail();return true;}
      if(head==='AbsoluteThickness'||head==='AbsolutePointSize'){
        if(args.length!==1)fail();const value=bounded(numeric(args[0]),.1,head==='AbsoluteThickness'?12:32);
        if(head==='AbsoluteThickness')style.stroke.width=value;else style.pointSize=value;return true;
      }
      if(head==='Dashing'||head==='AbsoluteDashing'){
        if(args.length!==1)fail();const values=list(args[0]);
        // In[2785] resets AbsoluteDashing[{}]; original RenderTile output also
        // uses finite {3,3} dash lengths. Relative nonempty Dashing is excluded.
        if(head==='Dashing'&&values.length||values.length>16)fail();
        const dash=values.map(value=>bounded(numeric(value),0,64));
        if(dash.length&&!dash.some(value=>value>0))fail();
        if(dash.length)style.stroke.dash=dash;else delete style.stroke.dash;
        return true;
      }
      if(head==='CapForm'||head==='JoinForm'){
        if(args.length!==1||args[0].kind!=='string')fail();
        const value=(args[0] as Extract<Expr,{kind:'string'}>).value;
        const values=head==='CapForm'?{Butt:'butt',Round:'round',Square:'square'}:{Miter:'miter',Round:'round',Bevel:'bevel'};
        if(!Object.hasOwn(values,value))fail();
        if(head==='CapForm')style.stroke.cap=values[value as keyof typeof values] as GraphicsStroke['cap'];
        else style.stroke.join=values[value as keyof typeof values] as GraphicsStroke['join'];return true;
      }
      if(head==='EdgeForm'){
        if(!args.length||args.length===1&&args[0].kind==='symbol'&&args[0].value==='None')style.edge=null;
        else if(args.length===1){const edge=clone(style);if(!directive(args[0],edge))fail();style.edge={...edge.stroke};}
        else fail();return true;
      }
      if(head==='FaceForm'){
        if(!args.length||args.length===1&&args[0].kind==='symbol'&&args[0].value==='None')style.face=null;
        else if(args.length===1)style.face=color(args[0]);else fail();return true;
      }
      return false;
    };
    const point=(node:Expr,vertices?:GraphicsPoint[]):GraphicsPoint=>{
      if(vertices){const index=numeric(node);if(!Number.isInteger(index)||index<1||index>vertices.length)fail();return vertices[index-1];}
      const values=list(node);if(values.length!==2)fail();return values.map(value=>bounded(numeric(value),-MAX_COORDINATE,MAX_COORDINATE)) as GraphicsPoint;
    };
    type Matrix=[GraphicsPoint,GraphicsPoint];
    const transformedPoint=(p:GraphicsPoint,matrices:Matrix[]):GraphicsPoint=>matrices.reduce<GraphicsPoint>((value,m)=>[
      m[0][0]*value[0]+m[0][1]*value[1],m[1][0]*value[0]+m[1][1]*value[1]],p).map(value=>bounded(value,-MAX_COORDINATE,MAX_COORDINATE)) as GraphicsPoint;
    // FunctionTransform does f[x] for Point and f /@ x for Line/Polygon.
    // m.# contracts the first list axis; it is not a recursive coordinate map.
    const transformedRows=(rows:GraphicsPoint[],matrices:Matrix[]):GraphicsPoint[]=>{
      if(matrices.length&&rows.length!==2)fail();
      return matrices.reduce<GraphicsPoint[]>((value,m)=>[
        [m[0][0]*value[0][0]+m[0][1]*value[1][0],m[0][0]*value[0][1]+m[0][1]*value[1][1]],
        [m[1][0]*value[0][0]+m[1][1]*value[1][0],m[1][0]*value[0][1]+m[1][1]*value[1][1]]],rows)
        .map(row=>row.map(value=>bounded(value,-MAX_COORDINATE,MAX_COORDINATE)) as GraphicsPoint);
    };
    const walk=(node:Expr,inherited:Style,matrices:Matrix[],vertices?:GraphicsPoint[]):void=>{
      if(node.kind==='list'){
        const local=clone(inherited);
        for(const item of node.args){if(item.kind==='list'){walk(item,local,matrices,vertices);continue;}if(!directive(item,local))walk(item,local,matrices,vertices);}
        return;
      }
      if(node.kind!=='call')fail();const {head,args}=node as Extract<Expr,{kind:'call'}>;
      if(head==='Graphics'){if(args.length!==1||vertices)fail();walk(args[0],clone(inherited),matrices);return;}
      if(head==='Style'){
        if(args.length<2)fail();const local=clone(inherited);
        // Explicit Style settings use their first occurrence; list directives
        // still execute in order inside their own scope.
        for(const item of args.slice(1).reverse())if(!directive(item,local))fail();walk(args[0],local,matrices,vertices);return;
      }
      if(head==='MatrixTransform'){
        if(args.length!==2)fail();const rows=list(args[1]);if(rows.length!==2)fail();
        const matrix=rows.map(row=>list(row).map(value=>bounded(numeric(value),-100,100)));if(matrix.some(row=>row.length!==2))fail();
        walk(args[0],clone(inherited),[matrix as Matrix,...matrices],vertices);return;
      }
      if(head==='GraphicsComplex'){
        if(args.length!==2||vertices)fail();const coordinates=list(args[0]).map(item=>point(item));
        if(!coordinates.length||coordinates.length>MAX_POINTS)fail();walk(args[1],clone(inherited),matrices,coordinates);return;
      }
      const kinds={Point:'point',Line:'line',Polygon:'polygon',Text:'text'} as const;
      if(!Object.hasOwn(kinds,head))fail();
      const kind=kinds[head as keyof typeof kinds];let points:GraphicsPoint[],paths:GraphicsPoint[][]|undefined,placementMode:'rows'|undefined,text:string|undefined,offset:GraphicsPoint|undefined,direction:GraphicsPoint|undefined;
      if(kind==='text'){
        if(args.length<2||args.length>4||args[0].kind!=='string')fail();text=(args[0] as Extract<Expr,{kind:'string'}>).value;
        points=[transformedPoint(point(args[1],vertices),matrices)];
        // Origamica preserves every Text argument after the anchor, including
        // its bounding-box alignment and direction, even under reflection.
        if(args[2])offset=point(args[2]);
        if(args[3]){direction=point(args[3]);if(!Math.hypot(...direction))fail();}
      }else{
        if(args.length!==1)fail();
        if(kind==='point'){
          const multiple=vertices?args[0].kind==='list':args[0].kind==='list'&&args[0].args[0]?.kind==='list';
          points=multiple?list(args[0]).map(item=>point(item,vertices)):[point(args[0],vertices)];
          if(!points.length)fail();
          if(multiple&&!vertices)placementMode='rows';
          points=multiple&&!vertices?transformedRows(points,matrices):points.map(p=>transformedPoint(p,matrices));
        }else{
          const values=list(args[0]),multiple=vertices?values[0]?.kind==='list':values[0]?.kind==='list'&&values[0].args[0]?.kind==='list';
          const groups=multiple?values.map(item=>list(item).map(p=>point(p,vertices))):[values.map(item=>point(item,vertices))];
          if(!groups.length||groups.some(group=>group.length<(kind==='polygon'?3:2)))fail();
          if(multiple&&!vertices)placementMode='rows';
          const mapped=groups.map(group=>multiple&&!vertices?transformedRows(group,matrices):group.map(p=>transformedPoint(p,matrices)));
          points=mapped.flat();if(multiple)paths=mapped;
        }
      }
      pointCount+=points.length;if(pointCount>MAX_POINTS||result.reduce((sum,p)=>sum+(p.paths?.length??1),0)+(paths?.length??1)>MAX_PRIMITIVES)fail();
      result.push({kind,points,color:kind==='polygon'?(inherited.face===undefined?inherited.color:inherited.face??'none'):inherited.color,
        stroke:kind==='line'?{...inherited.stroke}:kind==='polygon'?inherited.edge?{...inherited.edge}:null:null,
        fontSize:inherited.fontSize,pointSize:inherited.pointSize,...(paths?{paths}:{}),...(placementMode?{placementMode}:{}),...(text!==undefined?{text}:{}),...(offset?{offset}:{}),...(direction?{direction}:{})});
    };
    walk(root,{color:'#000000',stroke:{color:'#000000',width:1,cap:'butt',join:'miter'},edge:null,face:undefined,fontSize:12,pointSize:3},[]);
    return result;
  }catch{return null;}
}

/** Apply EmbedTile's affine f at the exact list level specified by In[76].
 * Later physical face mappings operate on the resulting individual points.
 */
export function placeTileGraphicsPrimitive(primitive:TileGraphicsPrimitive,map:(p:GraphicsPoint)=>GraphicsPoint):{points:GraphicsPoint[];paths?:GraphicsPoint[][]}|null{
  const groups=primitive.paths??[primitive.points];
  if(primitive.placementMode==='rows'&&groups.some(group=>group.length!==2))return null;
  const origin=map([0,0]),x=map([1,0]),y=map([0,1]);
  const matrix=[[x[0]-origin[0],y[0]-origin[0]],[x[1]-origin[1],y[1]-origin[1]]];
  const mapped=groups.map(group=>primitive.placementMode==='rows'?[
    [matrix[0][0]*group[0][0]+matrix[0][1]*group[1][0]+origin[0],matrix[0][0]*group[0][1]+matrix[0][1]*group[1][1]+origin[0]],
    [matrix[1][0]*group[0][0]+matrix[1][1]*group[1][0]+origin[1],matrix[1][0]*group[0][1]+matrix[1][1]*group[1][1]+origin[1]]
  ] as GraphicsPoint[]:group.map(map));
  const points=mapped.flat();if(points.some(p=>!p.every(Number.isFinite)))return null;
  return {points,...(primitive.paths?{paths:mapped}:{})};
}

export const supportsTileGraphicsPlacement=(primitives:TileGraphicsPrimitive[]):boolean=>primitives.every(primitive=>primitive.placementMode!=='rows'||(primitive.paths??[primitive.points]).every(group=>group.length===2));

/** Explicit conversion, preserving the evaluated source picture and original
 * Style/Tiling directives. It never silently rewrites a saved source.
 */
export function tileGraphicsSourceToComplex(source:string):string|null{
  const primitives=parseTileGraphicsSource(source);if(!primitives)return null;
  try{
    let index=0;
    const rewrite=(node:Expr):string=>{
      if(node.kind==='list')return `{${node.args.map(rewrite).join(',')}}`;
      if(node.kind!=='call')return node.source;
      if(node.head==='MatrixTransform'||node.head==='GraphicsComplex')return rewrite(node.args[node.head==='MatrixTransform'?0:1]);
      if(node.head==='Graphics'||node.head==='Style')return `${node.head}[${rewrite(node.args[0])}${node.args.slice(1).map(arg=>`,${arg.source}`).join('')}]`;
      if(!['Point','Line','Polygon','Text'].includes(node.head))return node.source;
      const primitive=primitives[index++],coordinates=`{${primitive.points.map(p=>`{${p.join(',')}}`).join(',')}}`;
      let indices:string;
      if(primitive.kind==='text')indices=`${node.args[0].source},1${node.args.slice(2).map(arg=>`,${arg.source}`).join('')}`;
      else if(primitive.kind==='point'&&primitive.points.length===1)indices='1';
      else if(primitive.paths){let cursor=0;indices=`{${primitive.paths.map(path=>`{${path.map(()=>++cursor).join(',')}}`).join(',')}}`;}
      else indices=`{${primitive.points.map((_,i)=>i+1).join(',')}}`;
      return `GraphicsComplex[${coordinates},${node.head}[${indices}]]`;
    };
    const converted=rewrite(parse(source));return converted.length<=MAX_TILE_GRAPHICS_SOURCE&&parseTileGraphicsSource(converted)?converted:null;
  }catch{return null;}
}

export function readTileGraphicsSpec(value:unknown,vertexCount:number):TileGraphicsSpec|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const raw=value as Record<string,unknown>;
  const primitives=typeof raw.source==='string'?parseTileGraphicsSource(raw.source):null;
  if(Object.keys(raw).some(key=>key!=='source'&&key!=='frame')||typeof raw.source!=='string'||!primitives||!supportsTileGraphicsPlacement(primitives)||
    !Array.isArray(raw.frame)||raw.frame.length!==vertexCount||vertexCount<3||vertexCount>MAX_POINTS||raw.frame.some(p=>!Array.isArray(p)||p.length!==2||p.some(x=>typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>MAX_COORDINATE)))return null;
  const frame=raw.frame as GraphicsPoint[],indices=frame.map((_,i)=>i+1);
  if(!tileGraphicsPlacement(frame,frame,indices))return null;
  // A source frame must determine a plane, not just a line of repeated points.
  const a=frame[0],span=Math.max(...frame.map(p=>Math.hypot(p[0]-a[0],p[1]-a[1])));
  if(!frame.some((b,i)=>frame.slice(i+1).some(c=>Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))>span*span*1e-12)))return null;
  return {source:raw.source,frame:frame.map(p=>[...p])};
}

/** A similarity from original source vertices to the placed (and possibly
 * canvas-normalized) tile. Reject mismatched frames instead of guessing.
 */
export function tileGraphicsPlacement(source:GraphicsPoint[],placed:GraphicsPoint[],vertexIndices?:number[]):((p:GraphicsPoint)=>GraphicsPoint)|null{
  if(source.length<3||source.length>MAX_POINTS||source.length!==placed.length||vertexIndices?.length!==source.length)return null;
  const ids=vertexIndices.map(index=>index-1);
  if(ids.some(index=>!Number.isInteger(index)||index<0||index>=source.length)||new Set(ids).size!==source.length)return null;
  const a=source[ids[0]],b=source[ids[1]],u:GraphicsPoint=[b[0]-a[0],b[1]-a[1]],v:GraphicsPoint=[placed[1][0]-placed[0][0],placed[1][1]-placed[0][1]];
  const length=u[0]*u[0]+u[1]*u[1];if(!(length>0)||!Number.isFinite(length))return null;
  for(const mirror of [1,-1]){
    const ux=u[0],uy=mirror*u[1],re=(v[0]*ux+v[1]*uy)/length,im=(v[1]*ux-v[0]*uy)/length;
    const map=(p:GraphicsPoint):GraphicsPoint=>{const x=p[0]-a[0],y=mirror*(p[1]-a[1]);return [placed[0][0]+re*x-im*y,placed[0][1]+im*x+re*y];};
    const span=Math.max(...placed.map(p=>Math.hypot(p[0]-placed[0][0],p[1]-placed[0][1])));
    if(span>0&&Number.isFinite(span)&&placed.every((p,i)=>{const q=map(source[ids[i]]);return Math.hypot(p[0]-q[0],p[1]-q[1])<=span*1e-7;}))return map;
  }
  return null;
}
