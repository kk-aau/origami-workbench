from pathlib import Path
s=Path('scripts/integrate-original-gore-1010.py').read_text(encoding='utf8')
for old,new in [('original-remaining-gore-1010','original-unmapped-1010'),('gore-integration-manifest.json','vertex-integration-manifest.json'),('integration-original-gore-1010-before','integration-original-vertex-1010-before'),('gore-production.patch','vertex-figure-production.patch'),('original-gore-integrated-1010.json','original-vertex-integrated-1010.json'),('Integrated 13 original Gore data/API/UI and radial paper files with preserved baseline.','Integrated nine original Archimedean vertex figure API/UI/test files with preserved baseline.')]:
 assert old in s,old;s=s.replace(old,new)
Path('scripts/integrate-original-vertex-1010.py').write_text(s,encoding='utf8')
