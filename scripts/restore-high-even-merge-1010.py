from pathlib import Path

root = Path.cwd()
prior = root / 'output/parallel/integration-curve-holes-1010-before'
target = root / 'src/app/wovenParams.ts'
text, original = target.read_text(encoding='utf8'), (prior / 'src/app/wovenParams.ts').read_text(encoding='utf8')
start = original.index('export const WOVEN_HIGH_EVEN_EXAMPLES=')
end = original.index('/** Two actual separate mother pieces;', start)
assert 'wovenHighEvenPreset' not in text
text = text.replace('export type WovenLine=[number,number,number];\n', 'export type WovenLine=[number,number,number];\n' + original[start:end])
target.write_text(text, encoding='utf8')
target = root / 'src/components/WovenControls.tsx'
text = target.read_text(encoding='utf8')
assert 'wovenHighEvenPreset' not in text
text = text.replace('import {wovenPreset,', 'import {WOVEN_HIGH_EVEN_EXAMPLES,wovenHighEvenPreset,wovenPreset,')
text = text.replace("onChange={e=>onChange(e.target.value==='curve-hole'", "onChange={e=>onChange(e.target.value.startsWith('high-even-')?wovenHighEvenPreset(Number(e.target.value.slice(10))):e.target.value==='curve-hole'")
text = text.replace('<option value="independent">独立双部件编织（本地母图）</option>', '{WOVEN_HIGH_EVEN_EXAMPLES.map(degree=><option key={degree} value={`high-even-${degree}`}>{degree}度星形编织 · 原目标（本地母图）</option>)}<option value="independent">独立双部件编织（本地母图）</option>')
target.write_text(text, encoding='utf8')
target = root / 'backend/tessellation_woven_graph.py'
text = target.read_text(encoding='utf8')
original = (prior / 'backend/tessellation_woven_graph.py').read_text(encoding='utf8')
old = next(line for line in text.splitlines() if 'len(neighbors[v]) not in' in line)
new = next(line for line in original.splitlines() if 'len(neighbors[v]) not in' in line)
assert '(4,6,8)' in old and 'range(4,33,2)' in new
text = text.replace(old, new)
target.write_text(text, encoding='utf8')
print('Restored precisely the high-even function, UI options and degree gate from the preserved integration baseline.')
