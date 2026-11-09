import {test} from 'node:test';
import assert from 'node:assert/strict';
import ear from 'rabbit-ear';
import {blankDoc} from '../../src/app/state';
import {buildFold,epsilonFor,polygonArea} from '../../src/core/geometry';
import {computeFlatGeometry,recomputeFlatLayers} from '../../src/core/flatFold';
import {flatLayerEdges} from '../../src/core/flatLayerOrder';
import {flatExactProof} from '../../src/app/flatExactProof';
import {flatFoldPublication} from '../../src/app/flatFoldPublication';

function model(){
  const doc=blankDoc('展开标记层序复核',100,100);
  doc.segments.push({id:'hinge',a:[50,0],b:[50,100],assignment:'M',angle:-180});
  return computeFlatGeometry(buildFold(doc,{flatCreases:'marks'}).graph,epsilonFor(doc));
}
function rejectedLegacy(run:()=>void){
  const original=ear.layer;
  const rejected=Object.assign(()=>{throw Error('no solution possible');},original);
  (ear as any).layer=rejected;
  try{run();}finally{(ear as any).layer=original;}
}

test('a rejected mark-mode contact model is published only after full original-face certification',()=>{
  const input=model(),before=structuredClone(input);
  rejectedLegacy(()=>{
    const out=recomputeFlatLayers(input,{solutionIndex:0});
    assert.equal(out.layers.status,'solved');assert.deepEqual(out.geometry,input.geometry);
    const proof=flatExactProof(out);assert.ok(proof);
    assert.equal(proof.certificate.verifiedCells,proof.topology.cellCount);
    const publication=flatFoldPublication(out);
    assert.equal(publication.result.layers.status,'solved');assert.ok(publication.surface);
    assert.deepEqual(input,before);
  });
});

test('triangulated recovery preserves hard layer relations and refuses an opposite hinge order',()=>{
  const input=model(),valid=recomputeFlatLayers(input,{solutionIndex:0});assert.equal(valid.layers.status,'solved');
  const normals=input.geometry.faces.map(face=>Math.sign(polygonArea(face.map(v=>input.geometry.vertices[v]))));
  const [below,above]=flatLayerEdges(valid.layers.faceOrders!,normals)[0];
  rejectedLegacy(()=>{
    const legal=recomputeFlatLayers(input,{solutionIndex:0,relativeConstraints:[{below,above}]});
    assert.equal(legal.layers.status,'solved');assert.deepEqual(legal.layers.relativeConstraints,[{below,above}]);
    const conflict=recomputeFlatLayers(input,{solutionIndex:0,relativeConstraints:[{below:above,above:below}]});
    assert.equal(conflict.layers.status,'no-solution');assert.equal(flatExactProof(conflict),undefined);
    const numbered=recomputeFlatLayers(input,{solutionIndex:1});
    assert.equal(numbered.layers.status,'unsupported','must not replace a requested nonzero candidate with an unnumbered one');
    assert.equal(flatExactProof(numbered),undefined);
  });
});
