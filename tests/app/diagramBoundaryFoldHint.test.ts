import {test} from 'node:test';
import assert from 'node:assert/strict';
import {boundaryFoldInk,diagramBoundaryFoldOffsets,type DiagramBoundaryInk} from '../../src/app/diagramBoundaryOverlay';
import type {DiagramFoldPreviewSegment} from '../../src/app/diagramFoldLinkTypes';

const visiblePaper='<polygon points="0,0 8,0 8,8 0,8"/>';
const outline:DiagramBoundaryInk={
  markup:'',byFace:new Map([[7,[{a:[0,0],b:[8,0],inward:[0,1]}]]]),visiblePaper:()=>visiblePaper,
};
const valley:DiagramFoldPreviewSegment={face:7,assignment:'V',a:[-4,0],b:[6,0],visibility:'visible'};
const dash='<line stroke-dasharray="4 2"/>';

test('shifts the complete ink once when only part lies on a boundary at every drawing scale',()=>{
  const offsets=diagramBoundaryFoldOffsets(outline,[valley]);assert.equal(offsets.size,1);
  for(const units of [0.5,1,2]){
    const svg=boundaryFoldInk(dash,units,offsets.get(0));
    assert.ok(svg.includes(visiblePaper));
    assert.ok(svg.includes(`transform="translate(0 ${2.6*units})">${dash}`));
    assert.equal(svg.split(dash).length-1,1);assert(!svg.includes('-band'));
  }
});

test('only an active visible fold along the material edge receives an inset',()=>{
  for(const change of [
    {visibility:'hidden'}, {visibility:'unknown'}, {face:8}, {existing:true},
    {assignment:'U'}, {a:[0,1],b:[6,1]}, {a:[-6,0],b:[0,0]}, {a:[2,-1],b:[2,4]},
  ] satisfies Partial<DiagramFoldPreviewSegment>[]){
    const offsets=diagramBoundaryFoldOffsets(outline,[{...valley,...change}]);assert.equal(offsets.size,0);
    assert.equal(boundaryFoldInk(dash,1,offsets.get(0)),dash);
  }
  assert.equal(diagramBoundaryFoldOffsets(outline,[{...valley,strokePattern:'solid'}]).size,0);
});

test('split and reversed endpoints share one continuous offset across the midpoint',()=>{
  const boundary:DiagramBoundaryInk={...outline,byFace:new Map([[7,[{a:[0,0],b:[4,0],inward:[0,1]}]]])};
  const parts:DiagramFoldPreviewSegment[]=[{...valley,a:[0,0],b:[4,0],strokeSpan:{length:8,offset:0}},
    {...valley,face:8,a:[8,0],b:[4,0],strokeSpan:{length:8,offset:4}}];
  const saved=structuredClone(parts),offsets=diagramBoundaryFoldOffsets(boundary,parts);
  assert.equal(offsets.size,2);assert.equal(offsets.get(0),offsets.get(1));assert.deepEqual(offsets.get(0)!.normal,[0,1]);
  assert.deepEqual(parts,saved);
});

test('gaps, bends, and different fold styles do not inherit another crease offset',()=>{
  const parts:DiagramFoldPreviewSegment[]=[{...valley,a:[0,0],b:[4,0]},
    {...valley,a:[9,0],b:[12,0]}, {...valley,a:[4,0],b:[4,6]}, {...valley,assignment:'M',a:[8,0],b:[12,0]}];
  assert.deepEqual([...diagramBoundaryFoldOffsets(outline,parts).keys()],[0]);
});

