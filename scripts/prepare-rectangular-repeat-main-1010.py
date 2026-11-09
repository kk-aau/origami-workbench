from pathlib import Path
root=Path.cwd()
base=root/'output/parallel/original-rectangular-repeat-panels-1010'
out=root/'output/original-rectangular-repeat-browser-1010'
out.mkdir(exist_ok=True)
for source,target in [('open-rectangular-repeat.browser.js','open-original-rectangular-repeat-1010.browser.js'),('verify-rectangular-repeat.browser.js','verify-original-rectangular-repeat-1010.browser.js')]:
 text=(base/source).read_text(encoding='utf8').replace('output/playwright/rectangular-repeat',str(out.resolve()).replace('\\','/'))
 (root/'scripts'/target).write_text(text,encoding='utf8')
text=(base/'verify-rectangular-downloads.py').read_text(encoding='utf8').replace("here=Path(__file__).resolve().parent","here=Path(__file__).resolve().parents[1]")
text=text.replace('output/playwright/rectangular-repeat','output/original-rectangular-repeat-browser-1010')
needle="    rows.append({'panels':panels"
extra="""
    tokens=(directory/f'panels-{panels}.dxf').read_text(encoding='utf-8').strip().splitlines();rawlines=[];values=None
    for code,value in zip(tokens[::2],tokens[1::2]):
        if code.strip()=='0':
            values={} if value.strip()=='LINE' else None
            if values is not None:rawlines.append(values)
        elif values is not None:values[code.strip()]=value.strip()
    assert len(rawlines)==len(project['segments'])
    for line,segment in zip(rawlines,project['segments']):
        assert tuple(float(line[k]) for k in ('10','20','11','21'))==(segment['a'][0],-segment['a'][1],segment['b'][0],-segment['b'][1])
        assert line['8']==layers[segment['assignment']]
"""
assert text.count(needle)==1
text=text.replace(needle,extra+needle)
(root/'scripts/verify-original-rectangular-repeat-download-1010.py').write_text(text,encoding='utf8')
print('Prepared actual project/CP/FF/normal LINE DXF checks, including exact unrounded export coordinates. No producer downloads copied.')
