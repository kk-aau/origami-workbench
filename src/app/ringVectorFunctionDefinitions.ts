import {validRingVectorFormulaText} from './ringVectorFormulaText';

const functions=new Set(['sin','cos','exp','sqrt','log','sign','abs','piecewise','wolfram_piecewise','conditional','Sin','Cos','Exp','Sqrt','Log','Sign','Abs','Piecewise','If']);
const constants=new Set(['pi','tau','e','degree','Pi','Tau','E','Degree']);
const reserved=new Set([...functions,...constants,'i','phi','Module'].filter(name=>name!=='Log'&&name!=='log'));
const declaration=/^\s*([A-Za-z][A-Za-z0-9]{0,23})\s*\[([^\[\]]*)\]\s*(?::=|=)\s*(.+?)\s*$/s;
const parameter=/^\s*([A-Za-z][A-Za-z0-9]{0,23})_\s*$/;
const numeric=/^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+|\*\^[+-]?\d+)?)\s*$/;
const tokens=/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+|\*\^[+-]?\d+)?|[A-Za-z_][A-Za-z_0-9]*/g;

function splitParts(text:string):string[]|null{
  const stack:string[]=[],parts:string[]=[];let start=0;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if('[({'.includes(c))stack.push(c);
    else if('])}'.includes(c)){if(stack.pop()!==({']':'[',')':'(','}':'{'} as Record<string,string>)[c])return null;}
    else if(c===','&&!stack.length){parts.push(text.slice(start,i));start=i+1;}
  }
  return stack.length?null:[...parts,text.slice(start)];
}

type LocalCase={parameters:(string|null)[];literals:(number|null)[];body:string;immediate:boolean};
type Scope={parent?:Scope;values:Map<string,boolean>;functions:Map<string,LocalCase[]>;writable:boolean};
function owner(scope:Scope,name:string):Scope|undefined{
  return scope.values.has(name)?scope:scope.parent?owner(scope.parent,name):undefined;
}
function splitSequence(text:string):string[]|null{
  const stack:string[]=[],parts:string[]=[];let start=0;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if('[({'.includes(c))stack.push(c);
    else if('])}'.includes(c)){if(stack.pop()!==({']':'[',')':'(','}':'{'} as Record<string,string>)[c])return null;}
    else if(c===';'&&!stack.length){parts.push(text.slice(start,i));start=i+1;}
  }
  return stack.length?null:[...parts,text.slice(start)];
}

