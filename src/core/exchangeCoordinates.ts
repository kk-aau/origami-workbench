import type {Doc,Point,Segment} from './types';

/** Infer paper extent without spreading every endpoint onto the call stack. */
export function segmentPaperSize(segments:readonly Segment[]):Doc['paper'] {
  const hasBoundary=segments.some(s=>s.assignment==='B');
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const segment of segments){
    if(hasBoundary&&segment.assignment!=='B')continue;
    for(const point of [segment.a,segment.b]){
      minX=Math.min(minX,point[0]);minY=Math.min(minY,point[1]);
      maxX=Math.max(maxX,point[0]);maxY=Math.max(maxY,point[1]);
    }
  }
  return segments.length?{width:Math.max(1,maxX-minX),height:Math.max(1,maxY-minY)}:{width:200,height:200};
}

/** Oriedita's default paper/grid spans -200..200; CP itself stores no grid settings. */
export function cpPaperCoordinates(doc:Doc):(point:Point)=>Point {
  const boundary=doc.segments.filter(s=>s.assignment==='B');
  let x=0,y=0,width=doc.paper.width,height=doc.paper.height;
  if(boundary.length){
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const s of boundary)for(const p of [s.a,s.b]){minX=Math.min(minX,p[0]);minY=Math.min(minY,p[1]);maxX=Math.max(maxX,p[0]);maxY=Math.max(maxY,p[1]);}
    x=minX;y=minY;width=maxX-minX;height=maxY-minY;
  }
  const extent=Math.max(width,height);
  if(!Number.isFinite(extent)||extent<=0)throw Error('CP 纸张范围无效，无法对齐参考网格。');
  const scale=400/extent,cx=x+width/2,cy=y+height/2;
  return point=>[(point[0]-cx)*scale,(point[1]-cy)*scale];
}
