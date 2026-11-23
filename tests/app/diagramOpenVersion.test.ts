import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import path from 'node:path';
import {diagramOpenVersion} from '../../scripts/diagram-open-version.mjs';

test('cache version follows transitive vendor and nested Worker inputs without UI-only changes',()=>{
  mkdirSync('.runtime',{recursive:true});const root=mkdtempSync(path.resolve('.runtime/open-version-'));
  const put=(file:string,body:string)=>{const full=path.join(root,file);mkdirSync(path.dirname(full),{recursive:true});writeFileSync(full,body);};
  try{
    put('src/import.ts',"import '../vendor/solver.js'; new Worker(new URL('./nested.ts',import.meta.url));");
    put('vendor/solver.ts','export const algorithm=1;');put('src/nested.ts','export const algorithm=1;');
    put('src/ui.ts','export const label=1;');put('package-lock.json','{}');
    const version=()=>diagramOpenVersion(root,['src/import.ts']).version;
    const first=version();put('src/ui.ts','export const label=2;');assert.equal(version(),first);
    put('vendor/solver.ts','export const algorithm=2;');const second=version();assert.notEqual(second,first);
    put('src/nested.ts','export const algorithm=2;');const third=version();assert.notEqual(third,second);
    put('package-lock.json','{"changed":true}');assert.notEqual(version(),third);
  }finally{rmSync(root,{recursive:true,force:true});}
});
