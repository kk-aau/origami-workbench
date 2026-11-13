import {test} from 'node:test';
import assert from 'node:assert/strict';
import {currentDocumentOwner,documentScopeHeaders,validDocumentOwner} from '../../src/app/documentRequestScope';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
test('computation requests carry only their own stable document identity',()=>{assert.deepEqual(documentScopeHeaders(A),{'X-Zhezhi-Document':A});assert.deepEqual(documentScopeHeaders(B),{'X-Zhezhi-Document':B});assert.deepEqual(documentScopeHeaders(),{});});
test('malformed workspace identifiers cannot become calculation owners',()=>{for(const value of ['',null,undefined,'../another','workspace-main',A.toUpperCase().replace('1111','ABCD'),A.replaceAll('-','')])assert.equal(validDocumentOwner(value),false);assert.equal(validDocumentOwner(A),true);assert.deepEqual(documentScopeHeaders('not-a-document'),{});});
test('legacy hosts without a document URL keep their unscoped API behavior',()=>{const previous=globalThis.window;try{globalThis.window=new EventTarget() as unknown as Window&typeof globalThis;assert.equal(currentDocumentOwner(),undefined);assert.deepEqual(documentScopeHeaders(),{});}finally{globalThis.window=previous;}});
