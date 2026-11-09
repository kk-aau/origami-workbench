from pathlib import Path
root=Path.cwd()
original=root/'scripts/write-original-constructible-final-report-1011.mjs'
target=root/'scripts/write-original-constructible-final-report-v2-1011.mjs'
assert not target.exists()
text=original.read_text(encoding='utf8')
old='assert.ok(acrossPython.passed>0&&acrossCore.passed>0);'
assert text.count(old)==1
text=text.replace(old,'assert.equal(acrossPython.verified,true);assert.equal(acrossCore.verified,true);assert.ok(acrossPython.checks>0&&acrossCore.checks>0);assert.equal(acrossPython.actualBrowserUserDownloadsAudited,14);assert.equal(acrossCore.actualBrowserUserDownloadsAudited,14);')
old='const bundle=browsers[0].bundle;'
assert text.count(old)==1
text=text.replace(old,"const finalBundle=json('output/original-constructible-bundle-verified-1011.json');assert.equal(finalBundle.verified,true);assert.equal(finalBundle.bundle,browsers[0].bundle);\n"+old)
old='完整检查：output/original-constructible-editor-checks-1011.log；'
assert text.count(old)==1
text=text.replace(old,'验收脚本修正与普通FOLD合法索引映射见[P54验收补充](P54-验收脚本补充-20261011.md)；这些修正不改变导出或导入核心。\n\n'+old)
target.write_text(text,encoding='utf8')
print('Prepared a new report writer using the original Across numeric checks schema and verified final bundle; original writers preserved.')
