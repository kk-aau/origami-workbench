"""Real nonperiodic source responses; independent checks are in test modules."""
import json
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'backend'))
from tessellate import generate

def records():
    cases=[]
    for fixture,names in (
        ('woven-original-boundaries-20261001.json',('internal-diagonal','concave-six-face-other-radius','difficult-convex-four-face')),
        ('woven-concave-cells-20261001.json',('reflex-cell-positive','reflex-cell-full-insets')),
    ):
        for case in json.loads(Path(__file__).with_name(fixture).read_text(encoding='utf-8'))['cases']:
            if case['name'] not in names:continue
            params=dict(case['params'],optimization='origamica-merit')
            cases.append(dict(name=case['name'],params=params,response=generate(params)))
    original=json.loads(Path(__file__).with_name('woven-concave-cells-20261001.json').read_text(encoding='utf-8'))['cases'][0]['params']
    params=dict(original,optimization='origamica-merit',minPleat=.3,minBorderPleat=.05)
    cases.append(dict(name='reflex-cell-usable-merit',params=params,response=generate(params)))
    return dict(wolframExecuted=False,scope='local-nonperiodic-numerical-implementation',cases=cases)

if __name__=='__main__':
    Path(__file__).with_name('woven-merit-20261007.json').write_text(
        json.dumps(records(),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
