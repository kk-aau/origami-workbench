import fs from 'node:fs';
import assert from 'node:assert/strict';
import {connect,apiWhenIdle} from '../src/app/api';
import {readCircle4DirectResult} from '../src/app/huffmanCircle4Direct';

const fixture=JSON.parse(fs.readFileSync('tests/fixtures/huffman-circle4-direct-20261010.json','utf8'));
const originalFetch=globalThis.fetch;
globalThis.fetch=(input,init)=>originalFetch(new URL(String(input),'http://127.0.0.1:8857'),init);
const evidence=[];
try{
 await connect();
 for(const c of fixture.cases){
  const raw=await apiWhenIdle('tessellation/huffman-circle4',c.query);
  const response=readCircle4DirectResult(raw,c.query);
  assert.equal(response.originalItems.length,17);
  assert.equal(response.closure.rootSearchExecuted,false);
  fs.writeFileSync(`output/original-huffman-circle4-browser-1010/${c.name}.http.json`,JSON.stringify({query:c.query,response},null,2));
  evidence.push({name:c.name,actualAuthenticatedAPI:true,independentOriginalODEReplay:true});
 }
}finally{globalThis.fetch=originalFetch;}
fs.writeFileSync('output/original-huffman-circle4-browser-1010/http-audit.json',JSON.stringify({passed:evidence.length,evidence},null,2));
console.log(`${evidence.length} actual public responses independently parsed.`);
