/** One synchronous save/import operation owns these results. Outside that
 * operation editing and solving use their normal independent objects. */
type Memo = Map<string,unknown>;
let active: {tables: Map<string,Memo>; bytes:number}|undefined;
export function withDiagramOpenMemo<T>(run:()=>T):T {
  if(active)return run();
  active={tables:new Map(),bytes:0};
  try{return run();}finally{active=undefined;}
}

export function memoDiagramOpen<T>(table:string,input:()=>unknown,compute:()=>T):T {
  if(!active)return compute();
  let values=active.tables.get(table);
  if(!values){values=new Map();active.tables.set(table,values);}
  const key=JSON.stringify(input());
  if(values.has(key))return structuredClone(values.get(key)) as T;
  const result=compute();
  // Eviction only affects reuse. A large project always completes the full calculation.
  const bytes=2*(key.length+JSON.stringify(result).length);
  const limit=48*1024*1024;
  if(bytes<=limit){
    if(active.bytes+bytes>limit){active.tables.clear();active.bytes=0;values=new Map();active.tables.set(table,values);}
    values.set(key,structuredClone(result));active.bytes+=bytes;
  }
  return result;
}
