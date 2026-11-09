import type {FoldProfile,PreparedOrigamiModel} from '../../vendor/simulator/oristudio/packages/origami-simulator/src/types';

interface AngleCount {
  /** Driven M/V creases, plus non-flat F creases explicitly driven by a profile. */
  creaseCount:number;
  /** U edges have no target in the solver, even when their source stores an angle. */
  unassignedCreaseCount:number;
}
export type SimulationAngleDiagnostics=(AngleCount&{
  status:'available';
  meanSignedErrorDegrees:number;
  meanAbsoluteErrorDegrees:number;
  maxAbsoluteErrorDegrees:number;
  worstSignedErrorDegrees:number;
  worstEdge:number;
})|(AngleCount&{status:'unavailable';reason:string});
export type SimulationSolveState='solving'|'low-velocity'|'paused'|'unavailable';

/** Measure real geometry, using solver history only to retain the signed fold
 * branch. In particular +179 toward -180 is not silently treated as -181. */
export class SimulationAngleAnalyzer {
  private readonly normals:Float64Array;
  private readonly validNormals:Uint8Array;
  private readonly measured:Float64Array;
  private readonly unassigned:number;
  private valid=false;
  constructor(private readonly prepared:PreparedOrigamiModel){
    this.normals=new Float64Array(prepared.faceCount*3);this.validNormals=new Uint8Array(prepared.faceCount);
    this.measured=new Float64Array(prepared.creaseParams.length);this.measured.fill(NaN);
    this.unassigned=prepared.edgesAssignment.reduce((sum,assignment,e)=>sum+(assignment==='U'&&prepared.edgesFaces[e]?.length===2?1:0),0);
  }
  measure(positions:ArrayLike<number>,history:ArrayLike<number>):void{
    const p=this.prepared;this.valid=false;this.measured.fill(NaN);this.validNormals.fill(0);
    if(positions.length!==p.vertexCount*3||history.length!==p.creaseParams.length)return;
    for(let i=0;i<positions.length;i++)if(!Number.isFinite(positions[i]))return;
    for(let face=0;face<p.faceCount;face++){
      const a=p.indices[face*3]!*3,b=p.indices[face*3+1]!*3,c=p.indices[face*3+2]!*3;
      const ux=positions[b]!-positions[a]!,uy=positions[b+1]!-positions[a+1]!,uz=positions[b+2]!-positions[a+2]!;
      const vx=positions[c]!-positions[a]!,vy=positions[c+1]!-positions[a+1]!,vz=positions[c+2]!-positions[a+2]!;
      const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,length=Math.hypot(nx,ny,nz);
      if(!Number.isFinite(length)||length<=Math.hypot(ux,uy,uz)*Math.hypot(vx,vy,vz)*1e-12)continue;
      this.normals[face*3]=nx/length;this.normals[face*3+1]=ny/length;this.normals[face*3+2]=nz/length;this.validNormals[face]=1;
    }
    for(let i=0;i<p.creaseParams.length;i++){
      const crease=p.creaseParams[i]!,previous=history[i]!;
      if(!Number.isFinite(previous)||!this.validNormals[crease.face1]||!this.validNormals[crease.face2])continue;
      const edge=p.edgesVertices[crease.edge]!,a=edge[0]*3,b=edge[1]*3;
      const ex=positions[b]!-positions[a]!,ey=positions[b+1]!-positions[a+1]!,ez=positions[b+2]!-positions[a+2]!,length=Math.hypot(ex,ey,ez);
      if(!Number.isFinite(length)||length<=0)continue;
      const f=crease.face1*3,g=crease.face2*3,nx=this.normals[f]!,ny=this.normals[f+1]!,nz=this.normals[f+2]!;
      const mx=this.normals[g]!,my=this.normals[g+1]!,mz=this.normals[g+2]!;
      const sine=((ny*ez-nz*ey)*mx+(nz*ex-nx*ez)*my+(nx*ey-ny*ex)*mz)/length;
      const principal=Math.atan2(sine,Math.max(-1,Math.min(1,nx*mx+ny*my+nz*mz)));
      // Match the solver's unwrapping threshold, including exact +/-180 cases.
      let delta=principal-previous;if(delta < -5)delta+=Math.PI*2;else if(delta > 5)delta-=Math.PI*2;
      this.measured[i]=(previous+delta)*180/Math.PI;
    }
    this.valid=true;
  }
  /** All actual hinges, including undriven and flexible-panel hinges. */
  withinFoldLimit():boolean{
    return this.valid&&this.measured.every(angle=>Number.isFinite(angle)&&Math.abs(angle)<=180);
  }
  unavailable(reason:string):SimulationAngleDiagnostics{
    return {status:'unavailable',creaseCount:this.prepared.creaseParams.filter(c=>['M','V'].includes(this.prepared.edgesAssignment[c.edge]!)).length,
      unassignedCreaseCount:this.unassigned,reason};
  }
  evaluate(progress:number,profile:FoldProfile|null=null):SimulationAngleDiagnostics{
    if(!Number.isFinite(progress)||progress < -1||progress > 1)return this.unavailable('目标比例无效，未计算折角偏差。');
    const ranges=new Map<number,{fromAngle:number;toAngle:number}>();
    for(const range of profile?.ranges??[]){
      if(!Number.isInteger(range.edge)||range.edge<0||range.edge>=this.prepared.edgeCount||ranges.has(range.edge)||!Number.isFinite(range.fromAngle)||!Number.isFinite(range.toAngle))return this.unavailable('折角目标配置无效，未计算偏差。');
      ranges.set(range.edge,range);
    }
    let count=0,total=0,totalAbsolute=0,maxAbsolute=-1,worstSigned=0,worstEdge=-1,invalid=false;
    for(let i=0;i<this.prepared.creaseParams.length;i++){
      const crease=this.prepared.creaseParams[i]!,assignment=this.prepared.edgesAssignment[crease.edge],range=ranges.get(crease.edge);
      if(assignment!=='M'&&assignment!=='V'&&!(assignment==='F'&&range&&(range.fromAngle!==0||range.toAngle!==0)))continue;
      count++;
      const target=range?range.fromAngle+(range.toAngle-range.fromAngle)*progress:crease.targetAngle*progress;
      const error=this.measured[i]!-target;
      if(!this.valid||!Number.isFinite(error)){invalid=true;continue;}
      total+=error;totalAbsolute+=Math.abs(error);
      if(Math.abs(error)>maxAbsolute){maxAbsolute=Math.abs(error);worstSigned=error;worstEdge=crease.edge;}
    }
    const base={creaseCount:count,unassignedCreaseCount:this.unassigned};
    if(!count)return {...base,status:'unavailable',reason:this.unassigned?'当前只有无驱动目标的未赋型折痕，不能判断目标角偏差。':'当前没有可比较的驱动折痕。'};
    if(invalid)return {...base,status:'unavailable',reason:'当前纸面退化或折角历史无效，不能可靠测量全部折痕。'};
    return {...base,status:'available',meanSignedErrorDegrees:total/count,meanAbsoluteErrorDegrees:totalAbsolute/count,
      maxAbsoluteErrorDegrees:maxAbsolute,worstSignedErrorDegrees:worstSigned,worstEdge};
  }
}
