/** A bounded tree transfer keeps arrays and embedded images from arriving in
 * one UI task. This is an internal Worker protocol, never an on-disk format. */
export const ARTWORK_TRANSFER_BUDGET=8192;
export const ARTWORK_TRANSFER_TEXT=65536;
type Path=(string|number)[];
export type ArtworkTransferOperation=
  |{kind:'object';path:Path;count:number}
  |{kind:'array';path:Path;length:number}
  |{kind:'set';path:Path;value:unknown}
  |{kind:'items';path:Path;offset:number;values:unknown[]}
  |{kind:'string';path:Path;length:number;id:number}
  |{kind:'text';id:number;offset:number;text:string};
type Weighted={operation:ArtworkTransferOperation;cost:number};
function plain(value:object):boolean{const proto=Object.getPrototypeOf(value);return proto===Object.prototype||proto===null;}
function inlineCost(value:unknown,budget=ARTWORK_TRANSFER_BUDGET):number|null{
  const pending=[value];let cost=0;
  while(pending.length){
    const next=pending.pop();if(++cost>budget)return null;
    if(typeof next==='string'){if(next.length>ARTWORK_TRANSFER_TEXT)return null;cost+=Math.ceil(next.length/32);if(cost>budget)return null;}
    else if(next!==null&&typeof next==='object'){
      if(!Array.isArray(next)&&!plain(next))throw new Error('完整作品包含不支持的运行时数据。');
      const values=Array.isArray(next)?next:Object.values(next);
      // Do not allocate another complete million-element work list merely to
      // decide that the array needs to be transferred in smaller batches.
      if(values.length>budget-cost)return null;
      for(const item of values)pending.push(item);
    }else if(typeof next==='function'||typeof next==='symbol'||typeof next==='bigint')throw new Error('完整作品包含不支持的运行时数据。');
  }
  return cost;
}

export function* artworkTransferChunks(value:unknown):Generator<ArtworkTransferOperation[]>{
  let stringId=0;
  function* walk(node:unknown,path:Path):Generator<Weighted>{
    const cost=inlineCost(node);
    if(cost!==null){yield {operation:{kind:'set',path,value:node},cost};return;}
    if(typeof node==='string'){
      const id=stringId++;yield {operation:{kind:'string',path,length:node.length,id},cost:1};
      for(let offset=0;offset<node.length;offset+=ARTWORK_TRANSFER_TEXT){const text=node.slice(offset,offset+ARTWORK_TRANSFER_TEXT);yield {operation:{kind:'text',id,offset,text},cost:ARTWORK_TRANSFER_BUDGET};}
    }else if(Array.isArray(node)){
      yield {operation:{kind:'array',path,length:node.length},cost:1};
      let values:unknown[]=[],used=0,offset=0;
      for(let index=0;index<node.length;index++){
        const item=node[index],itemCost=inlineCost(item);
        if(itemCost===null||used+itemCost>ARTWORK_TRANSFER_BUDGET){
          if(values.length){yield {operation:{kind:'items',path,offset,values},cost:used};values=[];used=0;}
          offset=index;
        }
        if(itemCost===null){yield* walk(item,[...path,index]);offset=index+1;}
        else{values.push(item);used+=itemCost;}
      }
      if(values.length)yield {operation:{kind:'items',path,offset,values},cost:used};
    }else if(node!==null&&typeof node==='object'){
      const entries=Object.entries(node);yield {operation:{kind:'object',path,count:entries.length},cost:1};
      for(const [key,item] of entries)yield* walk(item,[...path,key]);
    }else throw new Error('完整作品传输数据无效。');
  }
  let chunk:ArtworkTransferOperation[]=[],used=0;
  for(const entry of walk(value,[])){
    if(chunk.length&&(used+entry.cost>ARTWORK_TRANSFER_BUDGET||chunk.length>=256)){yield chunk;chunk=[];used=0;}
    chunk.push(entry.operation);used+=entry.cost;
  }
  if(chunk.length)yield chunk;
}

