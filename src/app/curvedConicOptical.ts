/** Fixed, source-derived optical examples from Origamica section 45,
 * ConicSection2DSystem In[4019], saved calls In[4020]–In[4025]. */
export type Point2=[number,number];
export type ConicCell='In[4020]'|'In[4021]'|'In[4022]'|'In[4023]'|'In[4024]'|'In[4025]';
export type ConicKind='line'|'circle'|'parabola-left'|'parabola-right'|'ellipse'|'hyperbola';
export type ConicDefinition={cell:ConicCell;kind:ConicKind;label:string;
  leftFocus:number|null;rightFocus:number|null;leftCross:number;rightCross:number;
  end:number;description:string};

export const CONIC_OPTICAL_EXAMPLES:readonly ConicDefinition[]=[
  {cell:'In[4020]',kind:'line',label:'直线 · 双侧平行',leftFocus:null,rightFocus:null,
    leftCross:-1,rightCross:1,end:Math.PI/2,description:'fL=−∞，fR=+∞；hL=−1，hR=1'},
  {cell:'In[4021]',kind:'circle',label:'圆 · 同焦点',leftFocus:-1,rightFocus:-1,
    leftCross:-.5,rightCross:.5,end:Math.PI/2,description:'fL=fR=−1；hL=−1/2，hR=1/2'},
  {cell:'In[4022]',kind:'parabola-left',label:'抛物线 · 左侧平行',leftFocus:null,rightFocus:-1,
    leftCross:-1.5,rightCross:1.5,end:Math.PI/2,description:'fL=−∞，fR=−1；hL=−3/2，hR=3/2'},
  {cell:'In[4023]',kind:'parabola-right',label:'抛物线 · 右侧平行',leftFocus:-1,rightFocus:null,
    leftCross:-.5,rightCross:1,end:Math.PI/2,description:'fL=−1，fR=+∞；hL=−1/2，hR=1'},
  {cell:'In[4024]',kind:'ellipse',label:'椭圆 · 双焦点',leftFocus:-2,rightFocus:-1,
    leftCross:-1.5,rightCross:1,end:Math.PI/2,description:'fL=−2，fR=−1；hL=−3/2，hR=1'},
  {cell:'In[4025]',kind:'hyperbola',label:'双曲线 · 双焦点',leftFocus:-2,rightFocus:1,
    leftCross:-1.5,rightCross:.5,end:Math.PI/4,description:'fL=−2，fR=+1；hL=−3/2，hR=1/2'},
] as const;

export type ConicOpticalFrame={t:number;fold:Point2;secondLeft:Point2;
  secondRight:Point2;directrixLeft:Point2;directrixRight:Point2;
  directorLeft:Point2;directorRight:Point2};
export type ConicOpticalSample={source:ConicDefinition;frames:ConicOpticalFrame[];
  localPreviewDivisions:96;maxConicResidual:number;maxRayCollinearityResidual:number;
  maxDirectorUnitResidual:number;exactStraightCreaseFOLD:false;
  deploymentPathChecked:false;selfCollisionChecked:false;
  machineReadableWolframOut:false};

function definition(cell:ConicCell):ConicDefinition{
  const found=CONIC_OPTICAL_EXAMPLES.find(item=>item.cell===cell);
  if(!found)throw Error('未保存的圆锥曲线光学输入。');
  return found;
}

const subtract=(a:Point2,b:Point2):Point2=>[a[0]-b[0],a[1]-b[1]];
const cross=(a:Point2,b:Point2)=>a[0]*b[1]-a[1]*b[0];
const norm=(a:Point2)=>Math.hypot(...a);

