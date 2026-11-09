import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import {serializeProject} from '../src/core/projectData.mjs';
import {withProjectBaseRevision} from './helpers/project-base-revision.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let port = 0;
let child, testData, tempBase, token;
let serverOutput = '';

function request(route, { method = 'GET', json, raw, headers = {}, timeout = 65000, signal } = {}) {
  const payload = raw ?? (json === undefined ? undefined : JSON.stringify(json));
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: route, method, signal,
      headers: { ...(payload !== undefined ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}), ...headers } }, res => {
      res.setEncoding('utf8');
      let text = '';
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => {
        let value;
        try { value = JSON.parse(text); } catch { value = null; }
        resolve({ status: res.statusCode, headers: res.headers, text, value });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => req.destroy(new Error(`Test request timeout: ${route}`)));
    req.end(payload);
  });
}
const auth = () => ({ 'X-Zhezhi-Token': token });
const doc = (name = '接口测试·中文山谷工程') => ({
  version: 1, name, paper: { width: 200, height: 160 },
  segments: [
    { id: 'm1', a: [-100, 0], b: [100, 0], assignment: 'M', angle: -180 },
    { id: 'v1', a: [0, -80], b: [0, 80], assignment: 'V', angle: 90 },
    { id: 'u1', a: [30, -80], b: [30, 80], assignment: 'U', angle: null },
  ],
  note: '中文往返；山 M 为负，谷 V 为正；未知角度不变成零。',
});
const post = async(route, json, options = {}) => request(route, { method: 'POST', json:await withProjectBaseRevision(route,json,request), headers: auth(), ...options });

beforeEach(async () => {
  serverOutput='';port=0;
  tempBase = await realpath(os.tmpdir());
  testData = await mkdtemp(path.join(tempBase, 'zhezhi-api-test-'));
  child = spawn(process.env.ZHEZHI_RUST_SERVER || process.execPath, process.env.ZHEZHI_RUST_SERVER ? [] : ['server.mjs'], {
    cwd: root, windowsHide: true,
    env: { ...process.env, ZHEZHI_PORT: String(port), ZHEZHI_DATA_DIR: testData },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  const started = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Test server did not start: ${serverOutput}`)), 10000);
    child.stdout.on('data', chunk => {
      serverOutput += chunk;
      const ready=/http:\/\/127\.0\.0\.1:(\d+)/.exec(serverOutput);
      if (ready) { port=Number(ready[1]);clearTimeout(timer); resolve(); }
    });
    child.stderr.on('data', chunk => { serverOutput += chunk; });
    child.once('error', err => { clearTimeout(timer); reject(err); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Test server exited ${code}: ${serverOutput}`)); });
  });
  await started;
  const health = await request('/api/health');
  assert.equal(health.status, 200);
  token = health.value.token;
});

afterEach(async () => {
  if (child && child.exitCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGTERM');
    const shutdownTimer = new AbortController();
    await Promise.race([exited, delay(5000, undefined, { signal: shutdownTimer.signal }).catch(() => {})]);
    shutdownTimer.abort();
    if (child.exitCode === null && !child.signalCode) child.kill('SIGKILL');
  }
  if (testData) {
    // Only remove the exact directory this test created under the resolved temp
    // root. Never use the application's real data directory as a cleanup target.
    assert.equal(path.dirname(path.resolve(testData)), tempBase);
    assert.match(path.basename(testData), /^zhezhi-api-test-/);
    await rm(testData, { recursive: true, force: true });
  }
});

