from pathlib import Path
import re
from collections import Counter

lines = Path('tmp/Origamica-15.0-reference.nb').read_text(encoding='utf8').splitlines()
start, end = 244000, 258924
terms = re.compile(r'reference|auxiliary|auxline|ref.*face|rootface|starting|crease|Add.*Line|Set.*Face', re.I)
found = [(i + 1, line) for i, line in enumerate(lines) if start <= i + 1 <= end and terms.search(line)]
print('\n'.join(f'{i}: {line}' for i, line in found[:55]))
names = Counter(re.findall(r'RowBox\[\{"([A-Za-z][A-Za-z0-9]+)", "\["', '\n'.join(lines[start:end])))
ordinary = {'Part', 'Length', 'Table', 'Range', 'If', 'Map', 'Module', 'Flatten', 'Transpose', 'Join', 'Total', 'Append', 'First', 'Last', 'Times', 'Plus', 'Norm', 'N', 'Abs', 'Sign', 'Sin', 'Cos', 'Sqrt', 'Min', 'Max'}
print('CALLS:', ', '.join(f'{n}({v})' for n, v in names.items() if n not in ordinary))
