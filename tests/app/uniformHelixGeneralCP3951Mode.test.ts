import {test} from 'node:test';import assert from 'node:assert/strict';
import {UNIFORM_HELIX_MODE_DEFAULT as mode0,UNIFORM_HELIX_MODE_EXAMPLE as r,validateUniformHelixModeRecipe as valid,uniformHelixModeSourceKey as key,uniformHelixModeSourceMatches as matches,readUniformHelixModeRecipe as read,prepareUniformHelixModePreview as prepare,type UniformHelixGeneralCP3951Mode as Mode} from '../../src/app/uniformHelixGeneralCP3951Mode';
import {exportDocument,importDocument} from '../../src/core/formats';
test('default stays v1; v2 selected explicitly without changing numeric recipe',()=>{
 assert.equal(mode0,'principal-v1');for(const mode of ['principal-v1','literal-extended-v2'] as Mode[]){const input={...r,segments:16},before=JSON.stringify(input),p=prepare(mode,input),d=p.build(input);assert.equal(JSON.stringify(input),before);assert.equal(read(d)!.mode,mode);assert.deepEqual(read(d)!.recipe,input);assert.ok(matches(mode,d));assert.equal(matches(mode==='principal-v1'?'literal-extended-v2':'principal-v1',d),false);}
});
test('v1 broadening never happens by fallback; raw v2 branch/alias inputs stay unchanged',()=>{
 const raw={...r,helicityAngleDeg:390,foldAngleDeg:270,segments:16};assert.throws(()=>valid('principal-v1',raw));assert.deepEqual(valid('literal-extended-v2',raw),raw);const p=prepare('literal-extended-v2',raw),d=p.build(raw);assert.equal(p.view.positiveFocusSide,'right');assert.equal(p.view.circleRadiusMm!<0,true);assert.match(p.view.classificationText,/不满足/);assert.deepEqual(read(d)!.recipe,raw);
});
test('oddπ and paper-degenerate source modes have explicit truthful view roles',()=>{
 const straight=prepare('literal-extended-v2',{...r,foldAngleDeg:180,segments:16});assert.equal(straight.view.explicitPiContinuation,true);assert.equal(straight.view.circleRadiusMm,null);assert.equal(straight.view.positiveFocusSide,'none');assert.match(straight.view.classificationText,/未定义.*新增解析延续/);assert.ok(matches('literal-extended-v2',straight.build({...r,foldAngleDeg:180,segments:16})));
 const degenerate=prepare('literal-extended-v2',{...r,foldAngleDeg:0,segments:16});assert.match(degenerate.view.classificationText,/退化/);assert.throws(()=>degenerate.build({...r,foldAngleDeg:0,segments:16}));
});
test('outside original assumptions is not shown as source-invalid or changed-input',()=>{
 const raw={...r,helicityAngleDeg:120,foldAngleDeg:90,leftWidth:.1,rightWidth:.1,segments:16},p=prepare('literal-extended-v2',raw);assert.match(p.view.classificationText,/不满足/);assert.ok(matches('literal-extended-v2',p.build(raw)));assert.deepEqual(p.source.recipe,raw);
});
test('namespace ambiguity/malformed schema is rejected rather than guessed',()=>{
 const d=prepare('principal-v1',{...r,segments:16}).build({...r,segments:16});const other=prepare('literal-extended-v2',{...r,segments:16}).build({...r,segments:16});d.metadata!.originalUniformHelixExtended3951=other.metadata!.originalUniformHelixExtended3951;assert.equal(read(d),null);assert.equal(matches('principal-v1',d),false);assert.equal(matches('literal-extended-v2',d),false);
 const broken=structuredClone(other);(broken.metadata!.originalUniformHelixExtended3951 as any).schema='unknown-v3';assert.equal(read(broken),null);assert.throws(()=>valid('unknown' as Mode,r));
});
test('mode participates in key; width cache and v1/v2 rebuilding retain source identity',()=>{
 const raw={...r,segments:16};assert.notEqual(key('principal-v1',raw),key('literal-extended-v2',raw));assert.equal(key('literal-extended-v2',raw),key('literal-extended-v2',{...raw,rightWidth:.5}));
 for(const mode of ['principal-v1','literal-extended-v2'] as Mode[]){const p=prepare(mode,raw),a=p.build(raw),b=p.build({...raw,rightWidth:.5}),name=mode==='principal-v1'?'originalUniformHelixGeneral3951':'originalUniformHelixExtended3951';assert.equal((a.metadata![name] as any).sourceFrames,(b.metadata![name] as any).sourceFrames);assert.ok(matches(mode,b));assert.throws(()=>p.build({...raw,foldAngleDeg:120}));}
});
test('actual v1/v2 JSON/FOLD reads restore corresponding schema; hand edits regenerate same mode U/null',()=>{
 for(const mode of ['principal-v1','literal-extended-v2'] as Mode[]){const raw={...r,segments:16},d=prepare(mode,raw).build(raw);for(const kind of ['json','fold'] as const){const loaded=importDocument(exportDocument(d,kind).text,kind).doc;assert.equal(read(loaded)!.mode,mode);assert.ok(matches(mode,loaded));}
 const u=d.segments.find(e=>e.assignment==='U')!;u.assignment='M';u.angle=-180;assert.equal(matches(mode,d),false);const restored=read(d)!;const newDoc=prepare(restored.mode,restored.recipe).build(restored.recipe);assert.ok(matches(mode,newDoc));assert.equal(newDoc.segments.filter(e=>e.assignment==='U'&&e.angle===null).length,16);assert.equal(read(newDoc)!.mode,mode);}
});
