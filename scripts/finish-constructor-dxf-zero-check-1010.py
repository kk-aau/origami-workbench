from pathlib import Path
p=Path('scripts/verify-parallel-constructors-download-1010.ts')
s=p.read_text(encoding='utf8');old='assert.equal(Number(lines[i].get(code)),value);'
assert s.count(old)==1
p.write_text(s.replace(old,"assert.ok(Number(lines[i].get(code))===value,`${item.name} ordinary LINE coordinate ${code}`);"),encoding='utf8')
