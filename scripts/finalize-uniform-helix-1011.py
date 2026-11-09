from pathlib import Path
import json
import hashlib
import shutil

root=Path.cwd().resolve()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
read=lambda p:json.loads((root/p).read_text(encoding='utf-8-sig'))
out=root/'output/original-uniform-helix-report-1011.json'
assert not out.exists()
specs=[
 ('original-uniform-helix-refold-next-source-1011','freeze.json','a5d445a1a0a1414aef8dfddc36151b4afafc2db698f118df59d2565ca6c23020',32),
 ('original-uniform-helix-cp-independent-math-1011','freeze.json','1caa9e4b26719d6ac73cc2e68e24ae1631ee33621fdcdefc26e4b6a531075095',24),
 ('original-uniform-helix-cp-3951-1011','DELIVERY-FROZEN-002.json','76ab09dc3ea754c18353350217720724185d592ec6ee80b44003c9235b9bb296',11),
 ('original-uniform-helix-cp-3951-1011','SUPPORT-FROZEN-001.json','bcd04b0b9e2e67b2a7eb8e939e4ec7575f7ca04372ebdea8ea42db31d4dfd2a1',43),
 ('original-uniform-helix-cp-3951-1011/layout-parent-delta-001','DELTA-FROZEN-001.json','cb59c0e568f0eab32d41538b76671127b4b6c1e51bd56d84e1406bc64fc9be78',25),
 ('original-uniform-helix-cp-3951-1011/source-origin-delta-001','DELTA-FROZEN-001.json','459a750cd547fd91c01eb5b2eaa051b7d97cad853cbf7630585568f954c45dea',12),
 ('original-uniform-helix-cp-3951-independent-review-1011','freeze.json','6493d4e9f32d3a265fb6d1239f50b9ddc88ec38b75d899260732c12c9284469b',11),
 ('original-uniform-helix-main-acceptance-prepared-1011','freeze.json','f7eacc08b9944d09b5f6064ba44df550a4fdfc53fd8573ef78c0634633b96d4c',9),
 ('original-uniform-helix-core-main-auditor-prepared-1011','freeze.json','5bfc873b0bdfc3766e158e370b6b09603c56bdc9af2658b73d00acdf2d009682',7),
 ('original-uniform-helix-parent-layout-prepared-1011','freeze.json','f4f90d1d8d1fdcf904885166bec5e87acb49fc25d626f3328b44fbca5949bc84',9),
 ('original-uniform-helix-main-independent-review-1011','freeze.json','77bd8317b7e2d9954226edc70854d142b6797a57be1fd09bf55beec25bf5df20',5),
 ('original-uniform-helix-parent-layout-independent-review-1011','freeze.json','68a5e3837bf5029553fab9330f6419d88b8e1e64beeace1e3256ae895128a2ab',5),
 ('original-uniform-helix-actual-file-independent-1011','freeze.json','292beb0e5fdf46624da9a69872f19687c67b6a374e5a365ef68faaf574c54394',13),
]
frozen=[]
for folder,index,expected,count in specs:
 base=root/'output/parallel'/folder;p=base/index
 assert sha(p)==expected,p
 j=json.loads(p.read_text(encoding='utf-8-sig'));assert len(j['files'])==count,p
 rows=[]
 for row in j['files']:
  name=row.get('path',row.get('file'))
  f=next((v.resolve() for v in [base/name,root/name] if v.is_file() and sha(v)==row['sha256']),None)
  assert f is not None and f.is_relative_to(root),name
  rows.append(dict(file=f.relative_to(root).as_posix(),sha256=row['sha256']))
 for field in ['actualUserDownloads','nonUserActualInputs']:
  for row in j.get(field,[]):
   f=Path(row.get('path',row.get('file'))).resolve();assert f.is_relative_to(root) and sha(f)==row['sha256'],str(f)
   rows.append(dict(file=f.relative_to(root).as_posix(),sha256=row['sha256']))
 frozen.append(dict(file=p.relative_to(root).as_posix(),sha256=expected,indexFiles=count,files=rows))
