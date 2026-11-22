import {test} from 'node:test';
import assert from 'node:assert/strict';
import {diagramArtworkScale,diagramScaleChange} from '../../src/app/diagramExportScale';

test('measure the fitted artwork viewport, independent of origin, nested crops and original pixel dimensions',()=>{
  const svg='<svg width="1200" height="900" viewBox="-30 20 50 80"><svg viewBox="0 0 10 10"/></svg>';
  assert.equal(diagramArtworkScale(svg,{width:250,height:160}),2);
  assert.equal(diagramArtworkScale(svg,{width:50,height:300}),1);
  assert.equal(diagramArtworkScale('<svg><svg viewBox="0 0 10 10"/></svg>',{width:50,height:50}),null);
  assert.equal(diagramArtworkScale('<svg viewBox="0 0 50 0"/>',{width:10,height:10}),null);
});

test('user threshold is inclusive and symmetric, and zero ignores equivalent views',()=>{
  assert.equal(diagramScaleChange(1,1.1,25),null);
  assert.equal(diagramScaleChange(4,4.25,6.25),'zoom');
  assert.equal(diagramScaleChange(4.25,4,6.25),'zoomOut');
  assert.equal(diagramScaleChange(2,2,0),null);
  assert.equal(diagramScaleChange(1,1+Number.EPSILON,0),null);
  assert.equal(diagramScaleChange(1,1.000001,0),'zoom');
  assert.equal(diagramScaleChange(1,3,200),'zoom');
});

test('only a visible change in fitted scale produces a cue in either reading direction',()=>{
  assert.equal(diagramScaleChange(null,1),null);
  assert.equal(diagramScaleChange(1,1.099),null);
  assert.equal(diagramScaleChange(1.099,1),null);
  assert.equal(diagramScaleChange(1,1.1),'zoom');
  assert.equal(diagramScaleChange(1.1,1),'zoomOut');
  const box={width:100,height:100};
  // Folding one side inward leaves the height as the limiting dimension.
  const before=diagramArtworkScale('<svg viewBox="0 0 100 100"/>',box);
  const after=diagramArtworkScale('<svg viewBox="25 0 50 100"/>',box);
  assert.equal(diagramScaleChange(before,after),null);
});
