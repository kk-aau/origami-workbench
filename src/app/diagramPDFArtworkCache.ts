import type {DiagramCPState,DiagramProject,DiagramStep} from './diagramProject';
import type {DiagramFoldPreviewSegment} from './diagramFoldLinkTypes';
import type {DiagramLineDefaults} from './diagramLineStyles';

type Creases=DiagramFoldPreviewSegment[]|undefined;
export interface PDFArtworkReader {
  svg(source:object,variant:readonly unknown[],draw:()=>string):string;
  creases(step:DiagramStep,before:DiagramCPState,after:DiagramCPState,project:()=>Creases):Creases;
}

class BoundedCache<T>{
  private readonly items=new Map<string,{value:T;size:number}>();
  private used=0;
  constructor(private readonly budget:number,private readonly measure:(value:T)=>number){}
  read(key:string,make:()=>T):T {
    const found=this.items.get(key);
    if(found){
      this.items.delete(key);this.items.set(key,found);
      return found.value;
    }
    const value=make(),size=this.measure(value);
    if(size>this.budget)return value;
    while(this.items.size>=96||this.used+size>this.budget){
      const [oldest,entry]=this.items.entries().next().value!;
      this.items.delete(oldest);this.used-=entry.size;
    }
    this.items.set(key,{value,size});this.used+=size;
    return value;
  }
}

class SnapshotArtwork {
  readonly vectors=new BoundedCache<string>(32*1024*1024,svg=>svg.length);
  readonly projections=new BoundedCache<Creases>(32*1024,segments=>segments?.length??0);
  private readonly ids=new WeakMap<object,number>();
  private nextId=0;
  id(source:object){
    let id=this.ids.get(source);
    if(id===undefined){id=++this.nextId;this.ids.set(source,id);}
    return id;
  }
}
const snapshots=new WeakMap<DiagramProject,SnapshotArtwork>();

/** Prepared projects are immutable. Physical CP projections are shared across
 * print sizes. Final vectors also depend on size, drawing styles and direction. */
export function pdfArtworkReader(project:DiagramProject,palette:DiagramLineDefaults,adaptiveLines:boolean):PDFArtworkReader {
  let cache=snapshots.get(project);
  if(!cache){cache=new SnapshotArtwork();snapshots.set(project,cache);}
  const style=JSON.stringify([adaptiveLines,palette]);
  return {
    svg:(source,variant,draw)=>cache.vectors.read(cache.id(source)+'|'+style+'|'+JSON.stringify(variant),draw),
    creases:(step,before,after,projectCreases)=>cache.projections.read([cache.id(step),cache.id(before),cache.id(after)].join('|'),projectCreases),
  };
}