base=root/'output/parallel/original-uniform-helix-root-wiring-r2-1011';p=base/'freeze.json'
j=json.loads(p.read_text(encoding='utf8'));assert len(j['files'])==4
for row in j['files']: assert sha(root/row['file'])==row['sha256']
frozen.append(dict(file=p.relative_to(root).as_posix(),sha256=sha(p),indexFiles=4,files=j['files']))
run=read('output/original-uniform-helix-checks-1011.json');assert run['exitCode']==0 and run['inputsUnchanged'] and run['backendInputsUnchanged']
assert run['tests']==dict(frontend=2964,desktop=7,backend=1337,serverWorker=66,buildModules=1048)
main_path='output/playwright/original-uniform-helix-main-1011/downloads-001'
main=read(main_path+'/browser-checks.json');assert main['passed'] and main['checks']==336 and len(main['downloads'])==52 and main['nativeRequests']==0
layout=read('output/playwright/original-uniform-helix-main-1011/parent-layout-001/parent-layout-checks.json')
assert layout['passed'] and layout['checks']==158 and len(layout['records'])==12
assert layout['actualUserExports']==layout['projectWrites']==layout['adoptions']==0
assert main['bundle']==layout['bundle']=='/assets/main-DduCyvqO.js'
assert read('output/original-uniform-helix-bundle-verified-1011.json')['verified']
bundle=read('output/original-uniform-helix-bundle-1011.json')
for row in bundle['files']: assert sha(root/row['file'])==row['sha256']
core=read('output/parallel/original-uniform-helix-main-independent-review-1011/core-actual-files-001.json')
assert core['passed'] and core['checks']==6243
py=read('output/parallel/original-uniform-helix-actual-file-independent-1011/actual-files-audit-001.json')
assert py['passed'] and py['checks']==436547
preserve=read('output/original-uniform-helix-preservation-1011.json')
assert preserve['verified'] and preserve['mappedFiles']==7 and preserve['unchangedProductionInputs']==1842
for name,value in preserve['lastSourceHashes'].items():assert sha(root/name)==value,name
assert read('output/original-uniform-helix-runtime-stopped-1011.json')['verified']
previous=read('output/audits/original-nonuniform-spiral-final-1011.json');assert len(previous['snapshots'])==3645
old_hashes={r['file']:r['sha256'] for r in previous['snapshots']}
backup=root/'output/original-uniform-helix-docs-before-1011';assert not backup.exists()
changes=[]
for name in ['README.md','docs/Origamica当前剩余范围-20261009.md']:
 p=root/name;assert sha(p)==old_hashes[name],name
 saved=backup/name;saved.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,saved)
 before=sha(p);text=p.read_text(encoding='utf8')
 if name=='README.md':
  k=text.index('\n')+1;text=text[:k]+'\n原均匀螺旋CP（2026-10-11，源码版）：原In[3951/3953]保存例新增原单位纸宽、毫米参数预览、采用/保存/源再建；裁域保绝对零点源。2964前端、336实际操作、158真实布局及52实际文件回读通过，见[入口与验收](docs/P62-原均匀螺旋纸域CP统一验收-20261011.md)。螺旋展开再折回与更广参数域继续实现，完整目标未完成，免安装包未更新。\n'+text[k:]
 else:
  a=text.index('最新已验收：');b=text.index('\n\n',a)
  text=text[:a]+'最新已验收：原In[3951/3953]均匀螺旋保存例有限两面CP、原单位纸宽、毫米标尺和五参数、实时纸宽预览、采用/保存/源再建；336实际操作、158真实布局与52实际文件回读通过，见P62-原均匀螺旋纸域CP统一验收-20261011.md。P61非均匀螺旋及此前冻结保持。下一批原In[3980]展开再折回源合同与数学已核查，独立构造实现中；原均匀螺旋更广半径/角度参数域也继续对照，不能将固定保存例算作完整函数全参数复现。完整曲线、符号/默认与全数值域目标仍未完成。'+text[b:]
 p.write_text(text,encoding='utf8');changes.append(dict(file=name,before=before,after=sha(p)))
