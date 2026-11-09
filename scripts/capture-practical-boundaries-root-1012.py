from pathlib import Path
import hashlib,json,re
root=Path.cwd().resolve();p=root/'tmp/Origamica-15.0-reference.nb';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(p)=='19b3b06baffb8d59d663f2bfaa5ea55df77da2a84a5a4cc008dcedf019c8dba9'
rows=p.read_text(encoding='utf8').splitlines(True);out=root/'output/parallel/practical-boundaries-root-002-1012';assert not out.exists();out.mkdir(parents=True)
ranges=[('basic-single-paper-models',169258,170841),('strained-models-and-rotational-pleats',193759,197575)]
index=[]
for name,start,end in ranges:
 text=''.join(rows[start-1:end]);nb=out/(name+'.nb');nb.write_text(text,encoding='utf8')
 # A source-token view only: no Wolfram expression is evaluated.
 values=[]
 for m in re.finditer(r'"(?:\\[\s\S]|[^"\\])*"',text):
  token=m.group()[1:-1].replace('\\\n','').replace('\\\r\n','')
  token=token.replace('\\"','"').replace('\\n','\n').replace('\\t','\t').replace('\\[IndentingNewLine]','\n')
  values.append(token)
 tokens=out/(name+'.tokens.txt');tokens.write_text(' '.join(values),encoding='utf8')
 index.append(dict(name=name,startLine=start,endLine=end,raw=nb.name,rawSHA256=sha(nb),tokens=tokens.name,tokensSHA256=sha(tokens)))
(out/'source-index.json').write_text(json.dumps(dict(notebook=str(p),notebookSHA256=sha(p),ranges=index,wolframExecuted=False),ensure_ascii=False,indent=2),encoding='utf8')
print('Captured both remaining practical source boundaries without evaluating the notebook.')
