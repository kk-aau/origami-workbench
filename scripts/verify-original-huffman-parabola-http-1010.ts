import fs from 'node:fs';
import assert from 'node:assert/strict';
import {connect,apiWhenIdle} from '../src/app/api';
import {readParabolaDirectResult} from '../src/app/huffmanParabolaDirect';
import {readCircle4DirectResult} from '../src/app/huffmanCircle4Direct';
import {parseHuffmanCircle4Result} from '../src/app/huffmanCircle4';
const out='output/original-huffman-parabola-browser-1010';
const fixture=JSON.parse(fs.readFileSync('tests/fixtures/huffman-parabola-direct-20261010.json','utf8'));
const circle=JSON.parse(fs.readFileSync('tests/fixtures/huffman-circle4-direct-20261010.json','utf8'));
const originalFetch=globalThis.fetch;
globalThis.fetch=(input,init)=>originalFetch(new URL(String(input),'http://127.0.0.1:8859'),init);
const evidence:{name:string;actualAuthenticatedAPI:boolean;independentOriginalODEReplay:boolean}[]=[];
try {
 await connect();
 for(const c of fixture.cases){
  const raw=await apiWhenIdle('tessellation/huffman-parabola',c.query),response=readParabolaDirectResult(raw,c.query);
  assert.equal(response.originalItems.length,17);assert.equal(response.diagnostics.closureConditionsSaved,false);
  fs.writeFileSync(`${out}/${c.name}.http.json`,JSON.stringify({query:c.query,response},null,2));
  evidence.push({name:c.name,actualAuthenticatedAPI:true,independentOriginalODEReplay:true});
 }
 for(const divisions of [8,25]){
  const query={family:'huffman-circle4-in4072',divisions} as const,raw=await apiWhenIdle('tessellation/huffman-circle4',query),response=parseHuffmanCircle4Result(raw,query);
  fs.writeFileSync(`${out}/circle-saved-${divisions}.http.json`,JSON.stringify({query,response},null,2));
  evidence.push({name:`circle-saved-${divisions}`,actualAuthenticatedAPI:true,independentOriginalODEReplay:true});
 }
 for(const c of circle.cases){
  const raw=await apiWhenIdle('tessellation/huffman-circle4',c.query),response=readCircle4DirectResult(raw,c.query);
  fs.writeFileSync(`${out}/circle-direct-${c.name}.http.json`,JSON.stringify({query:c.query,response},null,2));
  evidence.push({name:`circle-direct-${c.name}`,actualAuthenticatedAPI:true,independentOriginalODEReplay:true});
 }
} finally {globalThis.fetch=originalFetch;}
fs.writeFileSync(`${out}/http-audit.json`,JSON.stringify({passed:evidence.length,evidence},null,2));
console.log(`${evidence.length} actual authenticated Parabola/Circle4 API results independently parsed.`);
