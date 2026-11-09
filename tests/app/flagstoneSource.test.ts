import {test} from 'node:test';
import assert from 'node:assert/strict';
import {changeTessParams,readTessParams,tessPreset} from '../../src/app/tessellation';

test('flagstone source preserves original parameters and rejects recursive constructions',()=>{
 const mother={...tessPreset('periodic'),pruneBoundary:[[.2,.2],[1.8,.2],[1.8,1.8],[.2,1.8]]};
 const p=readTessParams({...tessPreset('flagstone'),motherParams:mother})!;
 assert.ok(p);assert.deepEqual(readTessParams(JSON.parse(JSON.stringify(changeTessParams(p,{width:.3})))),{...p,width:.3});
 const dualTargets:[[number,number],[number,number]]=[[0,0],[1,1]];
 assert.deepEqual(changeTessParams({...p,dualTargets} as typeof p,{width:.3}),{...p,dualTargets,width:.3});
 assert.equal(readTessParams({...p,motherParams:{family:'flagstone',motherParams:mother}}),null);
 assert.equal(readTessParams({...p,motherParams:tessPreset('twist')}),null);
 assert.equal(readTessParams({...p,aspect:2}),null);
});

test('original flagstone shrinkage and assignment are explicit, persistent and preserve dual edits',()=>{
 const p={...tessPreset('flagstone'),shrinkage:.65,junctionAssignment:'original',dualTargets:[[0,0],[1,1]]} as const;
 const restored=readTessParams(JSON.parse(JSON.stringify(p)))!;assert.ok(restored);
 assert.deepEqual(changeTessParams(restored,{shrinkage:.7}),{...p,shrinkage:.7});
 assert.deepEqual(changeTessParams(restored,{junctionAssignment:'tuck'}),{...p,junctionAssignment:'tuck'});
 for(const patch of [{shrinkage:0},{shrinkage:1},{shrinkage:NaN},{junctionAssignment:'bad'}])assert.equal(readTessParams({...p,...patch}),null);
});

test('new flagstone presets use original assignment while old saved parameters retain tuck',()=>{
 const preset=tessPreset('flagstone');
 assert.equal(preset.junctionAssignment,'original');
 assert.equal(readTessParams(JSON.parse(JSON.stringify(preset)))?.junctionAssignment,'original');
 const {junctionAssignment:_oldField,...oldSaved}=preset;
 assert.equal(readTessParams(oldSaved)?.junctionAssignment,'tuck');
});
