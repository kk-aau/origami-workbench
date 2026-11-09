from pathlib import Path

p = Path('src/core/materialCurveModel.ts')
s = p.read_text(encoding='utf8')
old = "if(versionOf(model)<6)model.base.auxiliarySegments=current.segments.filter"
assert s.count(old) == 8, s.count(old)
s = s.replace(old, "if(!Object.hasOwn(model.base,'auxiliarySegments'))model.base.auxiliarySegments=current.segments.filter")
s = s.replace("if(versionOf(model)<6){model.base.auxiliarySegments=current.segments.filter(s=>s.assignment==='A').map(shape);model.schema='zhezhi-material-curve-model-v6';}", "if(!Object.hasOwn(model.base,'auxiliarySegments'))model.base.auxiliarySegments=current.segments.filter(s=>s.assignment==='A').map(shape);if(versionOf(model)<6)model.schema='zhezhi-material-curve-model-v6';")
s = s.replace('snapshot(computed.doc,versionOf(model)>=6,versionOf(model)>=9)', "snapshot(computed.doc,Object.hasOwn(model.base,'auxiliarySegments'),versionOf(model)>=9)")
p.write_text(s, encoding='utf8')
