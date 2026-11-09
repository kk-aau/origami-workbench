from pathlib import Path
p=Path('scripts/verify-original-gore-download-1010.ts');s=p.read_text(encoding='utf8')
old='assert.ok(readGoreResult(actual));';assert s.count(old)==1
p.write_text(s.replace(old,'assert.ok(readGoreResult(actual,actual.query));'),encoding='utf8')
