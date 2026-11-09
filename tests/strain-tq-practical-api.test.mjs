import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=process.env.STRAIN_TQ_API_ROOT||path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixturePath=process.env.STRAIN_TQ_API_FIXTURE||path.join(root,'tests/fixtures/strain-tq-source-1012.json');
const fixtures=JSON.parse(await readFile(fixturePath,'utf8')).cases;
const vec={sub:(a,b)=>a.map((v,i)=>v-b[i]),dot:(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm:a=>Math.hypot(...a)};
const unit=a=>a.map(x=>x/vec.norm(a)),centroid=(p,f)=>[0,1,2].map(k=>f.reduce((s,i)=>s+p[i][k],0)/f.length);
function neighbors(q){const rows=[];q.edges.forEach(([a,b],e)=>{const left=q.faces.find(f=>f.some((v,i)=>v===a&&f[(i+1)%f.length]===b)),right=q.faces.find(f=>f.some((v,i)=>v===b&&f[(i+1)%f.length]===a));if(left&&right)rows.push({e,a,b,left,right});});return rows;}
function quadEnergy(v,sign){const a=vec.sub(v[1],v[0]),b=vec.sub(v[2],v[0]),c=vec.sub(v[3],v[0]),n1=vec.cross(a,b),n2=vec.cross(b,c);return vec.norm(b)*(1+sign*vec.dot(n1,n2)/(vec.norm(n1)*vec.norm(n2)))/2;}
function originalSigns(q,p){return neighbors(q).map(({e,a,b,left,right})=>{const axis=vec.sub(p[b],p[a]),n1=unit(vec.cross(vec.sub(centroid(p,right),p[a]),axis)),n2=unit(vec.cross(axis,vec.sub(centroid(p,left),p[a]))),sine=vec.dot(vec.cross(n1,n2),unit(axis));return q.assignments[e]==='V'?sine:-sine;});}
function originalProof(query,native){
 const cp=query.verticesOriginal,p=native.solutionVertices3DOriginal;
 const error=(a,b)=>vec.norm(vec.sub(p[a],p[b]))/vec.norm(vec.sub(cp[a],cp[b]))-1;
 for(const [a,b] of query.edges)assert.ok(Math.abs(error(a,b))<2e-8,'each original edge metric');
 let bend=0;
 for(const f of query.faces){if(f.length!==4)continue;const u=error(f[0],f[2]),v=error(f[1],f[3]);if(query.quadBendStiffness==='rigid')assert.ok(Math.max(Math.abs(u),Math.abs(v))<2e-8,'both original rigid diagonals');else {assert.ok(Math.abs(u*v)<2e-8,'original factor product');assert.ok(Math.abs(u)<2e-8,'declared 13 engineering chart');bend+=query.quadBendStiffness*(quadEnergy(f.map(i=>p[i]),-1)+quadEnergy([...f.slice(1),f[0]].map(i=>p[i]),-1));}}
 for(const c of query.pointConstraints)assert.deepEqual(p[c.vertex],c.target,'hard point original literal target');
 for(const c of query.planeConstraints)for(const i of c.vertices)assert.ok(Math.abs(vec.dot(vec.sub(p[i],c.point),c.normal))<2e-8,'original plane equation');
 const flat=query.flatFoldStiffness*neighbors(query).reduce((s,{a,b,right,left})=>s+quadEnergy([p[a],centroid(p,right),p[b],centroid(p,left)],1),0);
 assert.ok(Math.abs(native.energy.quadBendEnergyWeighted-bend)<2e-10,'original weighted bend energy');assert.ok(Math.abs(native.energy.edgeFlatFoldEnergyWeighted-flat)<2e-10,'original weighted flat energy');assert.ok(Math.abs(native.energy.objective-bend-flat)<2e-10,'original total energy');
 const signs=query.constrainFromAssignment?originalSigns(query,p):[];assert.equal(native.residuals.assignmentInequalityValues.length,signs.length);signs.forEach((x,i)=>{assert.ok(x>=-2e-8,'original assignment inequality');assert.ok(Math.abs(x-native.residuals.assignmentInequalityValues[i])<2e-10,'original +sin/-sin response value');});
 return {originalEdgesChecked:query.edges.length,allOriginalMetricsAndExternalConstraintsChecked:true,independentOriginalEnergy:bend+flat,assignmentConstraintsActuallyEnabled:query.constrainFromAssignment,independentAssignmentValues:signs,minimumAssignmentValue:signs.length?Math.min(...signs):null};
}

test('bounded original TQ API rejects invalid inputs and returns honest independently checked original minima',async()=>{
 const out=process.env.STRAIN_TQ_API_EVIDENCE||path.join(root,'output/strain-tq-practical-api-tests');await mkdir(out,{recursive:true});
 const child=spawn(process.execPath,['server.mjs'],{cwd:root,windowsHide:true,env:{...process.env,ZHEZHI_PORT:'0',ZHEZHI_DATA_DIR:path.join(out,'owned-data'),PYTHONDONTWRITEBYTECODE:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'},stdio:['ignore','pipe','pipe']});
 let port=0,output='',exited=false;const requests=[],signWitnesses=[];child.once('exit',()=>{exited=true;});
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(output||'Test service did not start')),10000);child.stdout.on('data',chunk=>{output+=chunk;const m=/http:\/\/127\.0\.0\.1:(\d+)/.exec(output);if(m){port=Number(m[1]);clearTimeout(timer);resolve();}});child.stderr.on('data',chunk=>{output+=chunk;});child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);if(!port)reject(new Error(`Test service exit ${code}: ${output}`));});});
  const base=`http://127.0.0.1:${port}`,health=await(await fetch(base+'/api/health')).json();
  const post=async(route,input)=>{const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','X-Zhezhi-Token':health.token},body:JSON.stringify(input),signal:AbortSignal.timeout(65000)});return {status:response.status,value:await response.json()};};
  const route='/api/tessellation/strain-tq-practical',plain=fixtures.find(r=>r.name==='pleat-free'),assigned=fixtures.find(r=>r.name==='pleat-stiff-assignment-enabled');assert.ok(plain&&assigned&&assigned.query.constrainFromAssignment===true,'fixture includes actual enabled assignment recipe');
  for(const [field,value] of [['model','unrestricted-symbolic'],['unitMm',0],['unitMm',true],['unitMm','100'],['unitMm',NaN],['sourceKey','execute arbitrary code'],['unknown',1],['gravity',1],['quadBendStiffness',-1],['flatFoldStiffness',21],['constrainFromAssignment','true']]){
   const query=structuredClone(plain.query);query[field]=value;const result=await post(route,query);assert.equal(result.status,422,field);assert.equal(typeof result.value.error,'string');requests.push({kind:'invalid',field,status:result.status,actualHTTP:true});
  }
  for(const kind of ['duplicate-edge','changed-original-vertex','changed-literal-initial','duplicate-target','degenerate-plane','unreachable-target']){
   const query=structuredClone(plain.query),r=JSON.parse(query.sourceKey);
   if(kind==='duplicate-edge')query.edges.push([...query.edges[0]]);
   if(kind==='changed-original-vertex')query.verticesOriginal[0][0]+=4*Number.EPSILON;
   if(kind==='changed-literal-initial')query.initialVertices3DOriginal[1][2]=1e-15;
   if(kind==='duplicate-target')r.pointConstraints.push(structuredClone(r.pointConstraints[0]));
   if(kind==='degenerate-plane')r.planeConstraints=[{vertices:[1,2],point:[0,0,0],normal:[0,0,0]}];
   if(kind==='unreachable-target')r.pointConstraints.at(-1).target=[20,20,20];
   query.pointConstraints=r.pointConstraints;query.planeConstraints=r.planeConstraints;query.sourceKey=JSON.stringify(r);const result=await post(route,query);assert.equal(result.status,422,kind);assert.equal(typeof result.value.error,'string');requests.push({kind:'invalid',field:kind,status:result.status,actualHTTP:true});
  }
  const generic=await post('/api/tessellate',{operation:'strain-tq-practical'});assert.equal(generic.status,400);requests.push({kind:'wrong-route',status:generic.status,actualHTTP:true});
  for(const row of [plain,assigned]){
   const result=await post(route,row.query),native=result.value;assert.equal(result.status,200,row.name);assert.equal(native.schema,'original-in2656-engineering-minimum-v1');assert.deepEqual(native.query,row.query);assert.equal(native.sourceKey,row.query.sourceKey);
   assert.equal(native.solutionVertices3DOriginal.length,row.query.verticesOriginal.length);assert.ok(native.solutionVertices3DOriginal.every(p=>p.length===3&&p.every(Number.isFinite)));assert.ok(native.residuals.maximumOriginalConstraint<2e-8);assert.ok(native.residuals.maximumMinimumDiagonalError<2e-7);assert.ok(native.residuals.projectedGradient<2e-5);assert.equal(native.solver.engineeringChecksPassed,true);assert.equal(native.solver.originalInitialVerticesRetained,true);
   assert.equal(native.source.definitionCell,'In[2656]');assert.equal(native.source.gravityDeclaredButUnused,true);for(const k of ['WolframExecuted','originalMinimumOrBranchCertified','staticSceneCertified','continuousMotionCertified'])assert.equal(native.source[k],false,k);assert.ok(!('scene' in native)&&!('flatFold' in native),'no invented Scene/FF');
   const proof=originalProof(row.query,native);if(row===assigned)assert.ok(proof.minimumAssignmentValue>0,'enabled original inequalities are genuinely valid');await writeFile(path.join(out,row.name+'-actual-api-response.json'),JSON.stringify(native,null,2)+'\n');requests.push({kind:'valid',model:row.name,status:result.status,actualHTTP:true,sourceKey:native.sourceKey,proof,fixtureSolutionCompared:false});
  }
  // In[2636]/In[2638] literal sign convention, separately checking both
  // signs. This is a mathematical witness, never a fictitious HTTP response.
  for(const theta of [-Math.PI/3,Math.PI/3]){const axis=[0,1,0],a=[Math.cos(theta),.5,Math.sin(theta)],b=[-1,.5,0],n1=unit(vec.cross(a,axis)),n2=unit(vec.cross(axis,b)),sine=vec.dot(vec.cross(n1,n2),axis);assert.ok(Math.abs(sine-Math.sin(theta))<1e-15);assert.ok(theta<0?sine<0&&-sine>0:sine>0&&-sine<0);signWitnesses.push({theta,valleyPlusSin:sine,mountainMinusSin:-sine,bothDirectionsChecked:true,actualHTTP:false});}
  await writeFile(path.join(out,'api-checks.json'),JSON.stringify({verified:true,requests,literalSignWitnesses:signWitnesses,invalidRequests:17,validSmallModels:2,fixtureResponsesUsed:false,fixtureSolutionsCompared:false,nonuniqueSolutionByteEqualityRequired:false,independentOriginalGeometryAndEnergyChecked:true,solverLogsAreNotSourceSignatures:true,actualBrowserVerified:false,machineVerified:false},null,2)+'\n');
 }catch(error){await writeFile(path.join(out,'api-failure.json'),JSON.stringify({verified:false,error:String(error.stack??error),requests,actualHTTP:true,fixtureResponsesUsed:false},null,2)+'\n');throw error;}
 finally{if(!exited){const finished=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await Promise.race([finished,new Promise(resolve=>setTimeout(resolve,5000).unref())]);if(!exited)child.kill('SIGKILL');}await writeFile(path.join(out,'owned-runtime-cleanup.json'),JSON.stringify({pid:child.pid,exited,ownedOnly:true},null,2)+'\n');}
});
