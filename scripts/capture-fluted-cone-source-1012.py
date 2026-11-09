from pathlib import Path
import hashlib,json
root=Path.cwd().resolve();nb=root/'tmp/Origamica-15.0-reference.nb';digest=hashlib.sha256(nb.read_bytes()).hexdigest();assert digest=='19b3b06baffb8d59d663f2bfaa5ea55df77da2a84a5a4cc008dcedf019c8dba9'
rows=nb.read_text(encoding='utf8').splitlines();folder=root/'output/parallel/fluted-cone-source-root-1012';assert not folder.exists();folder.mkdir(parents=True)
segments=[('fluted-purpose-and-helpers',186769,187519),('simple-fluted-full',187520,187820),('generalized-cone-cp-helpers',187821,188083),('multi-slice-full',188084,188758)]
index=[]
for name,a,b in segments:
 p=folder/(name+'.txt');p.write_text('\n'.join(f'{i+1}: {line}' for i,line in enumerate(rows[a-1:b],a-1))+'\n',encoding='utf8');index.append(dict(name=name,range=[a,b],path=p.relative_to(root).as_posix(),sha256=hashlib.sha256(p.read_bytes()).hexdigest()))
(folder/'source-index.json').write_text(json.dumps(dict(notebookSHA256=digest,dataOnly=True,mathematicaExecuted=False,files=index),ensure_ascii=False,indent=2),encoding='utf8')
print('Captured four exact original source ranges for remaining fluted/multi-sliced cone workflow.')
