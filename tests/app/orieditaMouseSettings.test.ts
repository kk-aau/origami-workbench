import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
import {previewOrieditaMouse} from '../../src/app/orieditaMouseSettings';
import {defaultCanvasZoom} from '../../src/app/canvasZoom';
import {defaultCanvasPicking} from '../../src/app/canvasPicking';
import {readOriconfigArchive} from '../../src/app/oriconfigArchive';
test('mouse config exact fields migrate from a real ORICONFIG without mutating inputs',()=>{
 const config={preciseZoom:false,zoomSpeed:2.5,mouseRadius:23,displayPointSpotlight:true,displayPointOffset:true,mouseWheelMovesCreasePattern:false,lineWidth:3};
 const z=defaultCanvasZoom(),p=defaultCanvasPicking(),before=structuredClone({config,z,p});
 const archive=readOriconfigArchive(zipSync({'config.json':strToU8(JSON.stringify(config))}));
 const result=previewOrieditaMouse(archive.config!,z,p);
 assert.deepEqual(result.zoom.settings,{preciseZoom:false,zoomSpeed:2.5});assert.deepEqual(result.picking.settings,{mouseRadius:23,displayPointSpotlight:true,displayPointOffset:true});
 assert.deepEqual(result.ignored,['mouseWheelMovesCreasePattern','lineWidth']);assert.equal(result.zoom.recognized.length,2);assert.equal(result.picking.recognized.length,3);assert.deepEqual({config,z,p},before);
});
test('absent fields preserve current values; inherited fields are not imported',()=>{
 const z={preciseZoom:false,zoomSpeed:3},p={...defaultCanvasPicking(),mouseRadius:26};
 const r=previewOrieditaMouse(Object.assign(Object.create({zoomSpeed:9}),{displayPointOffset:true}),z,p);
 assert.deepEqual(r.zoom.settings,z);assert.deepEqual(r.zoom.recognized,[]);assert.deepEqual(r.picking.settings,{...p,displayPointOffset:true});
});
test('invalid fields block only their category without coercion or partial application',()=>{
 for(const zoomSpeed of [-1,11,NaN,Infinity,'2',null]){const r=previewOrieditaMouse({zoomSpeed,preciseZoom:false,mouseRadius:20},defaultCanvasZoom(),defaultCanvasPicking());assert.equal(r.zoom.settings,null);assert.equal(r.picking.settings?.mouseRadius,20);assert.equal(r.zoom.issues.length,1);}
 for(const mouseRadius of [0,101,NaN,'20',null]){const r=previewOrieditaMouse({mouseRadius,zoomSpeed:2},defaultCanvasZoom(),defaultCanvasPicking());assert.equal(r.picking.settings,null);assert.equal(r.zoom.settings?.zoomSpeed,2);}
 for(const key of ['preciseZoom','displayPointSpotlight','displayPointOffset']){const r=previewOrieditaMouse({[key]:1},defaultCanvasZoom(),defaultCanvasPicking());assert.equal(key==='preciseZoom'?r.zoom.settings:r.picking.settings,null);}
});