function invalid():never{throw new Error('完整作品分批数据不完整或顺序错误，当前作品未替换。');}
interface Container {value:Record<string,unknown>|unknown[];total:number;received:number;array:boolean}
/** Assemble only detached Worker-owned data. The caller publishes after finish. */
export function createArtworkTransferReceiver(){
  let root:unknown,hasRoot=false;
  const containers=new Map<object,Container>(),strings=new Map<number,{path:Path;length:number;received:number;value:string}>();
  const natural=(value:number)=>Number.isSafeInteger(value)&&value>=0;
  function parent(path:Path):{value:Record<string,unknown>|unknown[];key:string|number}{
    if(!Array.isArray(path)||!path.length)invalid();let value=root;
    for(const key of path.slice(0,-1)){if(!value||typeof value!=='object'||!Object.hasOwn(value,key))invalid();value=(value as Record<string,unknown>)[key];}
    if(!value||typeof value!=='object')invalid();return {value:value as Record<string,unknown>|unknown[],key:path[path.length-1]};
  }
  function assign(path:Path,value:unknown,replace=false){
    if(!Array.isArray(path)||path.some(key=>typeof key!=='string'&&(typeof key!=='number'||!natural(key))))invalid();
    if(!path.length){if(hasRoot&&!replace)invalid();root=value;hasRoot=true;return;}
    const target=parent(path),state=containers.get(target.value);if(!state)invalid();
    if(!replace){
      if(Object.hasOwn(target.value,target.key))invalid();
      if(state.array&&(typeof target.key!=='number'||target.key!==state.received||target.key>=state.total))invalid();
      state.received++;if(state.received>state.total)invalid();
    }
    // A JSON metadata key named __proto__ must remain ordinary data.
    Object.defineProperty(target.value,target.key,{value,writable:true,enumerable:true,configurable:true});
  }
  function at(path:Path):unknown{let value=root;for(const key of path){if(!value||typeof value!=='object'||!Object.hasOwn(value,key))invalid();value=(value as Record<string,unknown>)[key];}return value;}
  function receive(operations:ArtworkTransferOperation[]){
    if(!Array.isArray(operations)||!operations.length||operations.length>256)invalid();
    for(const op of operations){
      if(op.kind==='set')assign(op.path,op.value);
      else if(op.kind==='object'||op.kind==='array'){
        const array=op.kind==='array',total=array?op.length:op.count;if(!natural(total))invalid();
        const value=array?[]:{};assign(op.path,value);containers.set(value,{value,total,received:0,array});
      }else if(op.kind==='items'){
        const value=at(op.path),state=value&&typeof value==='object'?containers.get(value):undefined;
        if(!state?.array||!natural(op.offset)||op.offset!==state.received||!Array.isArray(op.values)||!op.values.length||op.values.length>ARTWORK_TRANSFER_BUDGET||state.received+op.values.length>state.total)invalid();
        for(const item of op.values){(value as unknown[]).push(item);state.received++;}
      }else if(op.kind==='string'){
        if(!natural(op.id)||!natural(op.length)||strings.has(op.id))invalid();assign(op.path,'');strings.set(op.id,{path:op.path,length:op.length,received:0,value:''});
      }else if(op.kind==='text'){
        const state=strings.get(op.id);if(!state||op.offset!==state.received||typeof op.text!=='string'||!op.text.length||op.text.length>ARTWORK_TRANSFER_TEXT||state.received+op.text.length>state.length)invalid();
        state.value+=op.text;state.received+=op.text.length;
        if(state.received===state.length)assign(state.path,state.value,true);
      }else invalid();
    }
  }
  return {receive,finish():unknown{
    if(!hasRoot||[...containers.values()].some(state=>state.received!==state.total)||[...strings.values()].some(state=>state.received!==state.length))invalid();
    return root;
  }};
}
