import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import ts from 'typescript';

/** Conservative transitive source fingerprint, including local vendor code and
 * nested Workers. UI chunks/release labels are outside this dependency graph. */
export function diagramOpenVersion(root=process.cwd(),entries=['src/workers/diagramProjectImport.worker.ts']){
  const seen=new Set(),pending=entries.map(file=>path.resolve(root,file));
  while(pending.length){
    const file=pending.pop();if(seen.has(file))continue;seen.add(file);
    const text=readFileSync(file,'utf8');
    const imports=ts.preProcessFile(text,true,true).importedFiles.map(item=>item.fileName);
    for(const match of text.matchAll(/new\s+URL\(\s*['"]([^'"]+)['"]/g))imports.push(match[1]);
    for(const name of imports){
      if(!name.startsWith('.'))continue;
      const base=path.resolve(path.dirname(file),name);
      const target=[base,...(/\.js$/.test(base)?[base.slice(0,-3)+'.ts',base.slice(0,-3)+'.tsx']:[]),...['.ts','.tsx','.d.ts','.js','.mjs','.json','/index.ts','/index.tsx','/index.js'].map(ext=>base+ext)].find(candidate=>existsSync(candidate)&&/\.(?:[cm]?[jt]sx?|json)$/.test(candidate));
      if(!target){if(/\.(?:css|svg|png|jpg|wasm)$/.test(name)){if(existsSync(base))seen.add(base);continue;}throw Error('Unresolved diagram cache dependency: '+file+' -> '+name);}
      if(target.endsWith('.json'))seen.add(target);else pending.push(target);
    }
  }
  for(const file of ['package-lock.json','vite.config.ts','scripts/diagram-open-version.mjs']){const full=path.resolve(root,file);if(existsSync(full))seen.add(full);}
  const files=[...seen].sort(),hash=createHash('sha256');
  for(const file of files){hash.update(path.relative(root,file).replaceAll('\\','/'));hash.update('\0');hash.update(readFileSync(file));hash.update('\0');}
  return {version:hash.digest('hex'),files:files.map(file=>path.relative(root,file).replaceAll('\\','/'))};
}
