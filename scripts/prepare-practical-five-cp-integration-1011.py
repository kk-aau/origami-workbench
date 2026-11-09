from pathlib import Path
import json,hashlib,shutil,difflib
root=Path.cwd().resolve();sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();read=lambda p:json.loads(Path(p).read_text(encoding='utf-8-sig'));folder=root/'output/parallel/practical-five-cp-root-delivery-1011';assert not folder.exists()
base=read(root/'output/space-menu-checks-002-1011.json');assert base['exitCode']==0 and base['inputsUnchanged'];expected={r['file']:r['sha256'] for r in base['inputs']}
for name,h in expected.items():assert sha(root/name)==h,name
indexes=[]
def frozen(name,digest):
 p=root/name;assert sha(p)==digest,name;d=read(p);indexes.append({'path':name,'sha256':digest})
 for row in d.get('files',d.get('listedFiles',[])):assert sha(p.parent/row['path'])==row['sha256'],row['path']
 if isinstance(d.get('manifest'),dict):assert sha(p.parent/d['manifest']['path'])==d['manifest']['sha256']
 for row in d.get('externalRefs',[]):assert sha(Path(row['path']))==row['sha256'],row['path']
 return d
frozen('output/parallel/huffman-finite-cp-1011/freeze.json','cbfc0a4046f940148dd96ad288c822353e1a9e1a81180b1604d666eefdd491c2')
frozen('output/parallel/huffman-paired-finite-cp-1011/freeze.json','746a0533f060ec2d8cc6105cf4e6188163cb598aae2567428ac814d812fccae3')
frozen('output/parallel/huffman-paired-material-source-1011/PAIR-SOURCE-FROZEN.json','3c2450851e8d2b9bb89cb6dbc3ef312eff67bb76c2fa44c550f68881fd6dbd9e')
for name,digest in [('DELIVERY-FROZEN.json','e09279b51f8370dd6e9b797d74870ed6b4e5cddbccaf807ddda70743eea27539'),('SOURCE-FROZEN.json','5f0ba3d649278f4a83fb97741a9ac8b360c267e98c05ab0e0cd9dea58f7924e7'),('SUPPORT-FROZEN.json','919873f120daf1f6d37c3764af7de50ee9a7c1892b2ea322298200f9767d6ddf')]:frozen('output/parallel/ellipse-across-finite-cp-1011/'+name,digest)
frozen('output/parallel/alt-mosely-finite-cp-1011/DELIVERY-FROZEN.json','eeec14855ee67756b4a1fa9240caff488e95dae2bafcdb150c555664e78d07c3')
frozen('output/parallel/alt-mosely-finite-cp-1011/SUPPORT-FROZEN.json','1d98eb6e585f5a80599211150e38495bf1ea725fa327c97fefeb2cb4c6a9ccfd')
rows=[]
def new(name,p,digest):
 assert not (root/name).exists(),name;assert sha(p)==digest,name;rows.append({'target':name,'sourceOriginal':str(p),'baselineSha256':None,'sha256':digest,'kind':'new independent frozen target'})
single=read(root/'output/parallel/huffman-finite-cp-1011/delivery.json');singleRows={r['path']:r for r in single['targets']}
for row in read(root/'output/parallel/huffman-paired-finite-cp-1011/delivery.json')['targets']:
 assert row['baselineSHA256']==singleRows[row['path']]['finalSHA256'];new(row['path'],Path(row['candidatePath']),row['finalSHA256'])
ep=root/'output/parallel/ellipse-across-finite-cp-1011';em=ep/'delivery-003/manifest.json';assert sha(em)=='19c8fdad5f8a792fcab50f79ad365e94e4c812d1295f4736d457969e99e5a8e8'
for row in read(em)['targets']:assert row['beforeSha256'] is None;new(row['path'],ep/row['after'],row['sha256'])
ap=root/'output/parallel/alt-mosely-finite-cp-1011/delivery-002';am=ap/'manifest.json';assert sha(am)=='1eeb4102bf4d86738abc69b4b603332ad3d75335198facce099e9464064302b6'
for row in read(am)['targets']:assert row['beforeSHA256'] is None;new(row['target'],ap/row['after'],row['afterSHA256'])
for row in read(root/'output/parallel/huffman-main-entries-root-1011/manifest.json')['files']:
 assert expected[row['target']]==row['baselineSha256'];assert sha(Path(row['source']))==row['sha256'];rows.append({**row,'sourceOriginal':row['source'],'kind':'root App entry and source reconstruction wiring'})
assert len(rows)==18 and len({r['target'] for r in rows})==18
folder.mkdir();patches=[]
for row in rows:
 name=row['target'];p=Path(row['sourceOriginal']);t=folder/'files'/name;t.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,t);assert sha(t)==row['sha256'];row['source']=str(t)
 old=(root/name).read_text(encoding='utf8').splitlines(True) if (root/name).exists() else [];after=t.read_text(encoding='utf8').splitlines(True);patches.extend(difflib.unified_diff(old,after,fromfile='a/'+name,tofile='b/'+name))
patch=folder/'integration.patch';patch.write_text(''.join(patches),encoding='utf8')
(folder/'manifest.json').write_text(json.dumps({'files':rows,'patchSha256':sha(patch),'frozenSourceIndexes':indexes,'productionWritten':False,'scope':'only actually adoptable finite CP constructors and UI; unusable theory/formulas excluded per latest user instruction'},ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'verified':True,'targets':18,'candidate':str(folder),'frozenIndexes':len(indexes)},ensure_ascii=False))