/** Bounded lexical reader only; AST dispatch and geometric certificates remain server-side. */
function validBody(body:string,parameters:Set<string>,names:Set<string>,calls:Set<string>,arities:Map<string,number>,onBuiltinLog?:()=>void):boolean{
  const root:Scope={values:new Map([...parameters].map(name=>[name,true])),functions:new Map(),writable:false};
  const active=new Set<LocalCase>(),barriers:Set<Scope>[]=[];let visits=0;
  const blocked=(scope:Scope)=>barriers.some(row=>row.has(scope));
  function validateCase(scope:Scope,row:LocalCase):boolean{
    if(row.immediate)return true;if(active.has(row))return false;
    active.add(row);const captured=new Set<Scope>();let parent:Scope|undefined=scope;
    while(parent){captured.add(parent);parent=parent.parent;}
    barriers.push(captured);
    const child:Scope={parent:scope,values:new Map(row.parameters.filter((name):name is string=>name!==null).map(name=>[name,true])),functions:new Map(),writable:false};
    const answer=expression(row.body,child);barriers.pop();active.delete(row);return answer;
  }
  function module(text:string,outer:Scope):boolean{
    const parts=splitParts(text);if(parts?.length!==2)return false;
    const list=parts[0].trim();if(!list.startsWith('{')||!list.endsWith('}'))return false;
    const locals=list.slice(1,-1).trim()?splitParts(list.slice(1,-1)):[];
    if(!locals||locals.length>32)return false;
    const scope:Scope={parent:outer,values:new Map(),functions:new Map(),writable:true};
    for(const local of locals){
      const row=/^\s*([A-Za-z][A-Za-z0-9]{0,23})\s*(?:=(?!=)\s*(.+?))?\s*$/s.exec(local);
      if(!row||scope.values.has(row[1])||reserved.has(row[1])&&!['i','phi'].includes(row[1]))return false;
      if(row[2]!==undefined&&!expression(row[2],outer))return false;
      scope.values.set(row[1],row[2]!==undefined);
    }
    const statements=splitSequence(parts[1]);if(!statements||statements.length>33||statements.some(row=>!row.trim()))return false;
    for(const statement of statements.slice(0,-1)){
      const fn=/^\s*([A-Za-z][A-Za-z0-9]{0,23})\s*\[([^\[\]]*)\]\s*(:=|=)\s*(.+?)\s*$/s.exec(statement);
      if(fn){
        const target=owner(scope,fn[1]);if(!target?.writable||blocked(target)||target.values.get(fn[1])&&!target.functions.has(fn[1]))return false;
        const parameters:(string|null)[]=[],literals:(number|null)[]=[];
        for(const pattern of fn[2].split(',')){
          const formal=parameter.exec(pattern),literal=numeric.exec(pattern);
          if(formal){if(parameters.includes(formal[1])||reserved.has(formal[1])&&!['i','phi'].includes(formal[1]))return false;parameters.push(formal[1]);literals.push(null);}
          else if(literal){const value=Number(literal[1].replace('*^','e'));if(!Number.isFinite(value)||Math.abs(value)>1e6)return false;parameters.push(null);literals.push(value);}
          else return false;
        }
        if(parameters.length<1||parameters.length>4)return false;
        const cases=target.functions.get(fn[1])??[];
        if(cases.some(row=>row.parameters.length!==parameters.length||JSON.stringify(row.literals)===JSON.stringify(literals)))return false;
        const row:LocalCase={parameters,literals,body:fn[4],immediate:false};
        if(fn[3]==='='){if(!validateCase(target,row))return false;row.immediate=true;}
        cases.push(row);target.functions.set(fn[1],cases);continue;
      }
      const assignment=/^\s*([A-Za-z][A-Za-z0-9]{0,23})\s*=(?!=)\s*(.+?)\s*$/s.exec(statement);
      if(!assignment)return false;const target=owner(scope,assignment[1]);
      if(!target?.writable||blocked(target)||target.functions.has(assignment[1])||!expression(assignment[2],scope))return false;
      target.values.set(assignment[1],true);
    }
    if([...scope.values].some(([name,assigned])=>!assigned&&!scope.functions.has(name)))return false;
    for(const cases of scope.functions.values()){
      if(!cases.some(row=>row.literals.every(value=>value===null)))return false;
      for(const row of cases)if(!validateCase(scope,row))return false;
    }
    return expression(statements.at(-1)!,scope);
  }
  function expression(body:string,scope:Scope,allowList=false):boolean{
    if(++visits>1024||!validRingVectorFormulaText(body))return false;
    const text=body.replace(/\\\[(Phi|CurlyPhi|Pi|Tau|Degree|LessEqual|GreaterEqual)\]/g,(_,symbol:string)=>({Phi:'phi',CurlyPhi:'phi',Pi:'pi',Tau:'tau',Degree:'degree',LessEqual:'<=',GreaterEqual:'>='}[symbol]!))
      .replace(/[φϕπτ°]/gu,symbol=>({'φ':'phi','ϕ':'phi','π':'pi','τ':'tau','°':'degree'}[symbol]!));
    const scan=new RegExp(tokens.source,'g');let token:RegExpExecArray|null,plain='',previous=0;
    while((token=scan.exec(text))){
      const name=token[0];
      if(!/^[A-Za-z_]/.test(name)){
        const value=Number(name.replace('*^','e'));if(!Number.isFinite(value)||Math.abs(value)>1e6)return false;continue;
      }
      const following=/^\s*([[(])/.exec(text.slice(scan.lastIndex));
      if(following){
        const open=scan.lastIndex+following[0].length-1,stack:string[]=[];let end=open;
        for(;end<text.length;end++){
          const c=text[end];if('[({'.includes(c))stack.push(c);
          else if('])}'.includes(c)){if(stack.pop()!==({']':'[',')':'(','}':'{'} as Record<string,string>)[c])return false;if(!stack.length){end++;break;}}
        }
        if(stack.length)return false;
        const raw=text.slice(open+1,end-1);
        if(name==='Module'){if(following[1]!=='['||!module(raw,scope))return false;}
        else{
          const target=owner(scope,name),cases=target?.functions.get(name);
          if(target&&!cases)return false;
          if(!target&&!names.has(name)&&!functions.has(name))return false;
          if(!target&&!names.has(name)&&(name==='Log'||name==='log'))onBuiltinLog?.();
          const args=splitParts(raw);if(!args)return false;
          if(name==='If'||name==='conditional'){
            if(args.length!==3||!expression(args[0],scope))return false;
            const captured=new Set<Scope>();let current:Scope|undefined=scope;
            while(current){captured.add(current);current=current.parent;}
            barriers.push(captured);
            try{if(args.slice(1).some(arg=>!expression(arg,scope,allowList)))return false;}
            finally{barriers.pop();}
          }else if(args.some((arg,i)=>!expression(arg,scope,allowList||(name==='Piecewise'||name==='wolfram_piecewise')&&i===0)))return false;
          if(cases){if(args.length!==cases[0].parameters.length||cases.some(row=>!validateCase(target!,row)))return false;}
          else if(names.has(name)){if(args.length!==arities.get(name))return false;calls.add(name);}
        }
        plain+=text.slice(previous,token.index)+'0';previous=end;scan.lastIndex=end;
      }else{
        const target=owner(scope,name);
        if(target){if(!target.values.get(name)||target.functions.has(name))return false;}
        else if(!constants.has(name))return false;
      }
    }
    plain+=text.slice(previous);
    if(/(?<![<>])=(?!=)|[;:]/u.test(plain)||!allowList&&/[{}]/.test(plain))return false;
    return true;
  }
  return expression(body,root);
}

/** Preserve declarations verbatim, including finite literal overloads and lexical scalar Modules. */
export function readRingVectorFunctionDefinitions(value:unknown,onBuiltinLog?:()=>void):string[]|null{
  if(!Array.isArray(value)||value.length<1||value.length>8)return null;
  type Case={parameters:Set<string>;literals:(number|null)[];body:string};
  const declarations=new Map<string,{cases:Case[];calls:Set<string>}>();
  for(const source of value){
    if(typeof source!=='string'||source.length<1||source.length>240)return null;
    const match=declaration.exec(source);if(!match)return null;
    const [,name,rawParameters,body]=match;if(reserved.has(name))return null;
    const patterns=rawParameters.split(','),parameters=new Set<string>(),literals:(number|null)[]=[];
    if(patterns.length<1||patterns.length>4)return null;
    for(const pattern of patterns){
      const formal=parameter.exec(pattern);
      if(formal){
        const name=formal[1];if(parameters.has(name)||reserved.has(name)&&!['i','phi'].includes(name))return null;
        parameters.add(name);literals.push(null);
      }else{
        const literal=numeric.exec(pattern);if(!literal)return null;
        const number=Number(literal[1].replace('*^','e'));if(!Number.isFinite(number)||Math.abs(number)>1e6)return null;
        literals.push(number);
      }
    }
    const entry=declarations.get(name)??{cases:[],calls:new Set<string>()};
    if(entry.cases.some(row=>row.literals.length!==literals.length||JSON.stringify(row.literals)===JSON.stringify(literals)))return null;
    entry.cases.push({parameters,literals,body});declarations.set(name,entry);
  }
  const names=new Set(declarations.keys());
  const arities=new Map([...declarations].map(([name,entry])=>[name,entry.cases[0].literals.length]));
  for(const {cases,calls} of declarations.values()){
    if(!cases.some(row=>row.literals.every(item=>item===null)))return null;
    for(const {parameters,body} of cases){
      if([...parameters].some(item=>names.has(item))||!validBody(body,parameters,names,calls,arities,onBuiltinLog))return null;
    }
  }
  const complete=new Set<string>(),visiting=new Set<string>();
  function visit(name:string):boolean{
    if(visiting.has(name))return false;if(complete.has(name))return true;
    visiting.add(name);for(const called of declarations.get(name)!.calls)if(!visit(called))return false;
    visiting.delete(name);complete.add(name);return true;
  }
  return [...names].some(name=>!visit(name))?null:[...value] as string[];
}

/** Independent lexical binding inspection, reusing the bounded scope reader.
 * Counts parsed intrinsic calls, including unselected/uncalled parsed bodies;
 * it does not assert that their unevaluated arguments were positive.
 */
export function inspectRingBuiltinLogInput(p:Record<string,unknown>):boolean|null{
 const definitions=p.vectorFunctionDefinitions;let found=false;
 if(definitions!==undefined&&!readRingVectorFunctionDefinitions(definitions,()=>{found=true;}))return null;
 const names=new Set<string>(),arities=new Map<string,number>();
 for(const text of definitions as string[]??[]){const m=declaration.exec(text)!;names.add(m[1]);arities.set(m[1],m[2].split(',').length);}
 const pairs:unknown[]=[];for(const k of ['outerVectorTemplate','creaseVectorTemplate'])if(p[k]!==undefined)pairs.push(p[k]);
 for(const k of ['outerVectorExpressions','creaseVectorExpressions'])if(p[k]!==undefined){if(!Array.isArray(p[k]))return null;pairs.push(...p[k] as unknown[]);}
 for(const pair of pairs){if(!Array.isArray(pair)||pair.length!==2)return null;for(const body of pair){if(typeof body!=='string'||!validBody(body,new Set(['phi','i']),names,new Set(),arities,()=>{found=true;}))return null;}}
 return found;
}
