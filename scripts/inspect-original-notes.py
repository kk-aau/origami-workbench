"""Read notebook prose and headings without evaluating Wolfram expressions.

The supplied notebook remains outside the project. Output is a local research
artifact, not an imported implementation or a redistributable reference corpus.
"""
import argparse
import json
import re
from pathlib import Path


def notes(source):
    for match in re.finditer(r'^Cell\[', source, re.M):
        start = match.end()
        if source.startswith('CellGroupData[', start):
            continue
        depth, string, escaped = 0, False, False
        for end in range(start, len(source)):
            char = source[end]
            if string:
                if escaped:
                    escaped = False
                elif char == '\\':
                    escaped = True
                elif char == '"':
                    string = False
                continue
            if char == '"':
                string = True
            elif char in '[{(':
                depth += 1
            elif char in ']})':
                depth -= 1
            elif char == ',' and depth == 0:
                break
        style = re.match(r',\s*"(Text|Title|Section|Subsection|Subsubsection)"', source[end:end+80])
        if not style:
            continue
        tokens = re.findall(r'"((?:\\.|[^"\\])*)"', source[start:end], re.S)
        text = ''.join(tokens).replace('\\\n', '').replace('\\n', '\n').replace('\\"', '"')
        yield {'line': source.count('\n', 0, match.start()) + 1, 'style': style[1], 'text': text}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('notebook')
    parser.add_argument('--output', required=True)
    parser.add_argument('--start', type=int, default=0)
    parser.add_argument('--end', type=int, default=10**9)
    args = parser.parse_args()
    extracted = list(notes(Path(args.notebook).read_text(encoding='utf-8')))
    Path(args.output).write_text(json.dumps(extracted, ensure_ascii=False, indent=2), encoding='utf-8')
    for cell in extracted:
        if args.start <= cell['line'] <= args.end:
            print(f"{cell['line']} [{cell['style']}] {cell['text']}")
