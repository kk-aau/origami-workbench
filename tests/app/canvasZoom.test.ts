import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultCanvasZoom,validateCanvasZoom,wheelZoomFactor,readCanvasZoom,saveCanvasZoom,CANVAS_ZOOM_KEY} from '../../src/app/canvasZoom';
test('precise wheel zoom follows Oriedita exponential scale with normalized browser units',()=>{
 const prefs=defaultCanvasZoom(),factor=wheelZoomFactor(100,0,prefs);
 assert.equal(factor,1.1);assert.equal(wheelZoomFactor(3,1,prefs),factor);assert.equal(wheelZoomFactor(1,2,prefs),factor);
 assert.ok(Math.abs(wheelZoomFactor(50,0,prefs)**2-factor)<1e-12);
 assert.ok(Math.abs(factor*wheelZoomFactor(-100,0,prefs)-1)<1e-12);
 assert.equal(wheelZoomFactor(100,0,{...prefs,zoomSpeed:10}),2);
});
test('horizontal, disabled, invalid, and extreme wheel input are safe',()=>{
 const prefs=defaultCanvasZoom();for(const n of [0,NaN,Infinity,-Infinity])assert.equal(wheelZoomFactor(n,0,prefs),1);
 assert.equal(wheelZoomFactor(100,8,prefs),1);assert.equal(wheelZoomFactor(100,0,{...prefs,zoomSpeed:0}),1);
 for(const n of [Number.MAX_VALUE,-Number.MAX_VALUE])assert.ok(Number.isFinite(wheelZoomFactor(n,0,{...prefs,zoomSpeed:10})));
 assert.equal(wheelZoomFactor(.1,0,{...prefs,preciseZoom:false}),1.1);
});
test('zoom preferences validate, persist separately and recover from unreadable storage',()=>{
 let stored='';saveCanvasZoom({preciseZoom:false,zoomSpeed:2},{setItem:(k,v)=>{assert.equal(k,CANVAS_ZOOM_KEY);stored=v;}});
 assert.deepEqual(readCanvasZoom({getItem:()=>stored}),{preciseZoom:false,zoomSpeed:2});
 for(const s of ['{}','null','bad','{"version":2}'])assert.deepEqual(readCanvasZoom({getItem:()=>s}),defaultCanvasZoom());
 assert.deepEqual(readCanvasZoom({getItem:()=>{throw Error('denied');}}),defaultCanvasZoom());
 for(const value of [null,[],{preciseZoom:1,zoomSpeed:1},...[-1,11,NaN,Infinity,'1'].map(zoomSpeed=>({preciseZoom:true,zoomSpeed}))])assert.throws(()=>validateCanvasZoom(value));
 assert.throws(()=>saveCanvasZoom(defaultCanvasZoom(),{setItem:()=>{throw Error('quota');}}),/quota/);
});
