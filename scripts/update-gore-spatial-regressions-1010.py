from pathlib import Path
for file in ['tests/app/tessellation.test.ts','tests/app/tessellationPaperFitParams.test.ts']:
 p=Path(file);s=p.read_text(encoding='utf8');old="'radial-pot','rectangular-pot'"
 assert s.count(old)==1,(file,s.count(old))
 p.write_text(s.replace(old,"'radial-pot','gore-paper','rectangular-pot'"),encoding='utf8')
print('Included the new Gore spatial family in the independent-paper exclusion regressions.')
