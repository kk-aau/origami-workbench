import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const read = file => fs.readFileSync(file, 'utf8');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const all = dir => fs.readdirSync(dir, {recursive:true}).map(file => path.join(dir,file).replaceAll('\\','/')).filter(file => fs.statSync(file).isFile() && !file.includes('__pycache__'));
const run = JSON.parse(read('output/original-three-inputs-full-run-1010.json'));
assert.equal(run.exitCode, 0);
assert.equal(run.inputs.length, 1785);
for (const row of run.inputs) assert.equal(hash(row.file), row.sha256, `Changed tested input: ${row.file}`);
const full = read('output/original-three-inputs-full-test-1010.log');
assert.ok(!/^✖|^FAILED|^ERROR:|^FAIL:/m.test(full));
const passes = [...full.matchAll(/ℹ pass (\d+)/g)].map(match=>Number(match[1]));
assert.deepEqual(passes, [2717,7,63]);
assert.equal(Number(full.match(/Ran (\d+) tests/)?.[1]),1219);
assert.equal(Number(read('output/original-three-inputs-build-1010.log').match(/(\d+) modules transformed/)?.[1]),1002);
const browserPaths = [
 ['output/original-recover-ndsolve-browser-1010/browser-tests.log',45],
 ['output/original-woven-area-browser-1010/browser-tests.log',23],
 ['output/original-woven-area-browser-1010/import-tests-fixed.log',5],
 ['output/original-huffman-circle4-browser-1010/browser-tests.log',20],
];
const browsers = browserPaths.map(([file,expected])=>{
 const match=read(file).match(/^### Result\r?\n(\{[^\r\n]+\})/m);assert.ok(match,file);
 const data=JSON.parse(match[1]);assert.equal(data.passed,expected);if(data.errors)assert.deepEqual(data.errors,[]);
 return {file,passed:data.passed};
});
const recoverReport='output/original-recover-ndsolve-browser-1010/independent-download-evidence.json';
const recover=JSON.parse(read(recoverReport));assert.equal(recover.passed,6);assert.equal(recover.actualFilesRead,18);
const huffmanReport='output/original-huffman-circle4-browser-1010/download-audit.json';
const huffman=JSON.parse(read(huffmanReport));assert.equal(huffman.verified,true);assert.equal(huffman.actualDownloads,6);assert.equal(huffman.downloadChecks,27);
const httpReport='output/original-huffman-circle4-browser-1010/http-audit.json';
assert.equal(JSON.parse(read(httpReport)).passed,4);
const wovenLog='output/original-woven-area-browser-1010/download-audit-fixed.log';
assert.ok(read(wovenLog).includes('actual downloads independently checked: 13'));
assert.ok(read(wovenLog).includes('isolated saved project doc equals actual 32-degree reimport'));
const preservationFile='output/original-three-inputs-preservation-1010.json';
const preservation=JSON.parse(read(preservationFile));
assert.equal(preservation.verified,true);assert.equal(preservation.previousArchiveFilesVerified,2551);assert.equal(preservation.ordinaryAndOptimizedDXFPreserved,true);
const paths=new Set([...all('src'),...all('backend'),...all('tests'),...all('vendor/simulator'),...all('dist'),...all('docs'),
 ...fs.readdirSync('scripts').filter(file=>/original.*1010|curve2.*1010|ndsolve.*1010|ring.*1010|huffman.*1010|woven.*1010/.test(file)).map(file=>'scripts/'+file),
 ...fs.readdirSync('output').filter(file=>/original-.*1010\.(json|log)$/.test(file)).map(file=>'output/'+file),
 ...preservation.integrationReports,'README.md','package.json','package-lock.json','tsconfig.json','vite.config.ts','server.mjs',
 'output/audits/original-extended-function-batch-final-1010.json']);
for(const dir of ['output/original-recover-ndsolve-browser-1010','output/original-woven-area-browser-1010','output/original-huffman-circle4-browser-1010','output/original-three-inputs-server-1010/projects'])for(const file of all(dir))paths.add(file);
const archive='output/audits/original-three-inputs-artifacts-1010';
const manifest='output/audits/original-three-inputs-final-1010.json';
assert.ok(!fs.existsSync(archive)&&!fs.existsSync(manifest));fs.mkdirSync(archive,{recursive:true});
const snapshots=[];
for(const file of [...paths].sort()){
 assert.ok(fs.existsSync(file),file);const target=path.join(archive,file);fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.copyFileSync(file,target,fs.constants.COPYFILE_EXCL);assert.equal(hash(target),hash(file));snapshots.push({file,sha256:hash(file),bytes:fs.statSync(file).size});
}
const result={verified:true,completeOrigamicaGoal:false,verifiedAt:new Date().toISOString(),archive,snapshots,
 tests:{frontend:2717,backend:1219,desktop:7,serverWorker:63,buildModules:1002,mainAppFocused:93},browsers,
 downloadReports:[recoverReport,huffmanReport,httpReport,wovenLog],actualDownloads:37,preservation,
 notVerified:['full Wolfram expression/interpolation/solver/defaults semantics','whole CP, layer and continuous physical parameter domains','portable/native EXE and third-party import/machine; not packaged or published']};
fs.writeFileSync(manifest,JSON.stringify(result,null,2),{flag:'wx'});
console.log(JSON.stringify({frozen:snapshots.length,tests:result.tests,actualDownloads:37,completeOrigamicaGoal:false}));
