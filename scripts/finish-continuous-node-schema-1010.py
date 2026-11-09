from pathlib import Path
p = Path('src/core/materialCurveModel.ts')
s = p.read_text(encoding='utf8')
old = "|'zhezhi-material-curve-model-v15';base:Snapshot"
assert s.count(old)==1
s = s.replace(old, "|'zhezhi-material-curve-model-v15'|'zhezhi-material-curve-model-v16';base:Snapshot")
assert s.count('1[0-5]')==1
p.write_text(s.replace('1[0-5]', '1[0-6]'), encoding='utf8')
