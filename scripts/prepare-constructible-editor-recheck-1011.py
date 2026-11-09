from pathlib import Path

root=Path.cwd()
def create(name,text):
    target=root/'scripts'/name
    assert not target.exists(),target
    target.write_text(text,encoding='utf8')

runner=(root/'scripts/run-original-cross-runtime-checks-1010.mjs').read_text(encoding='utf8')
runner=runner.replace('original-constructible-cross-runtime-checks-1010','original-constructible-editor-checks-1011')
runner=runner.replace('Only frontend derived-number comparison and its focused TypeScript regression/fixture changed after the completed full run.', 'Only frontend derived-number comparison and the point-editor omission of an absent paper field, with focused TypeScript regressions and captured fixtures, changed after the completed full run.')
create('run-original-constructible-editor-checks-1011.mjs',runner)

writer=(root/'scripts/write-original-constructible-final-report-1010.mjs').read_text(encoding='utf8')
writer=writer.replace('original-constructible-cross-runtime-checks-1010','original-constructible-editor-checks-1011')
writer=writer.replace('original-constructible-preservation-final-1010','original-constructible-preservation-final-1011')
writer=writer.replace('original-constructible-report-1010','original-constructible-report-1011')
writer=writer.replace('original-constructible-docs-before-1010','original-constructible-docs-before-1011')
writer=writer.replace('P54-原曲线CP与多瓣展开统一验收-20261010','P54-原曲线CP与多瓣展开统一验收-20261011')
writer=writer.replace('（2026-10-10）','（2026-10-11）').replace('（2026-10-10，未重打包）','（2026-10-11，未重打包）')
marker='const actualUserFiles=browsers.reduce'
assert marker in writer
writer=writer.replace(marker,"const discreteAudit=json(`${base}/discrete/download-audit.json`),discreteCore=json(`${base}/discrete/download-import-audit.json`);\nassert.equal(discreteAudit.verified,true);assert.equal(discreteAudit.actualUserDownloads,21);assert.equal(discreteCore.verified,true);\n"+marker)
marker='| 尚未完成或未验证 | 状态 |'
assert marker in writer
writer=writer.replace(marker,'最终主界面首轮还发现，点编辑器把缺省纸张写成了JavaScript自有paper:undefined，虽在JSON请求中被省略，当前参数的严格来源读取仍拒绝，导致对偶点修改后层序已解却无法采用。已在点编辑器参数提交处保留真正缺省状态，来源门禁和几何检查保持严格；真实捕获响应加入回归，并重新运行相关完整检查和最终主界面。失败文件与前次构建结果单列保留，不计作最终通过。\n\n'+marker)
create('write-original-constructible-final-report-1011.mjs',writer)

freezer=(root/'scripts/freeze-original-constructible-final-1010.mjs').read_text(encoding='utf8')
freezer=freezer.replace('original-constructible-cross-runtime-checks-1010','original-constructible-editor-checks-1011')
freezer=freezer.replace('original-constructible-report-1010','original-constructible-report-1011')
freezer=freezer.replace('original-constructible-artifacts-1010','original-constructible-artifacts-1011')
freezer=freezer.replace('original-constructible-final-1010.json','original-constructible-final-1011.json')
marker=" 'README.md','package.json'"
assert marker in freezer
freezer=freezer.replace(marker," 'output/original-min-total-dual-editor-focused-1011.log',\n"+marker)
create('freeze-original-constructible-final-1011.mjs',freezer)
print('Created three new check/report/freeze scripts; preceding scripts and records preserved.')
