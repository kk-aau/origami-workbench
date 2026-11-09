export type EllipsePoint=[number,number];
/** Numerical input to Origamica In[458]. Angles in project/UI degrees. */
export type EquilateralEllipseSource={kind:'equilateral-ellipse';count:number;
  semiAxes:[number,number];phaseDeg:number;rotationDeg:number};
export type JoinedEllipseSource={ellipse:EquilateralEllipseSource;
  topRotationDeg:number;topShift:number;pleatReduction?:number};

const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
export function readEquilateralEllipseSource(value:unknown):EquilateralEllipseSource|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const r=value as Record<string,unknown>;
  if(Object.keys(r).some(k=>!['kind','count','semiAxes','phaseDeg','rotationDeg'].includes(k))||
    r.kind!=='equilateral-ellipse'||!finite(r.count)||!Number.isInteger(r.count)||r.count<3||r.count>48||
    !Array.isArray(r.semiAxes)||r.semiAxes.length!==2||!r.semiAxes.every(finite)||
    Math.min(...r.semiAxes)<.001||Math.max(...r.semiAxes)>1000||Math.max(...r.semiAxes)/Math.min(...r.semiAxes)>4||
    !finite(r.phaseDeg)||Math.abs(r.phaseDeg)>360||!finite(r.rotationDeg)||Math.abs(r.rotationDeg)>360)return null;
  return {kind:'equilateral-ellipse',count:r.count,semiAxes:[r.semiAxes[0],r.semiAxes[1]],
    phaseDeg:r.phaseDeg,rotationDeg:r.rotationDeg};
}

export function defaultEquilateralEllipseSource(count=16):EquilateralEllipseSource{
  return {kind:'equilateral-ellipse',count,semiAxes:[(1+Math.sqrt(5))/2,1],phaseDeg:0,rotationDeg:0};
}

function solveLinear(a:number[][],b:number[]):number[]|null{
  const n=b.length,rows=a.map((row,i)=>[...row,b[i]]);
  for(let k=0;k<n;k++){
    let pivot=k;
    for(let i=k+1;i<n;i++)if(Math.abs(rows[i][k])>Math.abs(rows[pivot][k]))pivot=i;
    if(Math.abs(rows[pivot][k])<1e-14)return null;
    [rows[k],rows[pivot]]=[rows[pivot],rows[k]];
    for(let i=k+1;i<n;i++){
      const q=rows[i][k]/rows[k][k];
      for(let j=k;j<=n;j++)rows[i][j]-=q*rows[k][j];
    }
  }
  const result=Array<number>(n).fill(0);
  for(let i=n-1;i>=0;i--){let q=rows[i][n];for(let j=i+1;j<n;j++)q-=rows[i][j]*result[j];result[i]=q/rows[i][i];}
  return result.every(Number.isFinite)?result:null;
}

/** The source's m closed equal-chord equations, with psi[0]=phi and d>0.
 * Uses its uniform-polar-angle/mean-perimeter seed. Only a simple CCW single
 * circuit is accepted; a failed Newton solve never falls back to old vertices.
 */
