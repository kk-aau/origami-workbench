from pathlib import Path
import hashlib
import json

root=Path.cwd()
base=root/'output/parallel/original-woven-cell-hole-area-1010'
out=root/'output/original-woven-cell-hole-browser-1010'
out.mkdir(exist_ok=True)
directory=str(out.resolve()).replace('\\','/')
text=(base/'verify.browser.js').read_text(encoding='utf8').replace('evidence/',directory+'/')
text=text.replace("for(const f of ['json','fold'])await exported(`browser-${kind}-cp`,f)","for(const f of ['json','fold','dxf'])await exported(`browser-${kind}-cp`,f)")
assert "['json','fold','dxf']" in text
(root/'scripts/verify-original-woven-cell-hole-1010.browser.js').write_text(text,encoding='utf8')
text=(base/'verify-downloads.ts').read_text(encoding='utf8').replace("'./src/","'../src/")
text=text.replace('evidence/','output/original-woven-cell-hole-browser-1010/').replace('data/projects/','output/original-parameter-construct-server-1010/projects/')
text="import {DXF_LAYERS} from '../src/core/dxf';\n"+text
needle=" const reimport=importDocument"
extra="""
 const wantedCP=wovenCPDocument(r,p),tokens=fs.readFileSync(`output/original-woven-cell-hole-browser-1010/browser-${kind}-cp.dxf`,'utf8').trim().split(/\\r?\\n/),lines:Map<number,string>[]=[];
 let line:Map<number,string>|null=null;
 for(let i=0;i<tokens.length;i+=2){const code=Number(tokens[i]),value=tokens[i+1];if(code===0){line=value==='LINE'?new Map():null;if(line)lines.push(line);}else line?.set(code,value);}
 assert.equal(lines.length,wantedCP.segments.length);
 lines.forEach((l,i)=>{const s=wantedCP.segments[i];assert.equal(l.get(8),DXF_LAYERS[s.assignment].name);assert.deepEqual([Number(l.get(10)),Number(l.get(20))],[s.a[0],-s.a[1]].map(x=>x||0));assert.deepEqual([Number(l.get(11)),Number(l.get(21))],[s.b[0],-s.b[1]].map(x=>x||0));});downloads++;
 console.log(kind,'actual normal DXF LINE count/coordinates/layers exact; each original CP edge once',lines.length);
"""
assert text.count(needle)==1
text=text.replace(needle,extra+needle)
text+="\nfs.writeFileSync('output/original-woven-cell-hole-browser-1010/download-audit.json',JSON.stringify({verified:true,actualDownloads:downloads,CPVoidEmpty:true,CPAndFFCoordinatesExact:true,reopenedLayersSolved:true,isolatedSavedDocumentsExact:true,normalDXFGeometryAndCountsExact:true},null,2));\n"
(root/'scripts/verify-original-woven-cell-hole-download-1010.ts').write_text(text,encoding='utf8')
core={
 'backend/tessellation_woven.py':'a54c4a4ce01d65d1be74879412d905aa10d9b366fa2d0b4051f5172828763f69',
 'backend/tessellation_woven_area_topology.py':'864c5f204feb8b54ab956e2168afcd7d74f2a684171eee196a4fa5feef1bc3b7',
 'src/app/wovenAreaTopology.ts':'d86bcf61191c2192c3b9a0a11b735b36d5d5810119e8025cf91f5c0bd25ed908',
 'src/app/wovenCutTopology.ts':'3b0483bbdef71d7688932c707376a7f03f2379b732f65c257375e857391a5d6b',
}
for file,sha in core.items():assert hashlib.sha256((root/file).read_bytes()).hexdigest()==sha
review={'verified':True,'kind':'manual-source-contract-review-and-final-hash-verification','coreHashes':core,'reviewed':['unchanged 32-epsilon translated outward area arithmetic','only previously attempted raw negative probes are recorded; no new source coordinates','each void and retained face has a strict positive interval','original hole order/corner-source binding and actual edge coverage independently rechecked','Euler uses actual validated component count minus source hole count','all original closure/objective constraints, shared budget and final CP gates retained'],'scope':'existing explicit cell-hole workbench extension, not an original missing function','ordinaryAndOptimizedDXFCoreUnchanged':True}
(root/'output/original-woven-cell-hole-root-review-1010.json').write_text(json.dumps(review,ensure_ascii=False,indent=2),encoding='utf8')
print('Prepared actual main UI and 18-download audit; copied no producer results. Reviewed four final core hashes.')
