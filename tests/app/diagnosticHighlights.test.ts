import {test} from 'node:test';
import assert from 'node:assert/strict';
import {diagnosticHighlights} from '../../src/app/diagnosticHighlights';
import type {DiagnosticResult} from '../../src/core/types';

const result:DiagnosticResult={summary:{errors:3,warnings:1,checkedVertices:2,skippedVertices:0},issues:[
 {id:'first',code:'dangling-edge',severity:'error',message:'悬空线',segmentIds:['a','b'],point:[10,20]},
 {id:'second',code:'odd-degree',severity:'error',message:'奇数顶点',segmentIds:['b','c'],point:[10,20]},
 {id:'point',code:'open-boundary',severity:'error',message:'边界顶点',segmentIds:[],point:[30,40]},
 {id:'warning',code:'duplicate-overlap',severity:'warning',message:'重复线',segmentIds:['w'],point:[50,60]},
]};
test('a fresh check highlights all errors and deduplicates shared geometry',()=>{
 const before=structuredClone(result),highlight=diagnosticHighlights(result,null);
 assert.deepEqual([...highlight.segmentIds],['a','b','c']);assert.deepEqual(highlight.points,[[10,20],[30,40]]);assert.deepEqual(result,before);
});
test('choosing a result isolates its lines and point, including point-only issues',()=>{
 assert.deepEqual([...diagnosticHighlights(result,'second').segmentIds],['b','c']);
 assert.deepEqual(diagnosticHighlights(result,'second').points,[[10,20]]);
 assert.equal(diagnosticHighlights(result,'point').segmentIds.size,0);assert.deepEqual(diagnosticHighlights(result,'point').points,[[30,40]]);
 assert.deepEqual([...diagnosticHighlights(result,'warning').segmentIds],['w']);
});
test('dismissed, stale or missing results show no diagnostic geometry',()=>{
 for(const value of [diagnosticHighlights(null,null),diagnosticHighlights(result,'missing')]){
  assert.equal(value.segmentIds.size,0);assert.deepEqual(value.points,[]);
 }
});
