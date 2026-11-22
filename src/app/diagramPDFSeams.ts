/** Stable panel identity shared by a full branch tree and a single exported route. */
export function diagramPDFRibbonNodeId(stepId:string,figureId?:string):string {
  return 's/'+encodeURIComponent(stepId)+(figureId===undefined?'':'/f/'+encodeURIComponent(figureId));
}

/** Connect a particular pair of panels even if a cover or other pages move. */
export function diagramPDFSeamKey(from:string,to:string):string {
  return JSON.stringify([from,to]);
}

export type DiagramPDFSeamSide='incoming'|'outgoing';
/** A number is the shared height used by older projects. An object explicitly unlinks the ends. */
export type DiagramPDFSeamHeight=number|Partial<Record<DiagramPDFSeamSide,number>>;
export type DiagramPDFSeamHeights=Record<string,DiagramPDFSeamHeight>;

export function diagramPDFSeamEndHeight(setting:DiagramPDFSeamHeight|undefined,side:DiagramPDFSeamSide){
  return typeof setting==='object'?setting[side]:setting;
}

export function validDiagramPDFSeamHeights(value:unknown):boolean {
  const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
  const validHeight=(y:unknown)=>typeof y==='number'&&Number.isFinite(y)&&y>=0&&y<=1;
  return record(value)&&Object.values(value).every(setting=>validHeight(setting)||record(setting)&&
    Object.entries(setting).every(([side,y])=>(side==='incoming'||side==='outgoing')&&validHeight(y)));
}

export function changeDiagramPDFSeamHeight(heights:DiagramPDFSeamHeights|undefined,key:string,value:number|undefined,side?:DiagramPDFSeamSide){
  const next={...heights};
  const old=next[key],height=value===undefined?undefined:Math.max(0,Math.min(1,value));
  if(side&&typeof old==='object'){
    const ends={...old};
    if(height===undefined)delete ends[side];
    else ends[side]=height;
    next[key]=ends;
  }else if(height===undefined)delete next[key];
  else next[key]=height;
  return next;
}

export function setDiagramPDFSeamLinked(heights:DiagramPDFSeamHeights|undefined,key:string,linked:boolean,currentHeight:number):DiagramPDFSeamHeights {
  return {...heights,[key]:linked?currentHeight:{incoming:currentHeight,outgoing:currentHeight}};
}