/** The nine rules in In[4019], restricted to its six explicitly saved calls. */
export function conicOpticalFrameAt(cell:ConicCell,t:number):ConicOpticalFrame{
  const source=definition(cell);
  if(!Number.isFinite(t)||t<0||t>source.end)throw Error('参数超出原保存区间。');
  const {leftFocus:fl,rightFocus:fr,leftCross:hl,rightCross:hr}=source;
  const c=Math.cos(t),s=Math.sin(t),q=Math.tan(t/2);
  let fold:Point2,secondLeft:Point2,secondRight:Point2;
  let directrixLeft:Point2,directrixRight:Point2;
  let directorLeft:Point2,directorRight:Point2;
  if(source.kind==='line'){
    fold=[0,t];secondLeft=directrixLeft=[hl,t];secondRight=directrixRight=[hr,t];
    directorLeft=directorRight=[-1,0];
  }else if(source.kind==='circle'){
    const f=fl!;
    fold=[f-f*c,-f*s];
    directrixLeft=directrixRight=[f,0];
    directorLeft=directorRight=[-c,-s];
    secondLeft=[f+(hl-f)*c,(hl-f)*s];
    secondRight=[f+(hr-f)*c,(hr-f)*s];
  }else if(source.kind==='parabola-left'){
    const f=fr!,d=4*f*f+t*t;
    fold=[t*t/(4*f),t];
    secondLeft=directrixLeft=[hl,t];directorLeft=[-1,0];
    directrixRight=[f,0];
    directorRight=[1-8*f*f/d,4*f*t/d];
    secondRight=[(4*f*f*hr+(2*f-hr)*t*t)/d,4*f*(f-hr)*t/d];
  }else if(source.kind==='parabola-right'){
    const f=fl!,d=4*f*f+t*t;
    fold=[t*t/(4*f),t];
    directrixLeft=[f,0];
    directorLeft=[1-8*f*f/d,4*f*t/d];
    secondLeft=[(4*f*f*hl+(2*f-hl)*t*t)/d,4*f*(f-hl)*t/d];
    secondRight=directrixRight=[hr,t];directorRight=[-1,0];
  }else{
    const l=fl!,r=fr!,den=l+r+(r-l)*c,d=r*r+l*l*q*q;
    if(Math.abs(den)<1e-12)throw Error('曲线分母趋零，保存区间不正则。');
    fold=[l-2*l*r*c/den,-2*l*r*s/den];
    directrixLeft=[l,0];directorLeft=[-c,-s];
    secondLeft=[l+(hl-l)*c,(hl-l)*s];
    directrixRight=[r,0];
    directorRight=[1-2*r*r/d,-2*l*r*q/d];
    secondRight=[-hr+2*r*(1+r*(hr-r)/d),2*l*r*(hr-r)*q/d];
  }
  return {t,fold,secondLeft,secondRight,directrixLeft,directrixRight,
    directorLeft,directorRight};
}

/** Independent implicit conic equation, normalized to zero at the source curve. */
export function conicImplicitResidual(kind:ConicKind,[x,y]:Point2):number{
  switch(kind){
    case 'line':return x;
    case 'circle':return (x+1)**2+y*y-1;
    case 'parabola-left':case 'parabola-right':return x+y*y/4;
    case 'ellipse':return (8*(x+1.5)**2+9*y*y-18)/18;
    case 'hyperbola':return (x+.5)**2/.25-y*y/2-1;
  }
}

export function sampleConicOptical(cell:ConicCell):ConicOpticalSample{
  const source=definition(cell),frames=Array.from({length:97},(_,i)=>
    conicOpticalFrameAt(cell,source.end*i/96));
  let maxConicResidual=0,maxRayCollinearityResidual=0,maxDirectorUnitResidual=0;
  for(const row of frames){
    maxConicResidual=Math.max(maxConicResidual,Math.abs(conicImplicitResidual(source.kind,row.fold)));
    for(const [focus,crossPoint,dir] of [
      [row.directrixLeft,row.secondLeft,row.directorLeft],
      [row.directrixRight,row.secondRight,row.directorRight],
    ] as [Point2,Point2,Point2][]){
      const a=subtract(focus,row.fold),b=subtract(crossPoint,row.fold);
      const scale=Math.max(norm(a)*norm(b),1);
      maxRayCollinearityResidual=Math.max(maxRayCollinearityResidual,Math.abs(cross(a,b))/scale);
      maxDirectorUnitResidual=Math.max(maxDirectorUnitResidual,Math.abs(norm(dir)-1));
    }
  }
  if(maxConicResidual>1e-11||maxRayCollinearityResidual>1e-11||maxDirectorUnitResidual>1e-11)
    throw Error('圆锥曲线保存公式校核未通过。');
  return {source,frames,localPreviewDivisions:96,maxConicResidual,
    maxRayCollinearityResidual,maxDirectorUnitResidual,exactStraightCreaseFOLD:false,
    deploymentPathChecked:false,selfCollisionChecked:false,machineReadableWolframOut:false};
}
