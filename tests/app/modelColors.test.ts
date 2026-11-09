import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultModelColors,validateModelColors} from '../../src/app/modelColors';
import {copyModelView,defaultModelView} from '../../src/app/modelViewState';
import {foldedModelSVG} from '../../src/app/foldedModelSVG';
import {computeFlatFold} from '../../src/core/flatFold';
import {blankDoc} from '../../src/app/state';
test('model RGB palette validates strictly and old views retain defaults',()=>{
 validateModelColors(defaultModelColors());assert.equal(copyModelView(defaultModelView()).colors,undefined);
 for(const bad of [null,{},['red','blue','black'],{front:'red',back:'#112233',line:'#ffffff'},{front:'#112233',back:'#112233',line:'" onload="x'},{...defaultModelColors(),extra:1}])assert.throws(()=>validateModelColors(bad),/RGB/);
 const input={...defaultModelView(),colors:defaultModelColors()},copy=copyModelView(input);copy.colors!.front='#112233';assert.notEqual(copy.colors!.front,input.colors.front);
});
test('model image colors follow material side and never mutate geometry or layer order',()=>{
 const result=computeFlatFold(blankDoc('颜色',100,100)),before=structuredClone(result),colors={front:'#112233',back:'#445566',line:'#778899'};
 const front=foldedModelSVG(result,{name:'颜色',side:'front',colors}),back=foldedModelSVG(result,{name:'颜色',side:'back',colors});
 assert.ok(front.includes('fill="#112233"'));assert.ok(back.includes('fill="#445566"'));
 assert.ok(front.includes('stroke="#778899"'));assert.ok(back.includes('stroke="#778899"'));assert.deepEqual(result,before);
 assert.throws(()=>foldedModelSVG(result,{name:'颜色',side:'front',colors:{...colors,line:'url(x)'}}),/RGB/);
});
