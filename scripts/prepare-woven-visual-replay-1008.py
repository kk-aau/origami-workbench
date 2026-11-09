"""Recompute the parameters in actual browser downloads with the public engine."""
import json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'backend'))
from tessellate import generate
out={}
for name in ['manual','native']:
    doc=json.loads((ROOT/f'output/playwright/woven-visual-{name}-1008.zhezhi.json').read_text(encoding='utf8'))
    p=doc['metadata']['tessellation']['parameters'];out[name]=dict(params=p,response=generate(p))
(ROOT/'output/audits/woven-visual-replay-1008.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
print('Recomputed actual edited-mother and visually drawn native-line recipes through the public engine.')
