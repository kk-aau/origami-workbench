"""Additional public-engine domains; does not relax acceptance gates."""
import sys,json,copy,math
from pathlib import Path
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'backend'))
from tessellate import generate
from tessellation_woven_graph import woven_graph_data
saved=json.loads((root/'tests/fixtures/woven-mother-holes-1008.json').read_text(encoding='utf8'));base=saved['params'];out=[]
cases=[('uniform',base),('no-border-inset',dict(base,borderInset='none')),('origamica-merit',dict(base,optimization='origamica-merit'))]
graph=copy.deepcopy(base['graph']);n=len(graph['vertices']);shift=6
graph['vertices'] += [[x+shift,y] for x,y in graph['vertices'][:n]]
graph['edges'] += [[a+n,b+n] for a,b in graph['edges'].copy()]
graph['holeFaces']=[4,9];cases.append(('two-independent-holed-mothers',dict(base,graph=graph)))
for name,params in cases:
    try:
        response=generate(params);out.append(dict(name=name,status='generated',params=params,response=response))
    except ValueError as exc:out.append(dict(name=name,status='not-certified',reason=str(exc)))
(root/'output/audits/woven-mother-holes-domains-1008.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps([dict(name=c['name'],status=c['status'],reason=c.get('reason'),cp=[c['response']['stats'][k] for k in ('vertices','edges','faces')] if 'response' in c else None) for c in out],ensure_ascii=False))