describe('local workbench API', { concurrency: false }, () => {
  it('exposes literal old Uncurl with fixed-zero integration, raw normals and preserved undefined rules', async()=>{
    const route='/api/tessellation/curved-uncurl-generic',q={family:'uncurl-generic-native',curve:['sin(s)','1-cos(s)','0'],normal:['0','0','2'],parameterStart:1,parameterEnd:2,segments:8,initialPoint:[3,-2],initialTangent:[0,7]};
    assert.equal((await request(route,{method:'POST',json:q})).status,403);
    const result=await post(route,q);assert.equal(result.status,200,result.text);const r=result.value;
    assert.equal(r.family,'origamica-generic-uncurl');assert.equal(r.source.ruleOrder.length,20);assert.deepEqual(r.domain.integrationInterval,[0,2]);assert.equal(r.domain.recoveryStatus,'ready');assert.equal(r.normalization.anchorParameter,0);
    assert.equal(r.diagnostics.initialTangentMagnitude,7);assert.equal(r.diagnostics.initialTangentMagnitudePreserved,false);assert.equal(r.diagnostics.sourceNormalNormalized,false);
    for(const row of r.sample.rows){assert.deepEqual(Object.keys(row.rules),r.source.ruleOrder);assert.ok(Math.abs(row.rules.GeodesicCurvature3D-2)<1e-12);assert.deepEqual(row.rules.SurfaceNormalVector3D,[0,0,2]);assert.ok(Math.abs(row.recoveredCurve[0]-(3-(1-Math.cos(2*row.s))/2))<1e-9);assert.ok(Math.abs(row.recoveredCurve[1]-(-2+Math.sin(2*row.s)/2))<1e-9);}
    assert.equal(r.certification.globalFoldingCertified,false);assert.equal(r.certification.adoptableCreasePattern,false);assert.equal(r.certification.integrationErrorIntervalCertified,false);
    const straight=await post(route,{...q,curve:['s','0','sqrt(0)'],normal:['0','0','1']});assert.equal(straight.status,200,straight.text);assert.equal(straight.value.domain.recoveryStatus,'ready');assert.equal(straight.value.sample.rows[0].rules.Torsion3D,null);assert.equal(straight.value.sample.rows[0].rules.FrenetDarbouxAngle,null);assert.ok(straight.value.sample.rows.every(row=>row.recoveredCurve));
    const singular=await post(route,{...q,normal:['0','0','1/s']});assert.equal(singular.status,200,singular.text);assert.equal(singular.value.domain.recoveryStatus,'undefined');assert.ok(singular.value.sample.rows.every(row=>row.sourceCurve&&row.recoveredCurve===null));
    for(const bad of [{...q,initialParameter:1},{...q,segments:129},{...q,curve:['process.exit()','s','0']}])assert.equal((await post(route,bad)).status,422);
    assert.equal((await post('/api/tessellate',{...q,operation:'curved-uncurl-generic'})).status,400);
  });
  it('queries spherical four-vertex bounds without changing tessellation generation', async()=>{
    const route='/api/tessellation/spherical-vertex';
    assert.equal((await request(route,{method:'POST',json:{sectorAnglesDeg:[90,45,135,90]}})).status,403);
    const result=await post(route,{sectorAnglesDeg:[90,45,135,90]});
    assert.equal(result.status,200,result.text);
    assert.deepEqual(result.value.sectorAnglesDeg,[90,45,135,90]);
    assert.equal(result.value.kind,'local-degree4-dihedral-bound');
    assert.equal(result.value.selfCollisionChecked,false);
    assert.equal(result.value.foldedForm3D,false);
    for(const [actual,expected] of result.value.maximumDihedralsDeg.map((a,i)=>[a,[90,180,180,180][i]]))assert.ok(Math.abs(actual-expected)<1e-9);
    for(const angles of [[90,45,135],[0,45,135,90],[90,true,135,90],[90,90,90,80]])assert.equal((await post(route,{sectorAnglesDeg:angles})).status,422);
    assert.equal((await post('/api/tessellate',{operation:'spherical-maximum-dihedrals',sectorAnglesDeg:[90,45,135,90]})).status,400);
    const generated=await post('/api/tessellate',{family:'twist',sides:4,angle:36,scale:.5});
    assert.equal(generated.status,200,generated.text);
    assert.equal(generated.value.stats.checks.geometry.status,'passed');
  });
  it('classifies local degree-four pair geometry for both major/minor choices', async()=>{
    const route='/api/tessellation/degree4-branches';
    assert.equal((await request(route,{method:'POST',json:{sectorAnglesDeg:[90,45,135,90]}})).status,403);
    const result=await post(route,{sectorAnglesDeg:[90,45,135,90]});
    assert.equal(result.status,200,result.text);
    assert.equal(result.value.kind,'local-degree4-branch-geometry');
    assert.equal(result.value.flatFoldable,false);
    assert.ok(Math.abs(result.value.flatFoldabilityExcessDeg-90)<1e-9);
    assert.equal(result.value.minorFirst.straightMajor,true);
    assert.equal(result.value.majorFirst.straightMinor,true);
    assert.deepEqual(result.value.minorFirst.minorCreases,[1,3]);
    assert.equal(result.value.assignmentChosen,false);
    assert.equal(result.value.selfCollisionChecked,false);
    assert.equal(result.value.foldedForm3D,false);
    const flat=await post(route,{sectorAnglesDeg:[60,30,120,150]});
    assert.equal(flat.status,200,flat.text);
    assert.equal(flat.value.flatFoldable,true);
    assert.equal((await post(route,{sectorAnglesDeg:[90,90,90,80]})).status,422);
  });
  it('checks degree-four fold-angle closure without claiming a 3D folded mesh', async()=>{
    const route='/api/tessellation/degree4-fold-consistency';
    const input={sectorAnglesDeg:[90,90,90,90],foldAnglesDeg:[35,0,35,0]};
    assert.equal((await request(route,{method:'POST',json:input})).status,403);
    const closed=await post(route,input);
    assert.equal(closed.status,200,closed.text);
    assert.equal(closed.value.kind,'local-degree4-fold-consistency');
    assert.equal(closed.value.compatible,true);
    assert.ok(closed.value.closureErrorDeg<1e-9);
    assert.equal(closed.value.closureResidualMatrix.length,3);
    assert.equal(closed.value.selfCollisionChecked,false);
    assert.equal(closed.value.foldedForm3D,false);
    const halfTurn=await post(route,{...input,foldAnglesDeg:[180,0,0,0]});
    assert.equal(halfTurn.status,200,halfTurn.text);
    assert.equal(halfTurn.value.compatible,false);
    assert.ok(Math.abs(halfTurn.value.closureErrorDeg-180)<1e-9);
    assert.equal((await post(route,{...input,foldAnglesDeg:[0,0,0]})).status,422);
    assert.equal((await post('/api/tessellate',{operation:'degree4-fold-consistency',...input})).status,400);
  });
  it('returns a compatible local 3D vertex fan without claiming global foldability', async()=>{
    const route='/api/tessellation/degree4-vertex-fan3d';
    const dihedral=2*Math.atan(2)*180/Math.PI;
    const input={sectorAnglesDeg:[120,60,60,120],foldAnglesDeg:[90,dihedral,-90,dihedral]};
    assert.equal((await request(route,{method:'POST',json:input})).status,403);
    const result=await post(route,input);
    assert.equal(result.status,200,result.text);
    assert.equal(result.value.kind,'local-single-vertex-fan3d');
    assert.equal(result.value.vertices3D.length,5);
    assert.equal(result.value.faces.length,4);
    assert.equal(result.value.selfCollisionChecked,false);
    assert.equal(result.value.globalFoldabilityChecked,false);
    assert.ok(result.value.maxFoldErrorRad<1e-10);
    assert.ok(Math.abs(result.value.foldRays[2][0]-.2)<1e-10);
    assert.equal((await post(route,{...input,foldAnglesDeg:[90,0,-90,0]})).status,422);
    assert.equal((await post('/api/tessellate',{operation:'degree4-vertex-fan3d',...input})).status,400);
  });
  it('reduces an even-degree local vertex without claiming a whole-sheet fold', async()=>{
    const route='/api/tessellation/lff-reduction';
    const input={sectorAnglesDeg:[100,20,30,40,50,120],labels:['a','b','c','d','e','f']};
    assert.equal((await request(route,{method:'POST',json:input})).status,403);
    const result=await post(route,input);
    assert.equal(result.status,200,result.text);
    assert.equal(result.value.kind,'local-high-order-lff-reduction');
    assert.deepEqual(result.value.crimpPairs,[['b','c'],['d','e'],['a','f']]);
    assert.equal(result.value.fullyReduced,true);
    assert.equal(result.value.globalFoldabilityChecked,false);
    assert.equal((await post(route,{sectorAnglesDeg:[90,90,90]})).status,422);
    assert.equal((await post(route,{sectorAnglesDeg:[90,90,90,90]})).value.fullyReduced,false);
    assert.equal((await post('/api/tessellate',{operation:'lff-reduction',...input})).status,400);
  });
  it('queries the original woven uniform-inset vertex separation curve', async()=>{
    const route='/api/tessellation/woven-inset-separation';
    const input={params:{family:'woven-lines',mode:'chord'},start:0,stop:.2,count:7};
    assert.equal((await request(route,{method:'POST',json:input})).status,403);
    const response=await post(route,input);
    assert.equal(response.status,200,response.text);
    assert.equal(response.value.uniformInset,true);
    assert.equal(response.value.faceCount,22);
    assert.equal(response.value.insetPointCount,84);
    assert.equal(response.value.insets.length,7);
    assert.equal(response.value.separations.length,7);
    assert.equal(response.value.separations[0],0);
    assert.ok(Math.abs(response.value.firstPositiveVertexCollision-.0927656453)<1e-8);
    assert.ok(response.value.separations.every(Number.isFinite));
    assert.equal((await post(route,{...input,count:1})).status,422);
    assert.equal((await post(route,{...input,params:{family:'twist'}})).status,422);
    assert.equal((await post('/api/tessellate',{...input,operation:'woven-inset-separation'})).status,400);
  });
  it('returns certified read-only curved space-curve pairs without evaluating expressions', async()=>{
    const route='/api/tessellation/curved-space-curve';
    assert.equal((await request(route,{method:'POST',json:{family:'planar-circle'}})).status,403);
    const response=await post(route,{family:'planar-circle',curveSegments:16,rulingSegments:1});
    assert.equal(response.status,200,response.text);
    assert.equal(response.value.family,'certified-space-curve-fold');
    assert.equal(response.value.certification.pairedContinuousIsometryAnalytic,true);
    assert.equal(response.value.certification.exactStraightCreaseFOLD,false);
    assert.equal(response.value.sample.flatVertices.length,response.value.sample.foldedVertices.length);
    assert.equal((await post(route,{family:'planar-circle',expression:'__import__("os")'})).status,422);
    assert.equal((await post('/api/tessellate',{family:'planar-circle',operation:'curved-space-curve'})).status,400);
  });
  it('serves only bounded read-only section-45 saved curved-fold pairs', async()=>{
    const route='/api/tessellation/curved-saved-pair';
    assert.equal((await request(route,{method:'POST',json:{family:'cone-across-right'}})).status,403);
    const cone=await post(route,{family:'cone-across-right',curveSegments:16,rulingSegments:1});
    assert.equal(cone.status,200,cone.text);
    assert.equal(cone.value.family,'origamica-curved-saved-pair');
    assert.equal(cone.value.source.symbolicCell,'In[3999]');
    assert.equal(cone.value.certification.exactStraightCreaseFOLD,false);
    assert.equal(cone.value.certification.adoptableCreasePattern,false);
    assert.equal(cone.value.sample.creaseIndices.length,17);
    const negative=await post(route,{family:'planar-circle-to-curved-fold-3d',
      orientation:-1,curveSegments:16,rulingSegments:1});
    assert.equal(negative.status,200,negative.text);
    assert.equal(negative.value.source.symbolicCell,'In[3974]');
    assert.equal(negative.value.foldAngleDeg,-120);
    assert.equal((await post(route,{family:'cone-across-right',expression:'sin(u)'})).status,422);
    assert.equal((await post(route,{family:'cone-across-right',leftWidth:1})).status,422);
    assert.equal((await post('/api/tessellate',{operation:'curved-saved-pair',family:'cone-across-right'})).status,400);
  });
  it('serves the saved helix ribbon only as a bounded read-only sample', async()=>{
    const route='/api/tessellation/curved-ribbon-pair';
    assert.equal((await request(route,{method:'POST',json:{}})).status,403);
    const response=await post(route,{curveSegments:16,rulingSegments:2});
    assert.equal(response.status,200,response.text);
    assert.equal(response.value.family,'origamica-helix-ribbon-pair');
    assert.equal(response.value.source.symbolicCell,'In[3855]');
    assert.equal(response.value.source.numericalCell,'In[3859]');
    assert.equal(response.value.source.machineReadableWolframOut,false);
    assert.equal(response.value.certification.continuousIsometryAnalytic,true);
    assert.equal(response.value.certification.exactStraightCreaseFOLD,false);
    assert.equal(response.value.certification.adoptableCreasePattern,false);
    assert.equal(response.value.sample.baseIndices.length,17);
    assert.equal(response.value.sample.flatSamples.length,51);
    assert.equal(response.value.sample.spaceSamples.length,51);
    assert.equal((await post(route,{expression:'__import__("os")'})).status,422);
    assert.equal((await post(route,{rulingSegments:3})).status,422);
    assert.equal((await post(route,{etaPi:.05,halfWidth:.5})).status,422);
    assert.equal((await post(route,{curveSegments:256,rulingSegments:20})).status,422);
    assert.equal((await post('/api/tessellate',{operation:'curved-ribbon-pair'})).status,400);
  });
  it('matches user-supplied noncircular curves without changing the common parameter', async()=>{
    const route='/api/tessellation/curved-matched-pair';
    const query={family:'curved-matched-pair',variant:'generic-native',
      flatCurve:['2-4*log(1+s**2/16)','8*atan(s/4)-s'],
      spaceCurve:['0.5+0.5*cos(4*s/sqrt(5))','sin(4*s/sqrt(5))/sqrt(5)+s/5','1-sin(4*s/sqrt(5))/(2*sqrt(5))+2*s/5'],
      psi:1,sigma:1,parameterStart:0,parameterEnd:Math.PI,transverseStart:-1,transverseEnd:1,segments:8,rulingSegments:2};
    assert.equal((await request(route,{method:'POST',json:query})).status,403);
    const response=await post(route,query);assert.equal(response.status,200,response.text);
    assert.deepEqual(response.value.query,query);
    assert.equal(response.value.certification.analyticSpeedEquality,true);
    assert.equal(response.value.certification.fullIntervalRegularityCertified,true);
    assert.equal(response.value.certification.exactStraightCreaseFOLD,false);
    assert.equal(response.value.sample.rows.length,9);
    assert.equal(response.value.sample.grid.length,9);
    assert.equal((await post(route,{...query,spaceCurve:['cos(s)','sin(s)','s']})).status,422);
    assert.equal((await post(route,{...query,flatCurve:['__import__("os")','s']})).status,422);
    assert.equal((await post('/api/tessellate',{...query,operation:'curved-matched-pair'})).status,400);
  });
  it('evaluates the original near-width formula for spatial source functions', async()=>{
    const route='/api/tessellation/curved-near-width';
    const query={family:'near-constant-width-generic',baseCurve:['cos(s)','sin(s)','s/2'],director:['0','0','1'],
      parameterStart:0,parameterEnd:1.5,width:-.5,segments:8};
    assert.equal((await request(route,{method:'POST',json:query})).status,403);
    const response=await post(route,query);assert.equal(response.status,200,response.text);
    assert.deepEqual(response.value.query,query);
    assert.equal(response.value.certification.fullDomainFormulaCertified,true);
    assert.equal(response.value.source.directorNormalized,false);
    assert.equal(response.value.certification.spatialDevelopabilityChecked,false);
    for(const row of response.value.sample.rows)assert.ok(Math.abs(row.scale-Math.sqrt(5)/2)<1e-12);
    assert.equal((await post(route,{...query,director:['s.__class__','0','1']})).status,422);
    assert.equal((await post('/api/tessellate',{...query,operation:'curved-near-width'})).status,400);
  });
  it('serves only bounded section-45 discretization examples', async()=>{
    const route='/api/tessellation/curved-discretization';
    assert.equal((await request(route,{method:'POST',json:{example:'in-4090'}})).status,403);
    const curve=await post(route,{example:'in-4090',divisions:4});
    assert.equal(curve.status,200,curve.text);
    assert.equal(curve.value.source.inputCell,'In[4090]');
    assert.equal(curve.value.source.wolframNumericOutAvailable,false);
    assert.equal(curve.value.sample.parameterValues.length,5);
    assert.ok(curve.value.sample.maximumAbsoluteResidual<1e-8);
    assert.equal(curve.value.sample.increasingRootFromEqualParameterGuess,true);
    const system=await post(route,{example:'in-4088'});
    assert.equal(system.status,200,system.text);
    assert.equal(system.value.sample.system.length,2);
    assert.equal(system.value.sample.parameterValues.length,5);
    const multiplier=await post(route,{example:'multiplier-fixture'});
    assert.equal(multiplier.status,200,multiplier.text);
    assert.equal(multiplier.value.sample.in4093EllipseReproduced,false);
    assert.equal((await post(route,{example:'in-4090',expression:'sin(t)'})).status,422);
    assert.equal((await post(route,{example:'in-4090',divisions:17})).status,422);
    assert.equal((await post('/api/tessellate',{operation:'curved-discretization',example:'in-4090'})).status,400);
  });
  it('serves only the bounded read-only In[3913] tangent developable pair', async()=>{
    const route='/api/tessellation/curved-tangent-developable';
    const query={family:'tangent-developable-in3913',curveSegments:16,
      rulingSegments:2,rulingEnd:1};
    assert.equal((await request(route,{method:'POST',json:query})).status,403);
    const response=await post(route,query);
    assert.equal(response.status,200,response.text);
    assert.equal(response.value.family,'origamica-tangent-developable-pair');
    assert.equal(response.value.source.definitionCell,'In[3912]');
    assert.equal(response.value.source.savedCell,'In[3913]');
    assert.equal(response.value.source.machineReadableWolframOut,false);
    assert.equal(response.value.certification.continuousIsometryAnalytic,true);
    assert.equal(response.value.certification.regressionEdgeSingularAtZero,true);
    assert.equal(response.value.certification.regressionEdgeIsCrease,false);
    assert.equal(response.value.certification.exactStraightCreaseFOLD,false);
    assert.equal(response.value.certification.adoptableCreasePattern,false);
    assert.equal(response.value.sample.parameterValues.length,17);
    assert.equal(response.value.sample.rulingDistances.length,3);
    assert.equal(response.value.sample.flatSamples.length,17);
    assert.equal(response.value.sample.foldedSamples.length,17);
    assert.equal((await post(route,{...query,expression:'Sin[u]'})).status,422);
    assert.equal((await post(route,{...query,curveSegments:257})).status,422);
    assert.equal((await post(route,{...query,family:'unknown'})).status,422);
    assert.equal((await post('/api/tessellate',{operation:'curved-tangent-developable',...query})).status,400);
  });
  it('flattens direct original fold sources while preserving incompatible right-side curvature',async()=>{
    const route='/api/tessellation/curved-fold-flatten-generic',saved=JSON.parse(await readFile(path.join(root,
      'tests/fixtures/origamica-fold-flatten-generic-shared.json'),'utf8')),query={...saved.query,rulingSegments:3};
    assert.equal((await request(route,{method:'POST',json:query})).status,403);
    const response=await post(route,query);assert.equal(response.status,200,response.text);
    assert.deepEqual(response.value.query,query);assert.deepEqual(response.value.source.initialArgumentOrder,['ui','fi','ti']);
    assert.equal(response.value.certification.formalCommonFlatteningCertified,true);
    assert.equal(response.value.certification.finiteRightMetricVerified,true);
    assert.equal(response.value.certification.integrationErrorIntervalCertified,false);
    assert.equal(response.value.grid[0].normalizedTargetRight.length,4);
    assert.ok(response.value.sample.rows.every(row=>row.coefficients.right.normalizedQ<0));
    const mismatch=await post(route,{...query,foldCurve:['Cos[s]','Sin[s]','0'],leftDirector:['-Cos[s]','-Sin[s]','0'],rightDirector:['0','0','1']});
    assert.equal(mismatch.status,200,mismatch.text);assert.equal(mismatch.value.certification.finiteRightMetricVerified,false);
    assert.equal(mismatch.value.certification.finiteLeftMetricVerified,true);
    assert.equal(mismatch.value.certification.sharedGeodesicCurvatureAnalytic,false);
    assert.equal(mismatch.value.certification.adoptableCreasePattern,false);assert.equal(mismatch.value.sample.rows.length,9);
    assert.deepEqual(mismatch.value.query.rightDirector,['0','0','1']);
    assert.equal((await post(route,{...query,leftDirector:['eval(s)','0','1']})).status,422);
    assert.equal((await post(route,{...query,sigma:1})).status,422);
    assert.equal((await post('/api/tessellate',{...query,operation:'curved-fold-flatten-generic'})).status,400);
  });
  it('recovers six original planar fold sources with the literal angle and signed Frenet initial frame',async()=>{
    const route='/api/tessellation/curved-fold-3d-generic',fixture=JSON.parse(await readFile(path.join(root,
      'tests/fixtures/origamica-fold-3d-generic-interior.json'),'utf8')),query={...fixture.query,rulingSegments:3};
    assert.equal((await request(route,{method:'POST',json:query})).status,403);
    const response=await post(route,query);assert.equal(response.status,200,response.text);
    assert.deepEqual(response.value.query,query);assert.deepEqual(response.value.source.initialArgumentOrder,['ui','gammai','ffi','tti','bbti']);
    assert.deepEqual(response.value.initial.point,query.initialPoint);assert.equal(response.value.initial.parameter,query.initialParameter);
    assert.equal(response.value.certification.formalIsometryCertified,true);
    assert.equal(response.value.certification.finiteRightMetricVerified,true);assert.equal(response.value.certification.integrationErrorIntervalCertified,false);
    assert.equal(response.value.grid[0].normalizedTargetRight.length,4);assert.equal(response.value.certification.adoptableCreasePattern,false);
    const negative=JSON.parse(await readFile(path.join(root,'tests/fixtures/origamica-fold-3d-generic-negative-curvature.json'),'utf8'));
    const back=await post(route,{...negative.query,rulingSegments:3});assert.equal(back.status,200,back.text);
    assert.equal(back.value.initial.sourceOrientation,-1);assert.ok(back.value.initial.binormal.every((v,i)=>v===-back.value.query.initialTopBinormal[i]));
    assert.equal((await post(route,{...query,initialFoldAngleRad:Math.PI})).status,422);
    assert.equal((await post(route,{...query,leftDirector:['eval(s)','1']})).status,422);
    assert.equal((await post(route,{...query,sigma:1})).status,422);
    assert.equal((await post('/api/tessellate',{...query,operation:'curved-fold-3d-generic'})).status,400);
  });
  it('keeps original canonical operation and all three domains through the analysis transport adapter',async()=>{
    const route='/api/tessellation/curved-canonical-generic',common={family:'canonical-developable-native',
      parameterStart:.1,parameterEnd:.8,rulingStart:-.2,rulingEnd:.3,crossParameterStart:.2,crossParameterEnd:.7,segments:8,rulingSegments:3};
    const sources=[{operation:'cylinder',baseCurve:['s','.3*s**2','.2*sin(s)'],director:['1','2','3']},
      {operation:'cone',baseCurve:['.3','-.2','.7'],director:['1','.3*s','.2*s**2']},
      {operation:'tangent',baseCurve:['s','s**2','.1*s**3']},
      {operation:'general',baseCurve:['s','.3*s**2','2*s'],director:['0','0','1+s']}];
    assert.equal((await request(route,{method:'POST',json:{...common,...sources[0]}})).status,403);
    for(const source of sources){const query={...common,...source},response=await post(route,query);assert.equal(response.status,200,response.text);
      assert.deepEqual(response.value.query,query);assert.equal(response.value.family,'origamica-generic-canonical');
      assert.equal(response.value.normalizedCanonicalGrid.length,9);assert.equal(response.value.normalizedCanonicalGrid[0].length,4);
      assert.equal(response.value.crossParameterValues[0],.2);assert.equal(response.value.crossParameterValues.at(-1),.7);
      assert.equal(response.value.source.flatDevelopmentReturnedByOriginal,false);assert.equal(response.value.certification.adoptableCreasePattern,false);
      assert.equal(response.value.certification.integrationErrorIntervalCertified,false);}
    const literal=await post(route,{...common,operation:'cone',baseCurve:['s','0','0'],director:['cos(s)','sin(s)','1']});
    assert.equal(literal.status,200,literal.text);assert.equal(literal.value.source.coneOriginalUnassignedBbCheck,true);
    assert.equal(literal.value.certification.apexIdentity.analyticIdentity,false);assert.equal(literal.value.certification.developabilityIdentity.analyticIdentity,false);
    assert.equal((await post(route,{...common,...sources[2],director:['1','0','0']})).status,422);
    assert.equal((await post(route,{...common,...sources[0],director:['s-s+1','0','0']})).status,422);
    assert.equal((await post(route,{...common,...sources[1],baseCurve:['eval(s)','0','0']})).status,422);
    assert.equal((await post('/api/tessellate',{...common,...sources[0]})).status,400);
  });
  it('constructs four original space-curve sources with unit rulings and allows the literal pi fold angle',async()=>{
    const route='/api/tessellation/curved-space-curve-fold-generic',fixture=JSON.parse(await readFile(path.join(root,
      'tests/fixtures/origamica-space-curve-fold-generic-half-angle-pi.json'),'utf8')),query={...fixture.query,rulingSegments:3};
    assert.equal((await request(route,{method:'POST',json:query})).status,403);
    const response=await post(route,query);assert.equal(response.status,200,response.text);assert.deepEqual(response.value.query,query);
    assert.deepEqual(response.value.source.argumentOrder,['ff','gamma','varsigma']);assert.deepEqual(response.value.initial.point,[1,0]);
    assert.deepEqual(response.value.initial.tangent,[0,1]);assert.equal(response.value.certification.finiteUnitRulingsVerified,true);
    assert.equal(response.value.grid[0].normalizedTargetLeft.length,4);assert.equal(response.value.certification.adoptableCreasePattern,false);
    assert.equal(response.value.certification.integrationErrorIntervalCertified,false);
    const opposite=await post(route,{...query,orientation:-1});assert.equal(opposite.status,200,opposite.text);assert.equal(opposite.value.query.orientation,-1);
    assert.equal((await post(route,{...query,initialTangent:[1,0]})).status,422);
    assert.equal((await post(route,{...query,foldAngle:'eval(s)'})).status,422);
    assert.equal((await post(route,{...query,orientation:0})).status,422);
    assert.equal((await post('/api/tessellate',{...query,operation:'curved-space-curve-fold-generic'})).status,400);
  });
  it('preserves raw almost-unit initial values and refuses formal frame evidence independently of finite metric checks',async()=>{
    for(const [name,route,formal] of [
      ['origamica-generic-darboux-flatten-near-frame','curved-flatten-generic','formalIsometryCertified'],
      ['origamica-generic-darboux-reshape-near-frame','curved-reshape-generic','formalIsometryCertified'],
      ['origamica-fold-flatten-generic-near-frame','curved-fold-flatten-generic','formalCommonFlatteningCertified'],
      ['origamica-fold-3d-generic-raw-frame','curved-fold-3d-generic','formalIsometryCertified']]){
      const fixture=JSON.parse(await readFile(path.join(root,`tests/fixtures/${name}.json`),'utf8')),query={...fixture.query,segments:8,rulingSegments:3};
      const response=await post(`/api/tessellation/${route}`,query);assert.equal(response.status,200,response.text);
      assert.deepEqual(response.value.query,query);assert.deepEqual(response.value.initial.tangent,query.initialTangent);
      assert.equal(response.value.initial.frameCompatible,false);assert.equal(response.value.certification.initialFrameCompatible,false);
      assert.ok(response.value.initial.frameGramResidual>response.value.initial.frameCompatibilityTolerance);
      assert.equal(response.value.certification[formal],false);assert.equal(response.value.certification.sourceRegularityCertified,true);
      const strips=route.includes('fold-')?Object.values(response.value.domain.formalStripRegularity):[response.value.domain.formalStripRegularity];
      assert.ok(strips.every(s=>s.status==='unknown'&&s.orientation===null&&s.minimumAbsoluteJacobianLowerBound===null));}
  });
  it('constructs all four original Ribbon sources and preserves raw recovery values and literal zero rulings',async()=>{
    const route='/api/tessellation/curved-ribbon-generic',fixture=JSON.parse(await readFile(path.join(root,
      'tests/fixtures/origamica-ribbon-generic-interior.json'),'utf8')),query={...fixture.query,rulingSegments:3};
    assert.equal((await request(route,{method:'POST',json:query})).status,403);
    const response=await post(route,query);assert.equal(response.status,200,response.text);
    assert.deepEqual(response.value.query,query);assert.deepEqual(response.value.source.initialArgumentOrder,['ui','ci','ti']);
    assert.deepEqual(response.value.initial.point,query.initialPoint);assert.deepEqual(response.value.initial.tangent,query.initialTangent);
    assert.equal(response.value.certification.formalIsometryCertified,true);assert.equal(response.value.certification.finiteMetricVerified,true);
    assert.equal(response.value.grid[0].normalizedTarget.length,4);assert.equal(response.value.certification.adoptableCreasePattern,false);
    assert.equal(response.value.certification.integrationErrorIntervalCertified,false);
    const raw=await post(route,{...query,initialTangent:[2,0]});assert.equal(raw.status,200,raw.text);
    assert.deepEqual(raw.value.initial.tangent,[2,0]);assert.equal(raw.value.initial.frameCompatible,false);
    assert.equal(raw.value.certification.formalIsometryCertified,false);assert.equal(raw.value.certification.finiteMetricVerified,false);
    const zero=await post(route,{...query,spaceCurve:['cos(s)','sin(s)','s/2'],normalAngle:'0'});
    assert.equal(zero.status,200,zero.text);assert.equal(zero.value.certification.finiteMetricVerified,true);
    assert.equal(zero.value.certification.finiteUnitRulingsVerified,false);assert.equal(zero.value.domain.sourceStripRegularity.status,'degenerate');
    assert.ok(zero.value.sample.rows.every(row=>row.sourceDirector.every(v=>v===0)&&row.targetDirector.every(v=>v===0)));
    assert.equal((await post(route,{...query,normalAngle:'eval(s)'})).status,422);
    assert.equal((await post(route,{...query,initialFoldAngleRad:1})).status,422);
    assert.equal((await post('/api/tessellate',{...query,operation:'curved-ribbon-generic'})).status,400);
  });
  it('preserves all nine original optical rules, tagged infinite foci and independent conic branches',async()=>{
    const route='/api/tessellation/curved-conic-section-generic',query={family:'conic-section-2d-native',
      leftFocus:-2.5,rightFocus:-.75,leftCross:-1.2,rightCross:.9,parameterRanges:[[-.7,1]],segments:8};
    assert.equal((await request(route,{method:'POST',json:query})).status,403);
    const response=await post(route,query);assert.equal(response.status,200,response.text);assert.deepEqual(response.value.query,query);
    assert.equal(response.value.source.function,'ConicSection2DSystem');assert.equal(response.value.source.simplification,'None');
    assert.equal(response.value.source.halfAngleContinuationApplied,false);assert.equal(response.value.components[0].samples.length,9);
    assert.deepEqual(response.value.source.ruleKeys,['CurvedFold2D','DirectrixLeft2D','DirectorLeft2D','CrossCurveLeft2D',
      'SecondCrossCurveLeft2D','DirectrixRight2D','DirectorRight2D','CrossCurveRight2D','SecondCrossCurveRight2D']);
    assert.equal(response.value.certification.adoptableCreasePattern,false);assert.equal(response.value.certification.sampledMeshExactFOLD,false);
    const line=await post(route,{...query,leftFocus:{infinity:-1},rightFocus:{infinity:1},leftCross:2,rightCross:-3});
    assert.equal(line.status,200,line.text);assert.equal(line.value.source.branch,'line');
    assert.deepEqual(line.value.components[0].samples[0].rules[0],[0,-.7]);
    assert.deepEqual(line.value.components[0].samples[0].rules[1],[2,-.7]);
    const both=await post(route,{...query,leftFocus:-2,rightFocus:1,parameterRanges:[[1.5,2.7],[-.7,.7]]});
    assert.equal(both.status,200,both.text);assert.equal(both.value.source.branch,'hyperbola');
    assert.deepEqual(both.value.components.map(c=>c.parameterRange),[[1.5,2.7],[-.7,.7]]);
    const circle=await post(route,{...query,leftFocus:-1,rightFocus:-1,parameterRanges:[[2.8,3.4]]});
    assert.equal(circle.status,200,circle.text);assert.equal(circle.value.source.branch,'circle');
    assert.equal((await post(route,{...query,parameterRanges:[[2.8,3.4]]})).status,422);
    assert.equal((await post(route,{...query,leftFocus:{infinity:1}})).status,422);
    assert.equal((await post(route,{...query,leftFocus:0})).status,422);
    assert.equal((await post('/api/tessellate',{...query,operation:'curved-conic-section-generic'})).status,400);
  });
  it('preserves all ten surface-conversion sources, distinct original sign rules and unrepaired raw projection vectors',async()=>{
    for(const mode of ['cone','cylinder']){
      const route=`/api/tessellation/curved-surface-to-${mode}-generic`,fixture=JSON.parse(await readFile(path.join(root,
        `tests/fixtures/origamica-fold-surface-generic-${mode}-raw.json`),'utf8')),query={...fixture.query,segments:8,rulingSegments:3};
      assert.equal((await request(route,{method:'POST',json:query})).status,403);
      const response=await post(route,query);assert.equal(response.status,200,response.text);assert.deepEqual(response.value.query,query);
      assert.equal(response.value.certification.finiteSourcePairMetricVerified,true);assert.equal(response.value.certification.finiteTargetPairMetricVerified,true);
      assert.equal(response.value.certification.adoptableCreasePattern,false);assert.equal(response.value.source.interpolationReproduced,false);
      const symbolic=await post(route,{...query,literalMode:'normalized-symbolic'});assert.equal(symbolic.status,200,symbolic.text);
      assert.equal(symbolic.value.query.literalMode,'normalized-symbolic');
      if(mode==='cone'){
        assert.notDeepEqual(symbolic.value.sample.rows[0].targetFlat.director,response.value.sample.rows[0].targetFlat.director);
        const zero=JSON.parse(await readFile(path.join(root,'tests/fixtures/origamica-fold-surface-generic-cone-zero-sign-raw.json'),'utf8'));
        const actual=await post(route,zero.query);assert.equal(actual.status,200,actual.text);assert.equal(actual.value.initial.branchSignAtInitial,0);
        assert.ok(actual.value.sample.rows.every(row=>Math.abs(row.offsetParameter-4)<4e-15&&row.branchSign===0&&row.targetFlat.director.every(x=>x===0)&&row.targetSpace.director.every(x=>x===0)));
        const crossing=JSON.parse(await readFile(path.join(root,'tests/fixtures/origamica-fold-surface-generic-cone-sign-cross-symbolic.json'),'utf8'));
        const crossed=await post(route,crossing.query);assert.equal(crossed.status,200,crossed.text);
        const atZero=crossed.value.sample.rows.find(row=>row.s===1);assert.equal(atZero.branchSign,0);assert.equal(atZero.targetJetsDefined,false);
        assert.equal(atZero.targetFlat.directorDerivative,null);assert.equal(crossed.value.certification.finiteTargetPairMetricVerified,false);
      }else{
        const raw=JSON.parse(await readFile(path.join(root,'tests/fixtures/origamica-fold-surface-generic-cylinder-raw-nonunit.json'),'utf8'));
        const actual=await post(route,raw.query);assert.equal(actual.status,200,actual.text);assert.deepEqual(actual.value.initial.flatDirector,raw.query.flatDirector);
        assert.equal(actual.value.certification.initialDirectorsUnitCompatible,false);assert.equal(actual.value.certification.formalTargetPairMetricCertified,false);
        assert.equal((await post(route,{...query,flatDirector:[0,0],spaceDirector:[0,0,0]})).status,422);
      }
      assert.equal((await post(route,{...query,extra:true})).status,422);
      assert.equal((await post('/api/tessellate',{...query,operation:`curved-surface-to-${mode}-generic`})).status,400);
    }
  });
  it('exposes original woven crossing subdivision with explicit source provenance and separate CP readiness',async()=>{
    const route='/api/tessellation/woven-graph-preprocess',query={family:'woven-graph-preprocess-native',
      inputGraph:{vertices:[[-1,0],[1,0],[0,-1],[0,1]],edges:[[0,1],[2,3]]},intersectionTolerance:0,samePtTolerance:1e-6,invertFoldType:false};
    assert.equal((await request(route,{method:'POST',json:query})).status,403);
    const result=await post(route,query);assert.equal(result.status,200,result.text);
    assert.deepEqual(result.value.source.inputGraph,query.inputGraph);
    assert.equal(result.value.source.kind,'origamica-intersectify-native');
    assert.deepEqual(result.value.graph,{vertices:[[-1,0],[0,0],[1,0],[0,-1],[0,1]],edges:[[0,1],[1,2],[3,1],[1,4]]});
    assert.deepEqual(result.value.originalEdgeForSegment,[0,0,1,1]);
    assert.equal(result.value.diagnostics.wovenInput.status,'not_ready');
    assert.equal(result.value.certificates.creasePatternConstructed,false);
    assert.equal(result.value.certificates.flatFoldComputed,false);
    assert.equal((await post(route,{...query,samePtTolerance:-1})).status,422);
    assert.equal((await post(route,{...query,extra:true})).status,422);
    assert.equal((await post('/api/tessellate',{...query,operation:'woven-graph-preprocess'})).status,400);
  });
  it('exposes seven original helper systems without normalizing raw recovery frames or inventing undefined Frenet rules',async()=>{
    const fixtures=JSON.parse(await readFile(path.join(root,'tests/fixtures/curved-system-helpers-native-20261001.json'),'utf8'));
    const route='/api/tessellation/curved-system-helpers-generic';
    assert.equal((await request(route,{method:'POST',json:fixtures[0].query})).status,403);
    for(const mode of ['curve2','curve3','darboux3','ruled-normal','recover2','recover3','recover-darboux']){
      const fixture=fixtures.find(f=>f.name===mode),actual=await post(route,fixture.query);
      assert.equal(actual.status,200,actual.text);assert.deepEqual(actual.value.query,fixture.query);
      assert.deepEqual(actual.value.source.ruleOrder,fixture.response.source.ruleOrder);
      assert.equal(actual.value.certification.adoptableCreasePattern,false);
      assert.equal(actual.value.source.interpolationReproduced,false);
    }
    const straight=fixtures.find(f=>f.name==='curve3-straight'),response=await post(route,straight.query);
    assert.equal(response.status,200,response.text);
    assert.equal(response.value.certification.finiteSystemFullyDefined,false);
    assert.equal(response.value.sample.rows[0].rules.NormalVector3D,null);
    const recovery=fixtures.find(f=>f.name==='recover-darboux-no-extra-speed'),restored=await post(route,recovery.query);
    assert.equal(restored.status,200,restored.text);
    const last=restored.value.sample.rows.at(-1);
    assert.ok(Math.abs(last.curve[0]-2*Math.sin(1))<1e-10);
    assert.ok(Math.abs(last.rules.T[0]-Math.cos(1))<1e-10);
    assert.equal((await post(route,{...straight.query,extra:true})).status,422);
    assert.equal((await post('/api/tessellate',{...straight.query,operation:'curved-system-helpers-generic'})).status,400);
  });
  it('exposes general ordered discretization, unconstrained chord roots and literal multipliers without claiming a crease pattern',async()=>{
    const route='/api/tessellation/curved-discretization-generic',family='discretization-generic-native';
    const ordered={family,mode:'system',rules:[{key:'A',expression:'s+1'},{key:'A',expression:['1/s','sqrt(s)']}],parameters:[2,0,-1,2]};
    assert.equal((await request(route,{method:'POST',json:ordered})).status,403);
    const a=await post(route,ordered);assert.equal(a.status,200,a.text);
    assert.deepEqual(a.value.query,ordered);assert.deepEqual(a.value.sample.rules.map(r=>r.key),['A','A']);
    assert.deepEqual(a.value.sample.rules[0].values,[3,1,0,3]);
    assert.deepEqual(a.value.sample.rules[1].values,[[.5,Math.sqrt(2)],[null,0],[-1,null],[.5,Math.sqrt(2)]]);
    assert.equal(a.value.certification.allSampledValuesFinite,false);assert.equal(a.value.certification.adoptableCreasePattern,false);
    const uniform={family,mode:'uniform',curve:['s','sin(12*s)'],divisions:4,parameterStart:0,parameterEnd:1};
    const b=await post(route,uniform);assert.equal(b.status,200,b.text);
    assert.deepEqual(b.value.sample.initialGuess,[0,.25,.5,.75,1]);
    assert.equal(b.value.sample.strictlyOrderedAlongRequestedInterval,false);assert.deepEqual(b.value.sample.outsideRequestedInterval,[2]);
    assert.equal(b.value.certification.rootBranchEquivalentToWolfram,false);
    for(const equation of b.value.sample.equations)assert.ok(Math.abs(equation.directionResidual)<2e-10);
    const reference=JSON.parse(await readFile(path.join(root,'tests/fixtures/curved-discretization-generic-reference-20261001.json'),'utf8'));
    const c=await post(route,{family,mode:'multipliers',foldPoints:reference.kink.foldPoints,leftRulings:reference.kink.leftRulings,rightRulings:reference.kink.rightRulings});
    assert.equal(c.status,200,c.text);assert.equal(c.value.sample.rawDirectionsPreserved,true);
    assert.equal(c.value.sample.chopAppliedToDenominator,false);assert.equal(c.value.certification.globalFoldingCertified,false);
    for(const invalid of [{...ordered,rules:[{key:'X',expression:'eval(s)'}]},{...uniform,divisions:0},{...ordered,extra:true}])
      assert.equal((await post(route,invalid)).status,422);
    assert.equal((await post('/api/tessellate',{...ordered,operation:'curved-discretization-generic'})).status,400);
    const legacy=await post('/api/tessellation/curved-discretization',{example:'in-4088'});assert.equal(legacy.status,200,legacy.text);
  });
  it('exposes two-variable surface rules and independent normal orientation through authenticated worker routes',async()=>{
    const fixture=JSON.parse(await readFile(path.join(root,'tests/fixtures/curved-surface-system-native-20261001.json'),'utf8')).cases
      .find(item=>item.name==='mixed-saddle'),query=fixture.query;
    const route='/api/tessellation/curved-surface-system-generic';
    assert.equal((await request(route,{method:'POST',json:query})).status,403);
    const result=await post(route,query);assert.equal(result.status,200,result.text);
    assert.deepEqual(result.value.query,query);assert.equal(result.value.source.ruleOrder.length,15);
    assert.deepEqual(result.value.sample.rows[0].sourceSecondDerivatives[1],[0,0,1]);
    assert.equal(result.value.certification.adoptableCreasePattern,false);
    const simple=await post(route,{...query,principalAnalysis:false});assert.equal(simple.status,200,simple.text);
    assert.equal(simple.value.source.ruleOrder.length,12);
    assert.equal(simple.value.sample.rows[0].rules.PrincipalCurvatures,undefined);
    const {principalAnalysis:_principal,...common}=query;
    const normalRoute='/api/tessellation/curved-surface-normal-generic';
    const normalQuery={...common,family:'surface-normal-generic-native',surfaceOrientation:1};
    assert.equal((await request(normalRoute,{method:'POST',json:normalQuery})).status,403);
    const front=await post(normalRoute,normalQuery),back=await post(normalRoute,{...normalQuery,surfaceOrientation:-1});
    assert.equal(front.status,200,front.text);assert.equal(back.status,200,back.text);
    for(let i=0;i<front.value.sample.rows.length;i++){
      const f=front.value.sample.rows[i],b=back.value.sample.rows[i];
      assert.deepEqual(f.sourcePoint,b.sourcePoint);
      assert.deepEqual(f.sourceTangents,b.sourceTangents);
      assert.ok(f.normal.every((x,k)=>Math.abs(x+b.normal[k])<1e-14));
    }
    assert.equal(back.value.source.numericalWrapperInterpolationReproduced,false);
    for(const surface of [['u','v','sqrt(0)'],['1e-110*u','1e-110*v','0'],['u','v','sqrt(1e-220+u**2)']]){
      const edgeQuery={...query,surface,uStart:0,uEnd:1,vStart:0,vEnd:1,uSegments:8,vSegments:8};
      const edge=await post(route,edgeQuery);assert.equal(edge.status,200,edge.text);
      assert.ok(edge.value.sample.rows.every(row=>Number.isFinite(row.rules.MeanCurvature)));
      const {principalAnalysis:_edgePrincipal,...edgeCommon}=edgeQuery;
      const edgeNormal=await post(normalRoute,{...edgeCommon,family:'surface-normal-generic-native',surfaceOrientation:-1});
      assert.equal(edgeNormal.status,200,edgeNormal.text);
      assert.deepEqual(edgeNormal.value.sample.rows[0].normal.map(x=>x===0?0:x),[0,0,-1]);
    }
    for(const epsilon of ['1e-8','1e-10']){
      const skew=await post(route,{...query,surface:['u+v',`${epsilon}*v`,'(u+v)**2'],
        uStart:0,uEnd:1,vStart:0,vEnd:1,uSegments:8,vSegments:8});
      assert.equal(skew.status,200,skew.text);
      for(const row of skew.value.sample.rows){
        const k=2/(1+4*(row.u+row.v)**2)**1.5,A=row.rules.CurvatureMatrix;
        assert.ok(Math.abs(A[0][0]-k)<1e-10&&Math.abs(A[0][1]-k)<1e-10);
        assert.ok(Math.abs(A[1][0])<1e-10&&Math.abs(A[1][1])<1e-10);
        assert.ok(Math.abs(row.rules.GaussianCurvature)<1e-10);
      }
    }
    for(const extra of [{surface:['u','s','0']},{surface:['u','v','eval(u)']},{uSegments:7},{surfaceOrientation:1}])
      assert.equal((await post(route,{...query,...extra})).status,422);
    assert.equal((await post(normalRoute,{...normalQuery,principalAnalysis:true})).status,422);
    assert.equal((await post('/api/tessellate',{...query,operation:'curved-surface-system-generic'})).status,400);
    assert.equal((await post('/api/tessellate',{...normalQuery,operation:'curved-surface-normal-generic'})).status,400);
  });
  it('runs original square-speed transport without repairing its actual-speed discrepancy or requiring an unmapped preview',async()=>{
    const route='/api/tessellation/curved-match-speed-generic',fixtures=JSON.parse(await readFile(path.join(root,
      'tests/fixtures/curved-match-speed-native-20261001.json'),'utf8')),query=fixtures.find(f=>f.name==='original-speed-counterexample').query;
    assert.equal((await request(route,{method:'POST',json:query})).status,403);
    const actual=await post(route,query);assert.equal(actual.status,200,actual.text);assert.deepEqual(actual.value.query,query);
    assert.equal(actual.value.certification.finiteSquaredTransportVerified,true);assert.equal(actual.value.certification.finiteActualSpeedMatchVerified,false);
    assert.equal(actual.value.source.speedEquationRepaired,false);assert.equal(actual.value.certification.adoptableCreasePattern,false);
    for(const row of actual.value.sample.rows){assert.ok(Math.abs(row.mappedParameter-row.s/4)<1e-12);assert.equal(row.matchedTargetSpeed,.5);}
    const optional=await post(route,fixtures.find(f=>f.name==='mapped-only-domain').query);assert.equal(optional.status,200,optional.text);
    assert.equal(optional.value.sample.rows[0].originalTargetPoint,null);assert.equal(optional.value.sample.rows[0].normalizedOriginalTargetPoint,null);
    for(const bad of [{targetCurve:['0','0']},{targetCurve:['1/s','0']},{sourceCurve:['eval(s)']},{extra:1}])assert.equal((await post(route,{...query,...bad})).status,422);
    assert.equal((await post('/api/tessellate',{...query,operation:'curved-match-speed-generic'})).status,400);
  });
  it('keeps literal nonuniform helix directions and separates valid spatial geometry from undefined planar recovery',async()=>{
    const route='/api/tessellation/curved-nonuniform-helix-generic',fixtures=JSON.parse(await readFile(path.join(root,
      'tests/fixtures/curved-nonuniform-helix-native-20261001.json'),'utf8')),query={...fixtures[0].query,segments:8,rulingSegments:3};
    assert.equal((await request(route,{method:'POST',json:query})).status,403);
    const response=await post(route,query);assert.equal(response.status,200,response.text);assert.deepEqual(response.value.query,query);
    assert.equal(response.value.flattening.status,'computed');assert.deepEqual(response.value.flattening.initial.point,[1,0]);
    assert.deepEqual(response.value.flattening.initial.tangent,[0,1]);assert.equal(response.value.certification.adoptableCreasePattern,false);
    for(const name of ['zero-gamma-spatial-only','zero-radius-spatial-only','two-pi-planar-unknown','negative-radius-beyond-right-angle']){
      const fixture=fixtures.find(f=>f.name===name),q={...fixture.query,segments:8,rulingSegments:3},actual=await post(route,q);
      assert.equal(actual.status,200,actual.text);assert.deepEqual(actual.value.query,q);
      assert.equal(actual.value.flattening.status,fixture.response.flattening.status);
      assert.ok(Math.hypot(...actual.value.sample.rows[0].sourceLeftDirector)>.99);
      if(!fixture.response.flattening.result)assert.equal(actual.value.flattening.result,null);
    }
    assert.equal((await post(route,{...query,pitchAngle:0,foldAngle:'0'})).status,422);
    assert.equal((await post(route,{...query,foldAngle:'eval(s)'})).status,422);
    assert.equal((await post('/api/tessellate',{...query,operation:'curved-nonuniform-helix-generic'})).status,400);
  });
  it('evaluates all original planar mirror stages, raw normals and the empty sequence without adopting analysis geometry',async()=>{
    const route='/api/tessellation/curved-planar-sequence-generic',fixtures=JSON.parse(await readFile(path.join(root,
      'tests/fixtures/curved-planar-sequence-native-20261001.json'),'utf8')),query=fixtures.find(f=>f.name==='noncircular').query;
    assert.equal((await request(route,{method:'POST',json:query})).status,403);
    const response=await post(route,query);assert.equal(response.status,200,response.text);assert.deepEqual(response.value.query,query);
    assert.equal(response.value.sample.rows[0].stages.length,3);assert.equal(response.value.certification.finiteMetricVerified,true);
    assert.equal(response.value.source.normalNormalized,false);assert.equal(response.value.certification.adoptableCreasePattern,false);
    const fixed=await post(route,{...query,composeReflections:false});assert.equal(fixed.status,200,fixed.text);
    assert.notDeepEqual(fixed.value.sample.rows[0].stages[2].base,response.value.sample.rows[0].stages[2].base);
    const raw=await post(route,{...query,mirrors:[{point:[0,0,1],normal:[0,0,2]}]});assert.equal(raw.status,200,raw.text);
    assert.deepEqual(raw.value.sample.rows[0].stages[1].director.slice(0,2),[0,0]);
    assert.ok(Math.abs(raw.value.sample.rows[0].stages[1].director[2]+7)<2e-14);assert.equal(raw.value.certification.finiteMetricVerified,false);
    assert.equal(raw.value.certification.conditionalReflectionIsometryCertified,false);
    const empty=await post(route,{...query,mirrors:[]});assert.equal(empty.status,200,empty.text);assert.equal(empty.value.sample.rows[0].stages.length,1);
    assert.deepEqual(empty.value.sample.rows[0].stages[0].base,empty.value.sample.rows[0].stages[0].fold);
    const unknown=await post(route,fixtures.find(f=>f.name==='unknown').query);assert.equal(unknown.status,200,unknown.text);
    assert.equal(unknown.value.domain.certified,false);assert.equal(unknown.value.sample.rows.at(-1).s,query.parameterEnd);
    assert.equal((await post(route,{...query,director:['1','0','0']})).status,422);
    assert.equal((await post(route,{...query,baseCurve:['eval(s)','0','0']})).status,422);
    assert.equal((await post('/api/tessellate',{...query,operation:'curved-planar-sequence-generic'})).status,400);
  });
  it('uses original special Cone and Tandev recovery formulas with independent raw initial frames and source identities',async()=>{
    for(const mode of ['cone','tandev']){
      const route=`/api/tessellation/curved-reshape-${mode}-generic`,fixture=JSON.parse(await readFile(path.join(root,
        `tests/fixtures/origamica-special-reshape-generic-${mode}-noncircular.json`),'utf8')),query={...fixture.query,rulingSegments:3};
      assert.equal((await request(route,{method:'POST',json:query})).status,403);
      const response=await post(route,query);assert.equal(response.status,200,response.text);assert.deepEqual(response.value.query,query);
      assert.equal(response.value.certification.formalIsometryCertified,true);assert.equal(response.value.certification.finiteMetricVerified,true);
      assert.equal(response.value.certification.adoptableCreasePattern,false);assert.equal(response.value.certification.integrationErrorIntervalCertified,false);
      const raw=await post(route,{...query,initialNormal:[0,0,0]});assert.equal(raw.status,200,raw.text);
      assert.deepEqual(raw.value.initial.normal,[0,0,0]);assert.equal(raw.value.certification.initialFrameCompatible,false);
      assert.equal(raw.value.certification.formalIsometryCertified,false);
      const constant=await post(route,{...query,director:['1','0','0']});assert.equal(constant.status,mode==='cone'?200:422,constant.text);
      if(mode==='cone'){
        assert.ok(constant.value.sample.rows.every(row=>row.targetBase.every((x,i)=>x===query.initialPoint[i])));
        const incompatible=await post(route,{...query,baseCurve:['s','0','0']});assert.equal(incompatible.status,200,incompatible.text);
        assert.equal(incompatible.value.certification.sourceCompatibilityAnalytic,false);assert.equal(incompatible.value.certification.formalIsometryCertified,false);
      }
      assert.equal((await post(route,{...query,extra:true})).status,422);
      assert.equal((await post('/api/tessellate',{...query,operation:`curved-reshape-${mode}-generic`})).status,400);
    }
  });
  it('recovers general flattening from an interior initial value and preserves incompatible source surfaces', async()=>{
    const route='/api/tessellation/curved-flatten-generic';
    const query={family:'flatten-generic-native',baseCurve:['s','.1*s**2','.2*s**3'],director:['0','0','1'],sigma:1,
      parameterStart:0,parameterEnd:1,transverseStart:-.2,transverseEnd:.2,segments:8,rulingSegments:3,
      initialParameter:.4,initialPoint:[2,3],initialTangent:[0,1]};
    assert.equal((await request(route,{method:'POST',json:query})).status,403);
    const response=await post(route,query);assert.equal(response.status,200,response.text);
    assert.deepEqual(response.value.query,query);assert.deepEqual(response.value.initial.point,[2,3]);
    assert.deepEqual(response.value.source.initialArgumentOrder,['ui','bi','ti']);
    assert.equal(response.value.certification.finiteMetricVerified,true);
    assert.equal(response.value.certification.formalIsometryCertified,true);
    assert.equal(response.value.certification.integrationErrorIntervalCertified,false);
    assert.equal(response.value.grid[0].normalizedTarget.length,4);
    const nondevelopable=await post(route,{...query,baseCurve:['s','0','0'],director:['0','Cos[s]','Sin[s]']});
    assert.equal(nondevelopable.status,200,nondevelopable.text);
    assert.equal(nondevelopable.value.certification.finiteMetricVerified,false);
    assert.equal(nondevelopable.value.diagnostics.sourceDevelopability.status,'incompatible');
    assert.equal(nondevelopable.value.sample.rows.length,9);
    assert.equal((await post(route,{...query,initialParameter:2})).status,422);
    assert.equal((await post(route,{...query,director:['0','0','__import__("os")']})).status,422);
    assert.equal((await post('/api/tessellate',{operation:'curved-flatten-generic',...query})).status,400);
  });
  it('preserves the original reshape director hint order and source coefficients independently of the hint length', async()=>{
    const route='/api/tessellation/curved-reshape-generic';
    const query={family:'reshape-generic-native',baseCurve:['s+.4','.2*s**2+.16*s','.1*s**3+.12*s**2'],director:[
      '(1+.1*s)/sqrt(1+.16*s**2+.09*s**4)',
      '.4*s*(1+.1*s)/sqrt(1+.16*s**2+.09*s**4)',
      '.3*s**2*(1+.1*s)/sqrt(1+.16*s**2+.09*s**4)'],normalCurvature:'.05+.02*sin(s)',sigma:1,
      parameterStart:0,parameterEnd:1,transverseStart:-.1,transverseEnd:.1,segments:8,rulingSegments:3,
      initialParameter:.4,initialPoint:[2,3,4],initialDirector:[0,5,0],initialTangent:[1,0,0]};
    assert.equal((await request(route,{method:'POST',json:query})).status,403);
    const response=await post(route,query);assert.equal(response.status,200,response.text);
    assert.deepEqual(response.value.query,query);assert.deepEqual(response.value.source.initialArgumentOrder,['ui','bbi','ddi','tti']);
    assert.deepEqual(response.value.initial.requestedDirector,[0,5,0]);
    assert.equal(response.value.initial.directorCompatible,false);
    assert.notDeepEqual(response.value.initial.computedDirector,[0,5,0]);
    assert.equal(response.value.certification.finiteMetricVerified,true);
    assert.equal(response.value.certification.adoptableCreasePattern,false);
    assert.equal((await post(route,{...query,normalCurvature:'eval(s)'})).status,422);
    assert.equal((await post(route,{...query,initialDirector:[1,0,0]})).status,422);
    assert.equal((await post('/api/tessellate',{operation:'curved-reshape-generic',...query})).status,400);
  });
  it('preserves general AcrossRight inputs and separates source output from pair isometry', async()=>{
    const route='/api/tessellation/curved-generic-across-right';
    const query={family:'curved-across-right',variant:'generic-native',mode:'both',flatCurve:['s','s^2/4'],flatLeftRuling:['0','1'],
      spaceCurve:['Sin[s]','s^2/4','1-Cos[s]'],spaceLeftRuling:['0','1','0'],foldAngleExpression:'2 ArcTan[2 Sqrt[1+s^2/4]]',
      parameterStart:.2,parameterEnd:.4,leftWidth:.15,rightWidth:.15,segments:8,rulingSegments:3};
    assert.equal((await request(route,{method:'POST',json:query})).status,403);
    const response=await post(route,query);assert.equal(response.status,200,response.text);
    assert.deepEqual(response.value.query,query);assert.equal(response.value.certification.finitePairMetricVerified,true);
    assert.equal(response.value.certification.fullIntervalPairIsometryCertified,false);
    assert.equal(response.value.certification.adoptableCreasePattern,false);
    assert.equal(response.value.sample.rows.length,9);assert.equal(response.value.sample.grid[0].length,8);
    const mismatch=await post(route,{...query,flatLeftRuling:['0','2']});assert.equal(mismatch.status,200,mismatch.text);
    assert.equal(mismatch.value.certification.finitePairMetricVerified,false);
    assert.deepEqual(mismatch.value.query.flatLeftRuling,['0','2']);
    assert.equal((await post(route,{...query,foldAngleExpression:'__import__("os")'})).status,422);
    assert.equal((await post('/api/tessellate',{...query,operation:'curved-generic-across-right'})).status,400);
  });
  it('solves general constant-width source functions without clamping the original foot', async()=>{
    const route='/api/tessellation/curved-constant-width';
    const query={family:'constant-width-generic-native',baseCurve:['cos(s)','sin(s)'],director:['-1','0'],signedOffset:.1,
      parameterStart:0,parameterEnd:.35*Math.PI,footEvaluationStart:-.5,footEvaluationEnd:2,segments:8};
    assert.equal((await request(route,{method:'POST',json:query})).status,403);
    const response=await post(route,query);assert.equal(response.status,200,response.text);
    assert.deepEqual(response.value.query,query);
    assert.equal(response.value.family,'origamica-generic-constant-width');
    assert.equal(response.value.source.actualEquationUsesUnextendedCurve,true);
    assert.equal(response.value.source.findRootOptionsForwarded,false);
    assert.equal(response.value.certification.fullIntervalDistanceCertified,true);
    assert.equal(response.value.certification.nearestFootDistanceChecked,false);
    assert.equal(response.value.sample.rows.length,9);
    assert.ok(response.value.sample.rows.at(-1).footParameter>query.parameterEnd);
    assert.equal((await post(route,{...query,baseCurve:['__import__("os")','s']})).status,422);
    assert.equal((await post(route,{...query,footEvaluationEnd:.1})).status,422);
    assert.equal((await post('/api/tessellate',{...query,operation:'curved-constant-width'})).status,400);
  });
  it('serves the literal saved In[3879] circle-width band as read-only data', async()=>{
    const route='/api/tessellation/curved-constant-width';
    const query={family:'constant-width-circle-in3879',width:.1,segments:16};
    assert.equal((await request(route,{method:'POST',json:query})).status,403);
    const response=await post(route,query);
    assert.equal(response.status,200,response.text);
    assert.equal(response.value.family,'origamica-constant-width-circle-band');
    assert.equal(response.value.source.savedCell,'In[3879]');
    assert.equal(response.value.source.actualEquationUsesUnextendedCurve,true);
    assert.equal(response.value.source.declaredTangentExtensionUnused,true);
    assert.equal(response.value.certification.sampledBandExactFOLD,false);
    assert.equal(response.value.certification.adoptableCreasePattern,false);
    assert.equal(response.value.sample.parameterValues.length,17);
    assert.ok(response.value.diagnostic.leftEndFootParameter>response.value.domain.end);
    assert.equal((await post(route,{...query,formula:'Sin[u]'})).status,422);
    assert.equal((await post(route,{...query,width:.11})).status,422);
    assert.equal((await post(route,{...query,segments:257})).status,422);
    assert.equal((await post('/api/tessellate',{operation:'curved-constant-width',...query})).status,400);
  });
  it('serves the saved In[3886] cone flattening only as a bounded read-only pair', async()=>{
    const route='/api/tessellation/curved-generic-cone-flatten';
    const query={family:'generic-cone-flatten-in3886',angleDeg:30,
      curveSegments:16,rulingSegments:2,rulingEnd:1};
    assert.equal((await request(route,{method:'POST',json:query})).status,403);
    const response=await post(route,query);
    assert.equal(response.status,200,response.text);
    assert.equal(response.value.family,'origamica-generic-cone-flatten-pair');
    assert.equal(response.value.source.savedCell,'In[3886]');
    assert.equal(response.value.certification.continuousIsometryAnalytic,true);
    assert.equal(response.value.certification.apexAtVOneSingular,true);
    assert.equal(response.value.certification.regularExactlyForVLessThanOne,true);
    assert.equal(response.value.certification.sampleIncludesApex,true);
    assert.equal(response.value.certification.sampledSurfaceExactFOLD,false);
    assert.equal(response.value.certification.adoptableCreasePattern,false);
    assert.equal(response.value.sample.flatSamples.length,17);
    assert.equal(response.value.sample.flatSamples[0].length,3);
    assert.equal((await post(route,{...query,expression:'Sin[u]'})).status,422);
    assert.equal((await post(route,{...query,angleDeg:0})).status,422);
    assert.equal((await post(route,{...query,rulingEnd:1.1})).status,422);
    assert.equal((await post('/api/tessellate',{
      operation:'curved-generic-cone-flatten',...query})).status,400);
  });
  it('serves deprecated MakeAltMoselyPot saved geometry only as a read-only display', async()=>{
    const route='/api/tessellation/alt-mosely-pot-reference';
    const query={family:'alt-mosely-pot-reference',example:3557,sectors:8};
    assert.equal((await request(route,{method:'POST',json:query})).status,403);
    const response=await post(route,query);
    assert.equal(response.status,200,response.text);
    assert.equal(response.value.family,'origamica-alt-mosely-pot-display');
    assert.equal(response.value.source.definitionCell,'In[3556]');
    assert.equal(response.value.source.savedCell,'In[3557]');
    assert.equal(response.value.source.classDeprecated,true);
    assert.equal(response.value.profile.axisPointAdded,true);
    assert.equal(response.value.display.foldedFaces.length,160);
    assert.equal(response.value.certification.exactFOLD,false);
    assert.equal(response.value.certification.adoptableCreasePattern,false);
    assert.equal((await post(route,{...query,sectors:7})).status,422);
    assert.equal((await post(route,{...query,example:3559})).status,422);
    assert.equal((await post(route,{...query,promoteToFold:true})).status,422);
    assert.equal((await post('/api/tessellate',{
      operation:'alt-mosely-pot-reference',...query})).status,400);
  });
  it('serves the saved Huffman circle-four pair only as a non-isometric audit', async()=>{
    const route='/api/tessellation/huffman-circle4';
    const query={family:'huffman-circle4-in4072',divisions:8};
    assert.equal((await request(route,{method:'POST',json:query})).status,403);
    const response=await post(route,query);
    assert.equal(response.status,200,response.text);
    assert.equal(response.value.family,'origamica-huffman-circle4-pair');
    assert.equal(response.value.source.displayCell,'In[4072]');
    assert.equal(response.value.source.machineReadableWolframOut,false);
    assert.equal(response.value.source.samplingStatus,'bounded-local-extension');
    assert.equal(response.value.sample.rows.length,9);
    assert.ok(response.value.closure.maximumAbsoluteResidual<2e-6);
    assert.equal(response.value.certification.thirdRulingOffset,1e-6);
    assert.equal(response.value.certification.completeBlockExactIsometry,false);
    assert.equal(response.value.certification.adoptableCreasePattern,false);
    assert.equal((await post(route,{...query,expression:'Sin[t]'})).status,422);
    assert.equal((await post(route,{...query,divisions:65})).status,422);
    assert.equal((await post('/api/tessellate',{operation:'huffman-circle4',...query})).status,400);
  });
    it('serves the partially worked-out Huffman parabola only as a read-only pair',async()=>{
      const route='/api/tessellation/huffman-parabola';
      const query={family:'huffman-parabola-in4060',divisions:8};
      assert.equal((await request(route,{method:'POST',json:query})).status,403);
      const response=await post(route,query);
      assert.equal(response.status,200,response.text);
      assert.equal(response.value.family,'origamica-huffman-confocal-parabola-pair');
      assert.equal(response.value.source.originalCompletionStatus,'partially-worked-out');
      assert.equal(response.value.source.machineReadableWolframOut,false);
      assert.equal(response.value.source.samplingStatus,'bounded-local-extension');
      assert.equal(response.value.sample.rows.length,9);
      assert.equal(response.value.diagnostics.closureConditionsSaved,false);
      assert.equal(response.value.certification.thirdRulingOffset,1e-6);
      assert.equal(response.value.certification.completeBlockExactIsometry,false);
      assert.equal(response.value.certification.adoptableCreasePattern,false);
      assert.equal((await post(route,{...query,expression:'Sin[t]'})).status,422);
      assert.equal((await post(route,{...query,divisions:65})).status,422);
      assert.equal((await post('/api/tessellate',{operation:'huffman-parabola',...query})).status,400);
    });
  it('solves both notebook tilted-pleat degree-three local examples without mutating the crease pattern', async()=>{
    const route='/api/tessellation/flagstone-tilted-star';
    const points=[[-2.25,.25],[0,0],[1.9,-1.18],[1.4,1],[1.11,3.58],[-.3,1.4]];
    assert.equal((await request(route,{method:'POST',json:{points,direction:1}})).status,403);
    const ccw=await post(route,{points,direction:1});
    assert.equal(ccw.status,200,ccw.text);
    assert.equal(ccw.value.kind,'origamica-tilted-pleat-degree3-local');
    assert.equal(ccw.value.centralTriangle.length,3);
    assert.ok(ccw.value.reflectedCornerMaxGap<1e-8);
    assert.equal(ccw.value.creaseAssignmentsKnown,false);
    assert.equal(ccw.value.wholeTessellationConstructed,false);
    const cw=await post(route,{points,direction:-1});
    assert.equal(cw.status,200,cw.text);
    assert.ok(cw.value.reflectedCornerMaxGap<1e-8);
    assert.ok(Math.abs(ccw.value.centralTriangle[0][0]-cw.value.centralTriangle[0][0])>.01);
    assert.equal((await post(route,{points:points.slice(1),direction:1})).status,422);
    assert.equal((await post('/api/tessellate',{operation:'flagstone-tilted-star',points,direction:1})).status,400);
  });
  it('derives one 3D vertex from cyclic fold vectors while retaining nondevelopable examples', async()=>{
    const route='/api/tessellation/vertex-from-fold-vectors';
    const input={foldVectors:[[2,0,0],[0,3,0],[0,0,4]]};
    assert.equal((await request(route,{method:'POST',json:input})).status,403);
    const result=await post(route,input);
    assert.equal(result.status,200,result.text);
    assert.equal(result.value.kind,'origamica-single-vertex-from-fold-vectors');
    assert.deepEqual(result.value.sectorAnglesDeg,[90,90,90]);
    assert.deepEqual(result.value.foldAnglesDeg,[90,90,90]);
    assert.equal(result.value.developable,false);
    assert.equal(result.value.globalRigidFoldingChecked,false);
    assert.equal((await post(route,{foldVectors:[[1,0,0],[2,0,0],[0,0,1]]})).status,422);
    assert.equal((await post('/api/tessellate',{operation:'vertex-from-fold-vectors',...input})).status,400);
  });
  it('serves an Origamica circular twist as a workspace crease pattern with strict flat coordinates', async()=>{
    const route='/api/tessellation/circular-twist';
    const input={family:'circular-twist',polygon:[[0,0],[1,0],[.5,.4]],angle:30,radius:2,
      circleDivisions:16,centralTypes:['M','M','V'],stationaryFace:'auto'};
    assert.equal((await request(route,{method:'POST',json:input})).status,403);
    const analysis=await post(route,input);
    assert.equal(analysis.status,200,analysis.text);
    assert.equal(analysis.value.stats.kind,'circular-twist');
    assert.deepEqual([analysis.value.stats.vertices,analysis.value.stats.edges,analysis.value.stats.faces],[24,30,7]);
    assert.equal(analysis.value.stats.checks.geometry.status,'passed');
    assert.equal(analysis.value.stats.checks.local.status,'passed');
    assert.equal(analysis.value.source.foldedForm.length,24);
    assert.equal(analysis.value.source.circularizedFoldedFormIsometric,false);
    assert.ok(analysis.value.source.closureError<1e-9);
    const workspace=await post('/api/tessellate',input);
    assert.equal(workspace.status,200,workspace.text);
    assert.deepEqual(workspace.value.fold.edges_assignment,analysis.value.fold.edges_assignment);
    assert.equal((await post(route,{...input,circleDivisions:7})).status,422);
    assert.equal((await post('/api/tessellate',{...input,operation:'circular-twist'})).status,400);
  });
  it('routes the original single vertex quadrilateral mesh construction', async()=>{
    const route='/api/tessellation/rigid-single-vertex-quad-mesh';
    const input={bottom:[90,60],left:[0,135]};
    assert.equal((await request(route,{method:'POST',json:input})).status,403);
    const result=await post(route,input);
    assert.equal(result.status,200,result.text);
    assert.equal(result.value.kind,'origamica-rigid-single-vertex-quad-mesh');
    assert.equal(result.value.foldAnglesDeg.length,4);
    assert.equal((await post(route,{...input,bottom:[90,0]})).status,422);
    assert.equal((await post('/api/tessellate',{...input,operation:'rigid-single-vertex-quad-mesh'})).status,400);
  });
  it('serves the original rectangular rigid quadrilateral mesh with 2D and 3D coordinates', async()=>{
    const route='/api/tessellation/rigid-quad-mesh';
    const small=2*Math.atan(1/Math.sqrt(2))*180/Math.PI;
    const large=2*Math.atan(Math.sqrt(2))*180/Math.PI;
    const input={bottomDirectionsDeg:[90,90],bottomFoldAnglesDeg:[-small,small],
      leftDirectionsDeg:[30,30],leftFoldAnglesDeg:[large,-large]};
    assert.equal((await request(route,{method:'POST',json:input})).status,403);
    const result=await post(route,input);
    assert.equal(result.status,200,result.text);
    assert.equal(result.value.kind,'origamica-rigid-rectangular-quad-mesh');
    assert.deepEqual([result.value.horizontalFaces,result.value.verticalFaces],[3,3]);
    assert.equal(result.value.vertices_coords.length,16);
    assert.equal(result.value.vertices_coords3d.length,16);
    assert.equal(result.value.edges_vertices.length,24);
    assert.equal(result.value.faces_vertices.length,9);
    assert.ok(result.value.maximumFaceDistanceError<1e-8);
    assert.equal(result.value.staticGlobalIsometryChecked,true);
    assert.equal(result.value.globalRigidFoldingChecked,false);
    assert.equal((await post(route,{...input,minimumEdgeLength:0})).status,422);
    assert.equal((await post('/api/tessellate',{...input,operation:'rigid-quad-mesh'})).status,400);
  });
  it('serves Goldberg numerical references without treating them as foldable tessellations', async()=>{
    const route='/api/tessellation/goldberg-reference';
    const patch={mode:'sector-patch',order:8,rings:2};
    assert.equal((await request(route,{method:'POST',json:patch})).status,403);
    const sector=await post(route,patch);
    assert.equal(sector.status,200,sector.text);
    assert.equal(sector.value.kind,'goldberg-numerical-reference');
    assert.equal(sector.value.faces.length,4);
    assert.equal(sector.value.dualTargets.length,4);
    assert.equal(sector.value.tileSpecs.length,4);
    assert.equal(sector.value.tileSpecs[2].branch,'B');
    assert.deepEqual(sector.value.tileSpecs[2].anglePiFractions,[[3,8],[1,4],[3,8]]);
    assert.deepEqual(sector.value.tileSpecs[2].rotationPiFraction,[1,4]);
    assert.equal(sector.value.creasePattern,false);
    assert.equal(sector.value.mountainValleyAssigned,false);
    assert.equal(sector.value.flatFoldabilityChecked,false);
    assert.equal(sector.value.fold,undefined);
    const line=await post(route,{mode:'offset-lines',order:8,rings:2,offset:5});
    assert.equal(line.status,200,line.text);
    assert.equal(line.value.topology,'separated-face-patches-with-line-bridge');
    assert.equal(line.value.segments.length,61);
    assert.deepEqual(line.value.faces,[]);
    assert.equal(line.value.tileSpecs.length,32);
    assert.deepEqual(line.value.tileFrameTranslation,[-2.5,0]);
    assert.equal(line.value.output,'reference-geometry');
    const fractionalTiles=await post(route,{mode:'tile-tiling',order:8,rings:2,offset:0.5});
    assert.equal(fractionalTiles.status,200,fractionalTiles.text);
    assert.equal(fractionalTiles.value.sourceFunction,'GoldbergOffsetTiling');
    assert.equal(fractionalTiles.value.faces.length,32);
    assert.deepEqual(fractionalTiles.value.tileFrameTranslation,[-0.25,0]);
    assert.deepEqual(fractionalTiles.value.tileSpecs[16].rotationPiFraction,[-1,1]);
    assert.deepEqual(fractionalTiles.value.dualTargets,[]);
    assert.equal(fractionalTiles.value.creasePattern,false);
    for(const invalid of [{mode:'offset-lines',order:7,rings:2,offset:1},{mode:'offset-lines',order:8,rings:2,offset:65},
                          {mode:'sector-patch',order:8,rings:2,offset:5},{mode:'offset-lines',order:8,rings:2,offset:5,family:'twist'},
                          {mode:'offset-lines',order:8,rings:2,offset:0.5},{mode:'tile-tiling',order:7,rings:2,offset:0.5}]){
      assert.equal((await post(route,invalid)).status,422);
    }
    assert.equal((await post('/api/tessellate',{operation:'goldberg-reference',...patch})).status,400);
    assert.equal((await post('/api/tessellate',{family:'nonperiodic',kind:'goldberg',goldbergVersion:'origamica',goldbergOrder:8,goldbergRings:2,goldbergOffset:5,goldbergOutput:'tiling'})).status,422);
  });
  it('accepts bounded Cartesian ring curves through the long-lived tessellation worker', async()=>{
    const square=[[1,1],[-1,1],[-1,-1],[1,-1]];
    const params={family:'ring',ringMode:'origamica',sides:8,rings:2,
      outerRadii:[1,1.8,2.6],creaseRadii:[1.35,2.15],angle:36,offsetAngle:13,
      outerVectors:[square,square,square],creaseVectors:[square,square]};
    const result=await post('/api/tessellate',params);
    assert.equal(result.status,200,result.text);
    assert.equal(result.value.source.curveFamily,'cartesian-polygon');
    assert.equal(result.value.stats.checks.geometry.status,'passed');
    assert.equal(result.value.stats.checks.local.status,'passed');
    assert.ok(result.value.source.closureError<1e-8);
    assert.deepEqual(result.value.stats.parameters.outerVectors,params.outerVectors);
    const crossed=await post('/api/tessellate',{...params,creaseVectors:[[[1.5,1],[-1,1],[-1,-1],[1.5,-1]],square]});
    assert.equal(crossed.status,422);
    assert.match(crossed.value.error,/嵌套/);
  });
  it('generates each independent tessellation family and preserves generator metadata in projects', async()=>{
    for(const params of [{family:'twist',sides:6,angle:36,scale:.5},{family:'periodic',tiling:'triangle',rows:2,columns:3,angle:36,scale:.3},{family:'primal-dual',tiling:'square',rings:1,angle:36,scale:.5},{family:'archimedean'},{family:'nonperiodic'},{family:'custom',vertices:[[0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[0,2],[1,2],[2,2]],faces:[[0,1,4,3],[1,2,5,4],[3,4,7,6],[4,5,8,7]]},{family:'ring'},{family:'flagstone'},{family:'woven'}]){
      const r=await post('/api/tessellate',params);assert.equal(r.status,200,r.text);
      assert.equal(r.value.stats.checks.geometry.status,'passed');assert.equal(r.value.stats.checks.local.status,'passed');
      for(const [key,value] of Object.entries(params))assert.deepEqual(r.value.stats.parameters[key],value);
      const generated={...doc(params.family),metadata:{tessellation:{parameters:r.value.stats.parameters,source:r.value.source}}};
      const saved=await post('/api/projects',{doc:generated});assert.equal(saved.status,200);
      const opened=await request('/api/projects/'+saved.value.id);assert.deepEqual(opened.value.doc.metadata,generated.metadata);
    }
    assert.equal((await post('/api/tessellate',{family:'periodic',rows:1})).status,422);
  });
  it('roundtrips starting face settings and rejects malformed replacement', async()=>{
    const current={...doc('起始面恢复'),flatFold:{startingFace:[[0,0],[100,0],[0,100]]}};
    assert.equal((await post('/api/recovery',{doc:current})).status,200);
    assert.deepEqual((await request('/api/recovery')).value.doc.flatFold,current.flatFold);
    const saved=await post('/api/projects',{doc:current});assert.equal(saved.status,200);
    assert.deepEqual((await request('/api/projects/'+saved.value.id)).value.doc.flatFold,current.flatFold);
    for(const flatFold of [null,{startingFace:[[0,0],[1,0]]},{startingFace:[[0,0],[1,0],[0,0]]}]){
      assert.equal((await post('/api/recovery',{doc:{...current,flatFold}})).status,400);
      assert.equal((await post('/api/projects',{id:saved.value.id,doc:{...current,flatFold}})).status,400);
    }
    assert.deepEqual((await request('/api/recovery')).value.doc,current);
    assert.deepEqual((await request('/api/projects/'+saved.value.id)).value.doc,current);
  });
  it('roundtrips embedded background recovery and rejects unsafe replacement without losing previous data', async()=>{
    const background={name:'底图.png',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ZkAAAAASUVORK5CYII=',width:1,height:1,opacity:.5,visible:true,placement:{origin:[0,0],axis:[100,0]}};
    const current={...doc('底图恢复'),background:{...background,viewport:{x:-30,y:50,units:.5}}};
    assert.equal((await post('/api/recovery',{doc:current})).status,200);
    assert.deepEqual((await request('/api/recovery')).value.doc,current);
    for(const patch of [{dataUrl:'https://example.com/a.png'},{opacity:2},{placement:{origin:[0,0],axis:[0,0]}},{viewport:{x:0,y:0,units:0}},{viewport:{x:0,y:0,units:-2}}]){
      assert.equal((await post('/api/recovery',{doc:{...current,background:{...background,...patch}}})).status,400);
      assert.deepEqual((await request('/api/recovery')).value.doc,current);
    }
  });
  it('roundtrips custom display colors and rejects unsafe replacement', async()=>{
    const current=doc('自定义显示色');current.segments[0].displayColor='#abcdef';
    assert.equal((await post('/api/recovery',{doc:current})).status,200);
    assert.deepEqual((await request('/api/recovery')).value.doc,current);
    for(const color of ['red','url(evil)',null,123]){
      const invalid=structuredClone(current);invalid.segments[0].displayColor=color;
      assert.equal((await post('/api/recovery',{doc:invalid})).status,400);
      assert.deepEqual((await request('/api/recovery')).value.doc,current);
    }
  });
  it('roundtrips v2 object data in recovery and rejects malformed or future documents', async () => {
    const current = { ...doc('v2对象'), schemaVersion: 2, objects: [
      { id: 'c', kind: 'circle', center: [0,0], radius: 5, color: '#123456' },
      { id: 't', kind: 'text', position: [10,20], text: '中文文字', fontSize: 4, color: '#234567' },
      { id: 'a', kind: 'mark', a: [0,0], b: [10,10], color: '#345678' },
    ] };
    assert.equal((await post('/api/recovery', { doc: current })).status, 200);
    assert.deepEqual((await request('/api/recovery')).value.doc, current);
    for (const invalid of [{...current,schemaVersion:3}, {...current,objects:[{...current.objects[0],radius:-1}]},
      {...current,objects:[{...current.objects[0],id:'m1'}]}, {...current,objects:[{...current.objects[0],kind:'future'}]}]) {
      assert.equal((await post('/api/recovery',{doc:invalid})).status,400);
      assert.deepEqual((await request('/api/recovery')).value.doc,current);
    }
  });
  it('health reports local app and computation availability', async () => {
    const res = await request('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.value.ok, true);
    assert.equal(res.value.app, 'zhezhi-workbench');
    assert.equal(res.value.tessAvailable, true);
    assert.match(res.value.token, /^[a-f0-9]{64}$/);
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    if(process.env.ZHEZHI_RUST_SERVER){
      assert.equal(res.headers['cross-origin-opener-policy'],'same-origin');
      assert.equal(res.headers['cross-origin-embedder-policy'],'require-corp');
      assert.equal(res.headers['cross-origin-resource-policy'],'same-origin');
      assert.match(res.headers['content-security-policy'],/worker-src 'self' blob:/);
    }
  });

  it('native app, simulator and worker responses share the isolation policy', {skip:!process.env.ZHEZHI_RUST_SERVER}, async()=>{
    const worker=(await readdir(path.join(root,'dist','assets'))).find(name=>/^flatFold\.worker.*\.js$/.test(name));
    assert.ok(worker,'Build the production frontend before native app resource checks');
    for(const route of ['/', '/_desktop/startup.html', '/simulator/index.html', '/assets/'+worker]){
      const response=await request(route);
      assert.equal(response.status,200,route);
      assert.ok(response.text.length>0,route);
      assert.equal(response.headers['cross-origin-opener-policy'],'same-origin',route);
      assert.equal(response.headers['cross-origin-embedder-policy'],'require-corp',route);
      assert.equal(response.headers['cross-origin-resource-policy'],'same-origin',route);
      assert.equal(response.headers['access-control-allow-origin'],undefined,route);
    }
  });

  it('rejects missing/wrong tokens and external Host or Origin', async () => {
    for (const headers of [{}, { 'X-Zhezhi-Token': 'not-the-token' }]) {
      const res = await request('/api/projects', { method: 'POST', json: { doc: doc() }, headers });
      assert.equal(res.status, 403);
      assert.match(res.value.error, /刷新/);
    }
    for (const headers of [{ Host: 'evil.example:8791' }, { Origin: 'https://evil.example' }, { Origin: 'null' }]) {
      const res = await request('/api/health', { headers });
      assert.equal(res.status, 403);
      assert.equal(res.value.token, undefined);
      assert.equal(res.headers['access-control-allow-origin'],undefined);
    }
    const local = await request('/api/health', { headers: { Origin: `http://127.0.0.1:${port}` } });
    assert.equal(local.status, 200);
    assert.deepEqual((await request('/api/projects')).value.projects, []);
  });

  it('validates JSON, finite coordinates, dimensions, assignments and path IDs', async () => {
    for (const raw of ['{', '{"doc":NaN}', '{"doc":{"paper":{"width":1e999}}}']) {
      const res = await request('/api/projects', { method: 'POST', raw, headers: auth() });
      assert.equal(res.status, 400);
      assert.ok(res.value.error);
    }
    for (const route of ['/api/projects', '/api/recovery']) {
      const res = await post(route, null);
      assert.equal(res.status, 400);
      assert.match(res.value.error, /工程格式无效/);
    }
    const cases = [
      { ...doc(), paper: { width: 0, height: 100 } },
      { ...doc(), paper: { width: null, height: 100 } },
      { ...doc(), segments: [{ ...doc().segments[0], angle: 181 }] },
      { ...doc(), segments: [{ ...doc().segments[0], assignment: 'INVALID' }] },
      { ...doc(), segments: [{ ...doc().segments[0], a: [null, 1] }] },
    ];
    for (const invalid of cases) assert.equal((await post('/api/projects', { doc: invalid })).status, 400);
    assert.equal((await post('/api/projects', { id: '../outside', doc: doc() })).status, 400);
    assert.equal((await request('/api/projects/not-a-project')).status, 400);
    assert.equal((await request('/api/projects/00000000-0000-0000-0000-000000000000')).status, 404);
  });

  it('validates malformed document envelopes above the former body ceiling', async () => {
    const raw = JSON.stringify({ padding: 'x'.repeat(32*1024*1024+4097) });
    const res = await request('/api/projects', { method: 'POST', raw, headers: auth() });
    assert.equal(res.status, 400);
    assert.match(res.value.error, /工程格式无效/);
    assert.equal((await request('/api/health')).status, 200);
  });

  it('saves and opens Chinese projects atomically with backup and no temp leftovers', async () => {
    const original = doc();
    const saved = await post('/api/projects', { doc: original });
    assert.equal(saved.status, 200);
    const id = saved.value.id;
    assert.match(id, /^[a-f0-9-]{36}$/);
    assert.deepEqual((await request(`/api/projects/${id}`)).value.doc, original);
    const replacement = doc('接口测试·第二次保存');
    assert.equal((await post('/api/projects', { id, doc: replacement })).status, 200);
    const onDisk = JSON.parse(await readFile(path.join(testData, 'projects', `${id}.json`), 'utf8'));
    const backup = JSON.parse(await readFile(path.join(testData, 'projects', `${id}.json.bak`), 'utf8'));
    assert.deepEqual(onDisk.doc, replacement);
    assert.deepEqual(backup.doc, original);
    const updates = Array.from({ length: 5 }, (_, i) => doc(`并发中文版本 ${i}`));
    const baseRevision=(await request('/api/projects/'+id)).value.revision;
    const replies = await Promise.all(updates.map(value => post('/api/projects', { id, doc: value,baseRevision })));
    assert.equal(replies.filter(r=>r.status===200).length,1);
    assert.equal(replies.filter(r=>r.status===409).length,4);
    const reopened = (await request(`/api/projects/${id}`)).value;
    assert.ok(updates.some(d => d.name === reopened.doc.name));
    assert.ok(JSON.parse(await readFile(path.join(testData, 'projects', `${id}.json.bak`), 'utf8')).doc);
    assert.ok(!(await readdir(path.join(testData, 'projects'))).some(n => n.endsWith('.tmp')));
    const listed = await request('/api/projects');
    assert.equal(listed.value.projects.length, 1);
    assert.equal(listed.value.projects[0].id, id);
  });

  it('lists healthy projects chronologically while preserving and skipping damaged project files', async () => {
    const older = await post('/api/projects', { doc: doc('正常旧工程') });
    const newer = await post('/api/projects', { doc: doc('正常新工程') });
    assert.equal(older.status, 200); assert.equal(newer.status, 200);
    const healthy=[];
    for (const [saved,updated] of [[older,'2026-10-14T20:00:00.000Z'],[newer,'2026-10-15T20:00:00.000Z']]) {
      const file=path.join(testData,'projects',saved.value.id+'.json');
      const project=JSON.parse(await readFile(file,'utf8'));
      project.updated=updated; await writeFile(file,JSON.stringify(project)); healthy.push(project);
    }
    const damaged=[
      {text:'{'},
      ...[undefined,null,10,'invalid timestamp'].map(updated=>({patch:{updated}})),
      {patch:{format:'unrecognized-project'}},
      {patch:{version:99}},
      {patch:{id:'not-a-project-id'}},
      {patch:{doc:{...doc(),segments:null}}},
      {patch:{doc:{...doc(),name:{damaged:true}}}},
    ];
    const fixtures=[];
    for (const [index,damagedProject] of damaged.entries()) {
      const id='00000000-0000-0000-0000-'+index.toString(16).padStart(12,'0');
      const text=damagedProject.text??JSON.stringify({...healthy[0],id,...damagedProject.patch});
      const file=path.join(testData,'projects',id+'.json');
      await writeFile(file,text); fixtures.push({file,text});
    }
    const mismatched=path.join(testData,'projects','00000000-0000-0000-0001-000000000000.json');
    fixtures.push({file:mismatched,text:JSON.stringify(healthy[0])});
    await writeFile(mismatched,fixtures.at(-1).text);
    const listed=await request('/api/projects');
    assert.equal(listed.status,200,listed.text);
    assert.deepEqual(listed.value.projects.map(project=>({id:project.id,name:project.name,updated:project.updated})),
      [healthy[1],healthy[0]].map(project=>({id:project.id,name:project.doc.name,updated:project.updated})));
    for(const fixture of fixtures)assert.equal(await readFile(fixture.file,'utf8'),fixture.text);
    for(const project of healthy)assert.deepEqual((await request('/api/projects/'+project.id)).value.doc,project.doc);
  });

  it('writes and reads recovery separately, preserving unknown angles', async () => {
    const recovery = doc('自动恢复·未命名中文');
    assert.equal((await post('/api/recovery', { doc: recovery, projectId: null })).status, 200);
    const reopened = await request('/api/recovery');
    assert.deepEqual(reopened.value.doc, recovery);
    assert.equal(reopened.value.doc.segments[2].angle, null);
    assert.equal(reopened.value.projectId, null);
  });

  it('runs real tessellation and rejects invalid/NaN parameters without touching saved data', async () => {
    const saved=await post('/api/projects',{doc:doc('镶嵌测试原工程')});assert.equal(saved.status,200);
    const res = await post('/api/tessellate', { tiling: 'hexagon', rings: 2, angle: 36, scale: 0.5 });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.value.stats.vertices, 96);
    assert.equal(res.value.stats.edges, 180);
    assert.equal(res.value.stats.checks.geometry.status, 'passed');
    assert.equal(res.value.stats.checks.local.status, 'passed');
    assert.equal(res.value.stats.checks.layerOrder.status, 'not_checked');
    assert.equal(res.value.stats.foldability, 'candidate');
    assert.match(res.value.warnings.at(-1), /整体层序/);
    assert.ok(!res.text.includes('\ufffd'));
    assert.equal((await post('/api/tessellate', { rings: 4 })).status, 422);
    assert.equal((await request('/api/tessellate', { method: 'POST', raw: '{"angle":NaN}', headers: auth() })).status, 400);
    for (const fit of ['extend', 'inscribed']) {
      for (const family of [[], {}, null, true, 1]) {
        const invalid = await post('/api/tessellate', {family, paper: {shape:'square', margin:.1, fit}});
        assert.equal(invalid.status, 422, invalid.text);
        assert.match(invalid.value.error, /family 无效/);
      }
    }
    // Reuse the same real worker after the invalid requests; a valid narrow
    // crop must retain its small corner faces instead of returning a crack.
    const cropped = await post('/api/tessellate', {family:'woven', paper:{shape:'rectangle', aspect:5, margin:.1, fit:'inscribed'}});
    assert.equal(cropped.status, 200, cropped.text);
    assert.equal(cropped.value.source.paperMethod, 'inscribed-pattern-clip-v1');
    assert.equal(cropped.value.stats.faces, 25);
    assert.equal(cropped.value.stats.checks.geometry.status, 'passed');
    assert.equal(cropped.value.stats.checks.local.status, 'passed');
    assert.equal(cropped.value.source.sourceFaceMap.length, 25);
    assert.equal((await request('/api/projects')).value.projects.length, 1);
    assert.deepEqual((await request('/api/projects/'+saved.value.id)).value.doc,doc('镶嵌测试原工程'));
  });

  it('saves, replaces and recovers projects larger than the former 32 MiB ceiling', async()=>{
    const current={...doc(),metadata:{padding:''}};
    const overhead=Buffer.byteLength(serializeProject(current));
    current.metadata.padding='x'.repeat(32*1024*1024+1-overhead);
    const saved=await post('/api/projects',{doc:current});assert.equal(saved.status,200,saved.text);
    const reopened=await request('/api/projects/'+saved.value.id);assert.equal(reopened.status,200);
    assert.equal(Buffer.byteLength(serializeProject(reopened.value.doc)),32*1024*1024+1);
    const oversized={...current,metadata:{padding:current.metadata.padding+'x'}};
    const replaced=await post('/api/projects',{id:saved.value.id,doc:oversized});
    assert.equal(replaced.status,200,replaced.text);
    assert.deepEqual((await request('/api/projects/'+saved.value.id)).value.doc,oversized);
    assert.equal((await post('/api/recovery',{doc:current})).status,200);
    assert.equal((await post('/api/recovery',{doc:oversized})).status,200);
    assert.deepEqual((await request('/api/recovery')).value.doc,oversized);
    const invalid={...oversized,paper:{width:0,height:100}};
    assert.equal((await post('/api/projects',{id:saved.value.id,doc:invalid})).status,400);
    assert.deepEqual((await request('/api/projects/'+saved.value.id)).value.doc,oversized);
  });

  it('rejects concurrent computation, cancels disconnected work and permits a later generation', async () => {
    const controller = new AbortController();
    const first = post('/api/tessellate', { tiling: 'triangle', rings: 3, angle: 36, scale: 0.5 }, { signal: controller.signal });
    const firstOutcome = first.then(value => value, error => error);
    await delay(80);
    const busy = await post('/api/tessellate', { tiling: 'square', rings: 1, angle: 36, scale: 0.5 });
    assert.equal(busy.status, 429);
    controller.abort();
    const cancelled = await firstOutcome;
    assert.equal(cancelled.name, 'AbortError');
    let retry;
    for (let attempt = 0; attempt < 20; attempt++) {
      retry = await post('/api/tessellate', { tiling: 'square', rings: 1, angle: 36, scale: 0.5 });
      if (retry.status !== 429) break;
      await delay(100);
    }
    assert.equal(retry.status, 200, retry.text);
    assert.equal(retry.value.stats.vertices, 32);
  });
});
