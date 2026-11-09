import {test} from 'node:test';
import assert from 'node:assert/strict';
import {layerBatchDocument} from '../../src/app/layerBatchDocument';
import type {LayerBatchResult} from '../../src/app/layerBatch';

const batch=():LayerBatchResult=>({status:'cancelled',message:'用户停止，保留此前结果。',startIndex:3,requested:100,items:[{index:3,svg:'<svg xmlns="http://www.w3.org/2000/svg"><text>第四解</text></svg>'},{index:4,svg:'<svg xmlns="http://www.w3.org/2000/svg"/>'}]});
test('offline collection retains exact SVG bytes and one-based filenames',()=>{
  const input=batch(),before=structuredClone(input),html=layerBatchDocument(input,'折纸');
  assert.match(html,/已取消 · 部分结果/);assert.match(html,/从第 4 解开始，请求 100 个，实际保留 2 个/);
  assert.match(html,/download="candidate-4.svg"/);assert.match(html,/download="candidate-5.svg"/);
  const images=[...html.matchAll(/<img src="data:image\/svg\+xml;charset=utf-8,([^"]+)"/g)];
  assert.deepEqual(images.map(m=>decodeURIComponent(m[1])),input.items.map(i=>i.svg));assert.deepEqual(input,before);
  assert.ok(!html.includes('<script'));assert.match(html,/default-src 'none'/);
});
test('untrusted labels and SVG text cannot inject document markup',()=>{
  const input=batch();input.message='<script>alert(1)</script>';input.items[0].svg='<svg><text>"</img><script>alert(2)</script>&\'</text></svg>';
  const html=layerBatchDocument(input,'</title><img src=x onerror="bad">');
  assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x'));assert.ok(!html.includes('<svg>'));
  assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});
test('empty collections explain stopping and invalid ranges are rejected',()=>{
  const input=batch();input.items=[];input.status='timeout';const html=layerBatchDocument(input,'空');
  assert.match(html,/已超时/);assert.match(html,/尚未完成任何结果图/);assert.ok(!html.includes('<article'));
  for(const patch of [{requested:101},{startIndex:-1},{status:'fake'},{items:[{index:7,svg:''}]}])assert.throws(()=>layerBatchDocument({...batch(),...patch} as LayerBatchResult,'坏'));
});