name='docs/P62-原均匀螺旋纸域CP统一验收-20261011.md';p=root/name;assert not p.exists()
p.write_text('''# 原均匀螺旋纸域 CP 验收（2026-10-11）

原 In[3951/3953] 保存的均匀螺旋已增加可构造、采用、编辑、保存及导出的有限二维 CP。此批为 r=1、θ=30°、γ=90°保存例及其可调纸域；完整函数的任意半径和角度仍继续对照。源码版可体验，免安装包未更新，完整目标未完成。

| 入口 | 可体验内容 |
| --- | --- |
| 镶嵌设计 → 空间构造 → 原式工具与参考示例 → 原均匀螺旋 CP · In[3951] | 原角起止、左右纸宽、16–128段均可输入和拖动；毫米网格、坐标、标尺、实际两面纸域同屏。 |
| 采用后 → 修改原均匀螺旋纸面参数 | 可修改源并重新生成原 U/null；同工程源再建和同名重复保存保持UUID，取消不改当前工程。 |
| 实时纸宽 | 复用私有冻结解析源并重新验有限纸域；实际 .30→.31→.30 几何改变后恢复，零新增数值请求。 |

原绝对函数初值 f(0)=(1,0)、T(0)=(0,1)。起点改为0.2只截取原函数，其坐标不重置为(1,0)；与In[3968]当前起点重新初始化的规则严格区分。原左右单位母线不翻转，不归一或移动端点，1源坐标单位明确映为1mm，无重复缩放、镜像或翻转。原3D连续源的γ=90°不等于有限CP边的已知90°折角。

原左焦距8/√30≈1.460593mm，原左右单位宽1均安全，默认保1/1。每侧宽0.05–1mm，原u在[0,π]且跨度≥0.1rad；非法输入保原值并禁用采用。原100弦绘图密度与Wolfram插值语义分别记录。解析圆弧、实际binary64分区、材料身份和source provenance均核验；证明用母线及对角线不成为CP边。

| 纸域 | 顶点 / 边 / 实际材料面 |
| --- | --- |
| 默认100段、原宽1/1 | 303 / 304 / 2 |
| 16段、宽1/1或0.05/1 | 51 / 52 / 2 |
| 裁域0.2…2.8、32段、宽0.3/0.8 | 99 / 100 / 2 |
| 128段、宽0.05/0.05 | 387 / 388 / 2 |

| 检查 | 结果 |
| --- | --- |
| 项目检查 | 前端2964、桌面7、服务/worker66、24平面脚本与层序专项通过；后端1337既有完整结果按全部受保护输入SHA保持沿用，未冒称本批重跑。零类型诊断，1048模块构建通过。 |
| 主App实际操作 | 336项、52实际按钮文件、8保存POST；7状态包括默认、16段、非对称宽、裁域、唯一手改、恢复与128段薄宽。工程库、JSON/FOLD重开、取消、UUID及源参数重开通过。Uniform源native请求0。 |
| 文件回读 | 32JSON+7FOLD+7普通DXF+3优化DXF+3加工报告。39普通工程真实导入；核心6243及独立绑定123，共6366项。34source真、5手改假。3组完整规划、逐LINE、独立baseline、尺度、位置与一次加工核对通过。 |
| 高精度独审 | 436547项断言，独立MP80源最大残差7.67×10⁻¹⁶，坐标及逐LINE最大残差2.22×10⁻¹⁵mm；5实际有限图两面覆盖与交叉核验通过。没有使用产品helper作为数值oracle。 |
| 真正父界面布局 | 158项，App源重开/镶嵌入口×1420/1920桌面×checking/ready/error，共12记录；680px弹窗、420px预览、五输入及滑条/标尺/footer同屏，无双向滚动。 |
| 布局独审与保护 | 538项，当前52+P61旧52+P60旧82共186用户文件SHA不变；真实150ms源构造定时器通过Playwright时钟暂停、继续并恢复检查，未替换source或造HTTP。零采用、保存和用户导出。 |
| 已有工作 | P61归档3645及1842已有生产输入保持，11共享数值/几何/普通和优化导出核心不改；最终DduCyvqO的26资产全SHA匹配实际操作和布局。 |

采用前独立审查发现：固定零起点sourceFrames[0].base可被MIN_VALUE或1e−14伪改而沿用派生误差容限。已只对原固定(1,0)身份作精确JSON校验，保±0等价和正起点裁域的派生1e−13误差界。原3反例保留，42项修复后闭环、原542守卫及源/交付318绑定通过，不通过重建Doc掩盖修改。主界面唯一手改uniform3951-crease-29（边87）U/null→M/-180，差集严格一ID，明确源再生后才恢复。

独立组件45及父样式模型84只是准备证据；最终认证使用上述主App336与真实父布局158。所有首草稿测试假设、CRLF、样式候选、接线锚点和生成服务脚本语法失败保持；有效生产由精确checked patch和最终类型/构建核验。旧只读原入口保留，不把作者callback Doc、期望fixture或观察回执计作52用户按钮文件。

| 修改文件 | 用途 |
| --- | --- |
| src/app/uniformHelixCP3951.ts | 原解析源、严格recipe、有限材料CP、预览与来源校验 |
| src/components/UniformHelixCP3951Dialog.tsx / .css | 五参数、毫米预览、三态与父样式布局 |
| src/App.tsx / src/components/TessellationPanel.tsx | 新入口、采用、源再建与工程身份 |
| tests/app/uniformHelixCP3951.test.ts / tests/fixtures/uniform-helix-cp-3951-20261011.json | 27项新增聚焦回归及独立源fixture |

| 未完成或未验证 | 状态 |
| --- | --- |
| 下一构造 | In[3980]原递减折角展开再折回，37源/数学文件已核验，五文件独立实现中，尚未主App验收。 |
| 完整原函数 | 更广r/θ/γ、任意符号/默认求解/原插值与全数值域、任意非平折编辑及全色面/层序继续；不能报可靠剩余数量或百分比。 |
| 空间与平折 | 此CP不提供有限材料刚性三维、FF、层序、连续无碰撞或纸厚证书；连续源图不当作有限刚性折形。 |
| 交付与外部验证 | 未执行Wolfram/核对保存Out，未更新免安装包或发布，未做刻字软件实际导入或机器试压，不承诺实机提速。 |

报告 output/original-uniform-helix-report-1011.json；实际文件 output/playwright/original-uniform-helix-main-1011/downloads-001；最终资产 output/original-uniform-helix-bundle-1011.json。最终extreme UUID为030d6b15-e735-4f7f-8f4c-8d4fae645f86。自有浏览器与8874服务已关闭，未操作用户服务。
''',encoding='utf8')
changes.append(dict(file=name,before=None,after=sha(p)))
report=dict(verified=True,tests=run['tests'],eightStagesPassed=True,bundle=main['bundle'],actualMainChecks=336,
 userButtonExportFiles=52,actualCoreImports=39,processingPairs=3,actualCoreChecks=6366,independentPythonChecks=436547,
 finalLayoutChecks=158,finalLayoutRecords=12,layoutIndependentChecks=538,layoutGuardedFiles=186,
 finalSaved=main['lastSaved'],sourceNativeRequests=0,preservation=preserve,frozenIndexes=frozen,docChanges=changes,
 actualDirectory=main_path,completeOrigamicaGoal=False,packed=False,published=False,machineVerified=False,
 notVerified=['complete original r/theta/gamma domains','In3980 actual integration','symbolic/default/interpolation semantics','Wolfram or saved Out','finite rigid3D/flat-fold/layers/collision/thickness','portable package/third-party cutter/machine'])
out.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(verified=True,indexes=len(frozen),main=336,layout=158,files=52,targets=7,completeOrigamicaGoal=False)))
