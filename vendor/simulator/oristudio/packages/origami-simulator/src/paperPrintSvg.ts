import type {ProjectedVertices} from './webgl/camera.js';

export type PrintedSide='front'|'back';
type Point=[number,number];
export interface PrintMapping {side:PrintedSide;matrix:number[]}
export type PrintSources=Partial<Record<PrintedSide,string>>;
type Sample={point:Point;u:number;v:number;q:number};

/** SVG supports affine images. Subdivide a perspective footprint until the
 * material midpoint projects within a fraction of a camera pixel of its affine
 * midpoint (or a fraction of one native texel). Each visible fragment keeps its original UVs. */
export function projectedPrintPatches(indices:number[],polygon:Point[],projected:ProjectedVertices,uv:Float32Array,side:PrintedSide,eyeDistance:number,perspective:boolean,opaqueUnderlay=false,image?:{width:number;height:number}):{points:Point[];mapping:PrintMapping}[] {
  const vertices=indices.map(i=>({
    point:[projected.screen[2*i]!,projected.screen[2*i+1]!] as Point,
    u:side==='front'?uv[2*i]!:1-uv[2*i]!,v:uv[2*i+1]!,
    q:perspective?1/Math.max(.001,eyeDistance-projected.view[3*i+2]!):1,
  }));
  const [a,b,c]=vertices,[ax,ay]=a!.point;
  const bx=b!.point[0]-ax,by=b!.point[1]-ay,cx=c!.point[0]-ax,cy=c!.point[1]-ay,area=bx*cy-by*cx;
  const sample=(point:Point):Sample=>{
    const x=point[0]-ax,y=point[1]-ay,wb=(x*cy-y*cx)/area,wc=(bx*y-by*x)/area,wa=1-wb-wc;
    const weights=[wa*a!.q,wb*b!.q,wc*c!.q],q=weights.reduce((s,w)=>s+w,0);
    return {point,q,u:weights.reduce((s,w,i)=>s+w*vertices[i]!.u,0)/q,v:weights.reduce((s,w,i)=>s+w*vertices[i]!.v,0)/q};
  };
  function affine(a:Sample,b:Sample,c:Sample):number[] {
    let du=b.u-a.u,dv=b.v-a.v,eu=c.u-a.u,ev=c.v-a.v,det=du*ev-dv*eu;
    // Vertical rest meshes can collapse a UV dimension. Sample the same
    // narrow stripe by opening it by much less than a source texel.
    if(Math.abs(det)<1e-18){
      const first=Math.hypot(du,dv),second=Math.hypot(eu,ev),epsilon=1e-8;
      if(Math.max(first,second)<epsilon){du=epsilon;dv=0;eu=0;ev=epsilon;}
      else if(first>=second){eu-=epsilon*dv/first;ev+=epsilon*du/first;}
      else {du+=epsilon*ev/second;dv-=epsilon*eu/second;}
      det=du*ev-dv*eu;
    }
    const dx=b.point[0]-a.point[0],dy=b.point[1]-a.point[1],ex=c.point[0]-a.point[0],ey=c.point[1]-a.point[1];
    const m=(dx*ev-ex*dv)/det,n=(dy*ev-ey*dv)/det,o=(ex*du-dx*eu)/det,p=(ey*du-dy*eu)/det;
    return [m,n,o,p,a.point[0]-m*a.u-o*a.v,a.point[1]-n*a.u-p*a.v];
  }
  const whole={points:polygon,mapping:{side,matrix:affine(a!,b!,c!)}};
  const result:{points:Point[];mapping:PrintMapping}[]=[];
  const samples=polygon.map(sample);
  function emit(triangle:Sample[],depth:number){
    // For perspective, the screen position of the material-edge midpoint
    // shifts by this fraction of its projected edge. Split the worst edge.
    const errors=triangle.map((s,i)=>{
      const t=triangle[(i+1)%3]!;
      const screenLength=Math.hypot(s.point[0]-t.point[0],s.point[1]-t.point[1]);
      const texelLength=image?Math.hypot((s.u-t.u)*image.width,(s.v-t.v)*image.height):screenLength;
      return Math.min(screenLength,texelLength)*Math.abs(s.q-t.q)/(2*(s.q+t.q));
    });
    const maximum=Math.max(...errors);
    if(maximum>.2&&depth<12){
      const i=errors.indexOf(maximum),p=triangle[i]!,q=triangle[(i+1)%3]!,r=triangle[(i+2)%3]!;
      const mid=sample([(p.point[0]+q.point[0])/2,(p.point[1]+q.point[1])/2]);
      emit([p,mid,r],depth+1);emit([mid,q,r],depth+1);return;
    }
    const [p,q,r]=triangle as [Sample,Sample,Sample];
    result.push({points:triangle.map(v=>v.point),mapping:{side,matrix:affine(p,q,r)}});
  }
  if(vertices.every(v=>v.q===a!.q)){
    return [whole];
  }
  for(let i=1;i+1<samples.length;i++)emit([samples[0]!,samples[i]!,samples[i+1]!],0);
  // SVG antialiases adjacent polygons independently. Behind their shared
  // sample coverage, retain this same printed face rather than the background.
  if(opaqueUnderlay&&result.length>1)result.unshift(whole);
  return result;
}

/** Both simulation SVG and saved process figures embed each material image
 * once. A paint server maps [0,1] UVs to the fragment and composites its
 * alpha over the actual paper color. */
export class PrintPaintServers {
  private readonly patterns=new Map<string,string>();
  private readonly used=new Set<PrintedSide>();
  private readonly paints:string[]=[];
  constructor(private prefix:string,private source:(side:PrintedSide)=>string){}
  fill(mapping:PrintMapping,base:string):string {
    const {side,matrix}=mapping,transform=matrix.join(' '),key=[side,base,transform].join(':');
    let id=this.patterns.get(key);
    if(!id){
      id=this.prefix+'-paint-'+this.patterns.size;this.patterns.set(key,id);this.used.add(side);
      this.paints.push(`<pattern id="${id}" patternUnits="userSpaceOnUse" width="1" height="1" patternTransform="matrix(${transform})"><rect width="1" height="1" fill="${base}"/><use href="#${this.prefix}-${side}"/></pattern>`);
    }
    return 'url(#'+id+')';
  }
  defs():string {
    if(!this.used.size)return '';
    const images=Array.from(this.used,side=>`<image id="${this.prefix}-${side}" data-paper-side="${side}" width="1" height="1" preserveAspectRatio="none" href="${this.source(side)}"/>`);
    return '<defs>'+images.join('')+this.paints.join('')+'</defs>';
  }
}
