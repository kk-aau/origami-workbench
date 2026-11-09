import {blankDoc} from '../../src/app/state';
import {buildDiagramFold} from '../../src/core/geometry';
import {computeFlatGeometry} from '../../src/core/flatFold';
import type {Doc,Point,Segment} from '../../src/core/types';
import {adoptDiagramPose,createDiagramProject,updateDiagramCP,updateDiagramFoldLink} from '../../src/app/diagramProject';
import {applyDiagramFoldSegments} from '../../src/app/diagramFoldLink';
import {normalizeDiagramCP} from '../../src/app/diagramCP';

export type Screenshot1015=1|2;
export type Screenshot1015Mode='fold'|'precrease';
const p=(x:number,y:number):Point=>[100*x,100*y];
const line=(id:string,a:Point,b:Point,assignment:Segment['assignment']='F'):Segment=>({id,a,b,assignment,angle:assignment==='M'?-180:assignment==='V'?180:0});

/** Exact square-root-of-two reconstruction of the screenshots supplied on
 * 2026-10-15. Coordinates are derived from the visible 22.5/45/67.5-degree
 * supports, not copied from partialCreaseNetworkFixture (which has different
 * retained marks). Gray=F, dashed blue=V, dot-dashed red=M.
 *
 * Image 1 square: (38,62)..(421,445); image 2: (70,45)..(525,500).
 * Both images have t=1-1/sqrt(2), h=sqrt(2)-1. Image 2 changes the upper-right
 * blue branch and adds five boundary-to-interior actions. It is not simply a
 * new set of marks added to image 1: old blue portions become gray F.
 */
export function screenshotStepAnimationDocuments1015(screenshot:Screenshot1015){
  const t=1-1/Math.sqrt(2),u=1-t,h=Math.SQRT2-1,k=h/2;
  const a=p(0,0),b=p(1,0),c=p(1,1),d=p(0,1);
  const upperLeft=p(t,t),lowerRight=p(u,u),topCenter=p(.5,k),upperRight=p(u,t),rightCenter=p(1-k,.5);
  const before=blankDoc(`截图 ${screenshot} 的全部展开痕`,100,100);
  const marks:[Point,Point][]=[
    [a,p(1,h)],[a,p(h,1)],[b,p(0,h)],[b,p(1-h,1)],
    [c,p(0,1-h)],[c,p(1-h,0)],[d,p(1,1-h)],[d,p(h,0)],
    [a,c],[b,d],[p(.5,0),p(.5,1)],[p(0,.5),p(1,.5)],
    [p(0,t),upperLeft],[upperRight,p(1,t)],
    [p(0,u),p(t,u)],[lowerRight,p(1,u)],
    [p(t,0),topCenter],[rightCenter,p(1,u)],
    [p(t,1),p(.5,1-k)],[p(0,u),p(k,.5)],
    [lowerRight,p(u,1)]
  ];
  before.segments.push(...marks.map(([start,end],i)=>line(`screenshot-mark-${i}`,start,end)));
  const common=[
    line('valley-upper-left',a,upperLeft,'V'),
    line('valley-left-long',upperLeft,d,'V'),
    line('valley-bottom-long',d,lowerRight,'V'),
    line('valley-lower-right',lowerRight,c,'V'),
    line('mountain-left-short',p(0,t),upperLeft,'M'),
    line('mountain-bottom-short',lowerRight,p(u,1),'M')
  ];
  const colored=screenshot===1?[
    ...common,line('valley-top-long',upperLeft,b,'V'),line('valley-right-long',b,lowerRight,'V')
  ]:[
    ...common,
    line('valley-top-left',upperLeft,topCenter,'V'),
    line('valley-top-right',topCenter,upperRight,'V'),
    line('valley-upper-right',upperRight,b,'V'),
    line('valley-right-top',upperRight,rightCenter,'V'),
    line('valley-right-bottom',rightCenter,lowerRight,'V'),
    line('valley-top-short',p(.5,0),topCenter,'V'),
    line('valley-right-short',rightCenter,p(1,.5),'V'),
    line('mountain-top-diagonal',p(t,0),topCenter,'M'),
    line('mountain-right-diagonal',rightCenter,p(1,u),'M'),
    line('mountain-right-short',upperRight,p(1,t),'M')
  ];
  const unfolded=normalizeDiagramCP(before).doc;
  const after=normalizeDiagramCP(applyDiagramFoldSegments(unfolded,colored)).doc;
  return {before:unfolded,after,colored,t,u,h,k};
}

export function screenshotStepAnimationFixture1015(screenshot:Screenshot1015,mode:Screenshot1015Mode){
  const docs=screenshotStepAnimationDocuments1015(screenshot);
  return projectFor(docs.before,mode==='fold'?docs.after:docs.before,mode==='precrease'?docs.colored:[],`screenshot-${screenshot}-${mode}`,docs);
}

export function screenshotTransitionFixture1015(){
  const first=screenshotStepAnimationDocuments1015(1),second=screenshotStepAnimationDocuments1015(2);
  return projectFor(first.after,second.after,[],'screenshot-1-to-2',second);
}

function projectFor<T>(before:Doc,after:Doc,precreases:Segment[],prefix:string,extra:T){
  let id=0,project=createDiagramProject(before,()=>`${prefix}-${++id}`);const step=project.steps[0];
  const beforeResult=computeFlatGeometry(buildDiagramFold(before).graph,1e-6);
  if(beforeResult.geometry.status==='ready')project=adoptDiagramPose(project,step.id,step.beforeId,beforeResult);
  project=updateDiagramCP(project,step.afterId,after);
  if(precreases.length)project=updateDiagramFoldLink(project,step.id,{enabled:true,layers:'all',selectedFaces:[],precreases});
  return {project,stepId:step.id,beforeResult,...extra};
}
