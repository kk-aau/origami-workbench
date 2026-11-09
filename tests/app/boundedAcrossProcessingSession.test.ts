import test from 'node:test';import assert from 'node:assert/strict';
import {boundedAcross2DDocument,BOUNDED_ACROSS_EXAMPLE,boundedAcrossProcessingSettings,rememberBoundedAcrossAuxiliaryChoice} from '../../src/app/boundedAcross2DCP';
test('current authenticated CP keeps explicit A on reopening and name changes, without modifying doc',()=>{
 const d=boundedAcross2DDocument(BOUNDED_ACROSS_EXAMPLE),saved=JSON.stringify(d);
 assert.equal(boundedAcrossProcessingSettings(d).A.enabled,false);assert.equal(rememberBoundedAcrossAuxiliaryChoice(d,true),true);
 assert.equal(boundedAcrossProcessingSettings(d).A.enabled,true);assert.equal(boundedAcrossProcessingSettings({...d,name:'仅改名'}).A.enabled,true);
 assert.equal(JSON.stringify(d),saved);assert.equal(rememberBoundedAcrossAuxiliaryChoice(d,false),true);assert.equal(boundedAcrossProcessingSettings(d).A.enabled,false);
});
test('fresh document or source re-adoption does not carry A choice across equal or changed CPs; generic unchanged',()=>{
 const d=boundedAcross2DDocument(BOUNDED_ACROSS_EXAMPLE);rememberBoundedAcrossAuxiliaryChoice(d,true);
 const another=boundedAcross2DDocument(BOUNDED_ACROSS_EXAMPLE);assert.equal(boundedAcrossProcessingSettings(another).A.enabled,false);
 rememberBoundedAcrossAuxiliaryChoice(another,true);const edited=boundedAcross2DDocument({...BOUNDED_ACROSS_EXAMPLE,parameters:{...BOUNDED_ACROSS_EXAMPLE.parameters,angleSlope:.6}});
 assert.equal(boundedAcrossProcessingSettings(edited).A.enabled,false);
 const generic={...edited,metadata:{}};assert.equal(rememberBoundedAcrossAuxiliaryChoice(generic,false),false);assert.equal(boundedAcrossProcessingSettings(generic).A.enabled,true);
});
test('in-place forged source/geometry cannot reuse a retained choice or write a provenance preference',()=>{
 const d=boundedAcross2DDocument(BOUNDED_ACROSS_EXAMPLE),before=JSON.stringify(d);rememberBoundedAcrossAuxiliaryChoice(d,true);
 (d.metadata!.originalAcross2D as any).evidence.layerOrder=true;assert.equal(rememberBoundedAcrossAuxiliaryChoice(d,false),false);
 assert.equal(boundedAcrossProcessingSettings(d).A.enabled,true);assert.ok(!JSON.stringify(d).includes('explicitAuxiliarySession'));
 const restored=JSON.parse(before);assert.equal(boundedAcrossProcessingSettings(restored).A.enabled,false);
});
test('same segment array with a new authenticated CP content resets the prior explicit choice',()=>{
 const d=boundedAcross2DDocument(BOUNDED_ACROSS_EXAMPLE);rememberBoundedAcrossAuxiliaryChoice(d,true);
 const replacement=boundedAcross2DDocument({...BOUNDED_ACROSS_EXAMPLE,parameters:{...BOUNDED_ACROSS_EXAMPLE.parameters,rightWidth:.19}});
 d.segments.splice(0,d.segments.length,...replacement.segments);d.paper=replacement.paper;d.metadata=replacement.metadata;
 assert.equal(boundedAcrossProcessingSettings(d).A.enabled,false);
});
