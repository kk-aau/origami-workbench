"""Read mathematical gluing records, not any external implementation.

Reference: Marek Ctrnact's tes-catalog, files/tessellations/k-uniform/02/2.
This offline research utility is not required by the application.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = ['5a 6d 1','5b 6j 1','5c 6f 1','5c 6i 1','4a 6d 1',
         '5e 6a 1','4d 6a 1','4d 5a 1','5c 5f 1','5d 5f 1',
         '4l 5e 1','4l 5c 1','4p 5c 1','4s 5c 1','4k 4l 1',
         '4d 4f 1','3a 4b 1','4f 4k 1','4f 4k 2','3c 4l 1']


def endpoint(token):
    if '@' in token:
        edge, tile = map(int, token.split('@'))
    else:
        tile = token.count("'")
        edge = int(token.rstrip("'"))
    return tile, edge


records = []
for index, name in enumerate(FILES, 1):
    text = (ROOT / 'output/two-uniform-reference' / f'eu {name}.tes').read_text()
    sides = [len(row.split(',')) for row in re.findall(r'unittile\(([^)]+)\)', text)]
    periods = sides.copy()
    for tile, count in re.findall(r'repeat\((\d+),(\d+)\)', text):
        periods[int(tile)] //= int(count)
    adjacent = [[None] * n for n in periods]
    conway = re.search(r'conway\("([^"]+)"\)', text)[1]
    for opening, content in re.findall(r'([\[(])([^\])]+)[\])]', conway):
        tokens = content.split()
        a, b = endpoint(tokens[0]), endpoint(tokens[-1])
        for src, dst in ((a, b), (b, a)):
            adjacent[src[0]][src[1]] = [*dst, opening == '[']
    assert all(all(x is not None for x in row) for row in adjacent)
    words = [list(map(int, x.split(','))) for x in re.findall(r'\(([\d,]+)\)', text.splitlines()[0])]
    records.append(dict(index=index, reference=f'eu {name}.tes', vertexTypes=words,
                        sides=sides, periods=periods, adjacent=adjacent))
target = ROOT / 'backend/tessellation_uniform_data.py'
target.write_text('"""20 two-uniform Euclidean tilings: finite edge-gluing data.\n'
                  'Mathematical catalog reference: https://github.com/zenorogue/tes-catalog\n'
                  'files/tessellations/k-uniform/02/2, compiled by Marek Ctrnact.\n'
                  'Geometry and periodic-lattice reconstruction are implemented independently.\n'
                  'See docs/双均匀目录来源.md for identification and verification.\n"""\n\n'
                  'CATALOG = ' + repr(records) + '\n', encoding='utf8')
print(f'Wrote {len(records)} gluing records')
