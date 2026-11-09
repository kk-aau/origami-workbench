"""Real responses; baseline was generated with the SHA-verified v0.13.5 source."""
import json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'backend'))
from tessellate import generate

def records():
    original=json.loads((ROOT/'output/audits/woven-period-legacy-responses-1007.json').read_text(encoding='utf-8'))
    legacy=original['cases'];cases=[]
    p=next(c['params'] for c in legacy if c['name']=='in3432')
    for name,params in [('in3432',dict(p,optimization='origamica-merit')),
                        ('in3432-narrow',dict(p,width=.19,optimization='origamica-merit')),
                        ('in3432-fixed-F4',dict(p,stationaryFace=3,optimization='origamica-merit')),
                        ('in3432-reordered',dict(p,periodicity=p['periodicity'][::-1],optimization='origamica-merit'))]:
        cases.append(dict(name=name,params=params,response=generate(params)))
    return dict(wolframExecuted=False,notebookSha256='19b3b06baffb8d59d663f2bfaa5ea55df77da2a84a5a4cc008dcedf019c8dba9',
                legacyArchiveSha256=original['archiveSha256'],legacyBackendSha256=original['backendSha256'],legacy=legacy,cases=cases)

if __name__=='__main__':
    Path(__file__).with_name('woven-period-merit-20261007.json').write_text(json.dumps(records(),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
