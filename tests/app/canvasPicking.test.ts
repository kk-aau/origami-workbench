import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultCanvasPicking,validateCanvasPicking,pickingWorldRadius,readCanvasPicking,saveCanvasPicking,CANVAS_PICKING_KEY} from '../../src/app/canvasPicking';
import {buildSnapPoints,nearestSnapPoint} from '../../src/app/snapPoints';
import {pickEraseSegment} from '../../src/app/erase';
import type {Doc} from '../../src/core/types';
test('picking radius is screen invariant and shared by snapping and line deletion',()=>{
 const doc:Doc={name:'radius',paper:{width:200,height:200},segments:[{id:'a',a:[20,50],b:[180,50],assignment:'M',angle:-180}]};
 const points=buildSnapPoints(doc);
 for(const units of [.1,1,10])for(const radius of [2,10,100]){
 const prefs={...defaultCanvasPicking(),mouseRadius:radius},r=pickingWorldRadius(prefs,units);
 assert.equal(r/units,radius);
 assert.equal(nearestSnapPoint(points,[20,50+r*.99],r)?.segmentIds[0],'a');
 assert.equal(nearestSnapPoint(points,[20,50+r*1.01],r),null);
 assert.equal(pickEraseSegment(doc,[100,50+r*.99],r,false),'a');
 assert.equal(pickEraseSegment(doc,[100,50+r*1.01],r,false),undefined);
 }
});
test('picking preferences preserve independent values and validate storage',()=>{
 let raw='';const value={mouseRadius:24,displayPointSpotlight:true,displayPointOffset:false};
 saveCanvasPicking(value,{setItem:(k,v)=>{assert.equal(k,CANVAS_PICKING_KEY);raw=v;}});assert.deepEqual(readCanvasPicking({getItem:()=>raw}),value);
 for(const s of ['null','bad','{"version":2}','{}'])assert.deepEqual(readCanvasPicking({getItem:()=>s}),defaultCanvasPicking());
 for(const n of [1,101,Infinity,NaN,'10'])assert.throws(()=>validateCanvasPicking({...value,mouseRadius:n}));
 assert.throws(()=>validateCanvasPicking({...value,displayPointOffset:1}));
 for(const n of [0,-1,NaN,Infinity])assert.throws(()=>pickingWorldRadius(value,n));
 assert.throws(()=>saveCanvasPicking(value,{setItem:()=>{throw Error('quota');}}),/quota/);
 assert.deepEqual(readCanvasPicking({getItem:()=>{throw Error('denied');}}),defaultCanvasPicking());
});