export function solveEquilateralEllipse(input:EquilateralEllipseSource):EllipsePoint[]{
  const source=readEquilateralEllipseSource(input);
  if(!source)throw Error('等弦椭圆须为 3–48 点，两个半轴均为 0.001–1000，轴比不超过 4，角度在 ±360° 内。');
  const {count:m,semiAxes:[scale,minor],phaseDeg,rotationDeg}=source;
  const b=minor/scale,phi=phaseDeg*Math.PI/180;
  const point=(t:number):[EllipsePoint,EllipsePoint]=>{
    const c=Math.cos(t),s=Math.sin(t),g=Math.sqrt(c*c+s*s/(b*b)),dg=c*s*(1/(b*b)-1)/g;
    return [[c/g,s/g],[-s/g-c*dg/(g*g),c/g-s*dg/(g*g)]];
  };
  let z=[Math.PI*(1+b)/m,...Array.from({length:m-1},(_,j)=>phi+2*Math.PI*(j+1)/m)];
  const ordered=(v:number[])=>v[0]>1e-10&&[phi,...v.slice(1),phi+2*Math.PI].every((t,i,angles)=>
    Number.isFinite(t)&&(i===0||t-angles[i-1]>1e-8));
  const evaluate=(v:number[])=>{
    const pts=[phi,...v.slice(1)].map(point),f:number[]=[],jac:number[][]=[];
    for(let i=0;i<m;i++){
      const j=(i+1)%m,dx=pts[i][0][0]-pts[j][0][0],dy=pts[i][0][1]-pts[j][0][1];
      f.push(dx*dx+dy*dy-v[0]*v[0]);
      const row=Array<number>(m).fill(0);row[0]=-2*v[0];
      if(i>0)row[i]+=2*(dx*pts[i][1][0]+dy*pts[i][1][1]);
      if(j>0)row[j]-=2*(dx*pts[j][1][0]+dy*pts[j][1][1]);
      jac.push(row);
    }
    return {f,jac,error:f.reduce((sum,x)=>sum+x*x,0),maximum:Math.max(...f.map(Math.abs))};
  };
  let solved=false;
  for(let iteration=0;iteration<100;iteration++){
    const current=evaluate(z);
    if(current.maximum<2e-14){solved=true;break;}
    const step=solveLinear(current.jac,current.f.map(x=>-x));
    if(!step)break;
    let accepted=false;
    for(let damping=1;damping>=2**-24;damping/=2){
      const next=z.map((x,i)=>x+damping*step[i]);
      if(ordered(next)&&evaluate(next).error<current.error){z=next;accepted=true;break;}
    }
    if(!accepted)break;
  }
  if(!solved||!ordered(z))throw Error('此参数未求得按顶点次序闭合的等弦解；请调整点数、半轴或起相位。');
  const theta=rotationDeg*Math.PI/180,c=Math.cos(theta),s=Math.sin(theta);
  const points=[phi,...z.slice(1)].map(t=>{
    const [p]=point(t);return [scale*(c*p[0]-s*p[1]),scale*(s*p[0]+c*p[1])] as EllipsePoint;
  });
  const chords=points.map((p,i)=>Math.hypot(p[0]-points[(i+1)%m][0],p[1]-points[(i+1)%m][1]));
  if(Math.max(...chords)-Math.min(...chords)>2e-10*scale||Math.min(...chords)<1e-8||
    points.some((p,i)=>{
      const q=points[(i+1)%m],r=points[(i+2)%m];
      return (q[0]-p[0])*(r[1]-q[1])-(q[1]-p[1])*(r[0]-q[0])<=1e-12*scale*scale;
    }))throw Error('等弦解未通过闭合、凸性或弦长核验。');
  return points;
}

export function ellipsePointsMatch(actual:EllipsePoint[],expected:EllipsePoint[]):boolean{
  const scale=Math.max(...expected.flat().map(Math.abs));
  return actual.length===expected.length&&actual.every((p,i)=>Math.hypot(p[0]-expected[i][0],p[1]-expected[i][1])<=2e-9*scale);
}

export function readJoinedEllipseSource(value:unknown,double=false):JoinedEllipseSource|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const r=value as Record<string,unknown>,ellipse=readEquilateralEllipseSource(r.ellipse);
  if(!ellipse||Object.keys(r).some(k=>!['ellipse','topRotationDeg','topShift','pleatReduction'].includes(k))||
    !finite(r.topRotationDeg)||Math.abs(r.topRotationDeg)>360||!finite(r.topShift)||!Number.isInteger(r.topShift)||
    r.topShift<0||r.topShift>=(double?2:1)*ellipse.count||
    (double?(!finite(r.pleatReduction)||r.pleatReduction<=0||r.pleatReduction>=1):r.pleatReduction!==undefined))return null;
  return {ellipse,topRotationDeg:r.topRotationDeg,topShift:r.topShift,...(double?{pleatReduction:r.pleatReduction as number}:{})};
}
