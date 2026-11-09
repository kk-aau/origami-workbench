import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getToolPurpose, TOOL_GUIDES, type Tool} from '../../src/app/tools';

test('high-concept tools explain their geometric purpose',()=>{
  assert.match(getToolPurpose('axiom5'),/折纸公理 5/);
  assert.match(getToolPurpose('perpendicular'),/90/);
  assert.match(getToolPurpose('mirrorselection'),/反射/);
});

test('every tool has a non-empty purpose for the guide UI',()=>{
  for(const tool of Object.keys(TOOL_GUIDES) as Tool[])assert.ok(getToolPurpose(tool).trim().length>0,tool);
});
