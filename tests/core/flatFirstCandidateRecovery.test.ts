import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from '../fixtures/layerCompletionFirstCandidate1123.json';
import {computeFlatFold,recomputeFlatLayers,computeFlatGeometry} from '../../src/core/flatFold';
import {buildDiagramFold,epsilonFor,polygonArea} from '../../src/core/geometry';
import {flatExactProof} from '../../src/app/flatExactProof';
import {alignDiagramFoldResult} from '../../src/app/diagramFoldLink';
import {exportModelSnapshot,importModelSnapshot} from '../../src/core/modelSnapshot';
import {relativeLayerConstraintsMatch} from '../../src/core/relativeLayerConstraints';
import type {Doc} from '../../src/core/types';
import type {DiagramFoldAnchor} from '../../src/app/diagramFoldLinkTypes';

const doc=fixture.doc as Doc,options={flatCreases:'marks' as const,startingFace:fixture.startingFace,solutionIndex:0};

test('an unpublishable first mark-mode candidate recovers a fully certified solution on unchanged geometry',()=>{
 const saved=structuredClone(doc),expected=computeFlatGeometry(buildDiagramFold(doc).graph,epsilonFor(doc),options),result=computeFlatFold(doc,undefined,options);
 assert.equal(result.layers.status,'solved',result.layers.message);
 assert.ok(flatExactProof(result));assert.deepEqual(result.geometry.vertices,expected.geometry.vertices);assert.deepEqual(result.geometry.faces,expected.geometry.faces);
 assert.equal(result.layers.solutionCount,undefined);assert.equal(result.layers.solutionCountExact,undefined);assert.equal(result.layers.solutionIndex,undefined);
 assert.match(result.layers.message,/候选/);assert.deepEqual(doc,saved);
 const aligned=alignDiagramFoldResult(doc,result,fixture.anchor as DiagramFoldAnchor),copy=structuredClone(aligned.geometry);
 const restored=recomputeFlatLayers(JSON.parse(JSON.stringify(aligned)),{solutionIndex:0});
 assert.equal(restored.layers.status,'solved',restored.layers.message);assert.ok(flatExactProof(restored));assert.deepEqual(restored.geometry,JSON.parse(JSON.stringify(copy)));
 const reopened=importModelSnapshot(exportModelSnapshot(doc,aligned)).result;
 assert.equal(reopened.geometry.sourceEpsilon,epsilonFor(doc));
 const again=recomputeFlatLayers(reopened,{solutionIndex:0});assert.equal(again.layers.status,'solved',again.layers.message);assert.ok(flatExactProof(again));assert.deepEqual(again.geometry,reopened.geometry);
 assert.throws(()=>exportModelSnapshot(doc,{...aligned,geometry:{...aligned.geometry,sourceEpsilon:.1}}),/精度/);
 const row=result.layers.faceOrders!.find(([a,b])=>a===0&&b===147)!;
 const normal=Math.sign(polygonArea(aligned.geometry.faces[147].map(v=>aligned.geometry.vertices[v])));
 const relation=row[2]*normal>0?{above:0,below:147}:{above:147,below:0};
 const pinned=recomputeFlatLayers(aligned,{solutionIndex:0,relativeConstraints:[relation]});
 assert.equal(pinned.layers.status,'solved',pinned.layers.message);assert.ok(relativeLayerConstraintsMatch(pinned.geometry.vertices,pinned.geometry.faces,pinned.layers.faceOrders!,[relation]));assert.deepEqual(pinned.geometry,copy);
 const invalid=recomputeFlatLayers(aligned,{solutionIndex:0,relativeConstraints:[relation,{above:relation.below,below:relation.above}]});
 assert.notEqual(invalid.layers.status,'solved');assert.deepEqual(invalid.geometry,copy);
 const soft=recomputeFlatLayers(aligned,{solutionIndex:0,layerPreferences:[relation,{above:relation.below,below:relation.above}]});
 assert.equal(soft.layers.status,'solved',soft.layers.message);assert.ok(soft.warnings.some(w=>w.startsWith('[纸层继承]')&&w.includes('不能同时保留')));
});

test('recovery does not replace an explicitly numbered later candidate or a paper-layer adjustment',()=>{
 const first=computeFlatFold(doc,undefined,options);
 const numbered=computeFlatFold(doc,undefined,{...options,solutionIndex:1});
 if(numbered.layers.status==='solved')assert.equal(numbered.layers.solutionIndex,1);
 const adjustment=recomputeFlatLayers(first,{solutionIndex:0,layerAdjustment:{face:0,direction:'up',side:'front'}});
 assert.doesNotMatch(adjustment.layers.message,/首个候选未通过/);
});
