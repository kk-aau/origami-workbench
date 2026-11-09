import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=path.resolve(root,process.argv[2]||'');
assert(directory.startsWith(path.join(root,'output')+path.sep),'Verify a candidate directory under output/');
const manifest=JSON.parse(fs.readFileSync(path.join(directory,'payload-manifest.json'),'utf8'));
const table=Array.from({length:256},(_,n)=>{for(let j=0;j<8;j++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const crc32=bytes=>{let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const signature=Buffer.from([0x37,0x7a,0xbc,0xaf,0x27,0x1c]);
const report={label:manifest.label,archiveSha256:manifest.archive.sha256,archiveBytes:manifest.archive.bytes,solid:true,dictionaryBytes:64*1024*1024,artifacts:[]};
for(const artifact of manifest.artifacts){
  const bytes=fs.readFileSync(path.join(directory,artifact.path));
  assert.equal(sha(bytes),artifact.sha256,'Installer changed after build manifest');
  const valid=[];
  for(let offset=bytes.indexOf(signature);offset>=0;offset=bytes.indexOf(signature,offset+1)){
    if(offset+32>bytes.length)continue;
    if(crc32(bytes.subarray(offset+12,offset+32))!==bytes.readUInt32LE(offset+8))continue;
    const relative=bytes.readBigUInt64LE(offset+12),size=bytes.readBigUInt64LE(offset+20);
    if(relative>BigInt(bytes.length)||size>BigInt(bytes.length))continue;
    const next=offset+32+Number(relative),end=next+Number(size);
    if(end>bytes.length)continue;
    if(crc32(bytes.subarray(next,end))!==bytes.readUInt32LE(offset+28))continue;
    const archive=bytes.subarray(offset,end);
    if(sha(archive)!==manifest.archive.sha256)continue;
    assert.equal(archive.length,manifest.archive.bytes);
    valid.push({offset,bytes:archive.length,startHeaderCrcVerified:true,nextHeaderCrcVerified:true,sha256:sha(archive)});
  }
  assert.equal(valid.length,1,'Exactly one correctly bounded, CRC-checked payload must match the source archive');
  report.artifacts.push({file:artifact.path,exeBytes:bytes.length,payload:valid[0]});
}
const list=fs.readFileSync(path.join(directory,'payload-7z-list.txt'),'utf8');
assert(list.includes('Solid = +')&&list.includes('LZMA2:26'),'Measured 7z properties must match specification');
fs.writeFileSync(path.join(directory,'embedded-payload-verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
