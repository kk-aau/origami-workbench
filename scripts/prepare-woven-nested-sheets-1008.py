"""Real public-engine fixtures; explicitly nested independent material sheets."""
import copy,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from tessellate import generate
base=json.loads(Path('output/audits/woven-nested-sheets-probe-1008.json').read_text(encoding='utf-8'))['params']
cases=[]
for name,patch in [('nested-pair',{}),('nested-pair-inner-fixed',dict(stationaryFace=4,parity=-1)),('nested-pair-merit',dict(optimization='origamica-merit',minPleat=.3,minBorderPleat=.05))]:
 p=dict(copy.deepcopy(base),**patch)
 try:
  r=generate(p);cases.append(dict(name=name,params=p,response=r));print(name,'geometry',r['stats']['checks']['geometry']['status'],'closure',r['source']['closureError'])
 except Exception as ex:print(name,type(ex).__name__,str(ex));raise
Path('tests/fixtures/woven-nested-sheets-1008.json').write_text(json.dumps(dict(cases=cases),ensure_ascii=False,indent=2),encoding='utf-8')
