from pathlib import Path
import hashlib,json,difflib
root=Path.cwd().resolve();folder=root/'output/parallel/path-array-units-delta-1012';assert not folder.exists();name='src/components/LinearSpacePolyhedralCPDialog.css';p=root/name
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();before=sha(p);old=p.read_text(encoding='utf8')
text=old+'\n.lsp-dialog .sgm-fields label{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px}.lsp-dialog .sgm-fields label>input,.lsp-dialog .sgm-fields label>select{grid-column:1/-1}.lsp-dialog .lsp-field-unit{font-size:11px;margin-left:0;justify-self:end}\n'
delivery=folder/name;delivery.parent.mkdir(parents=True);delivery.write_text(text,encoding='utf8')
(folder/'candidate.patch').write_text(''.join(difflib.unified_diff(old.splitlines(keepends=True),text.splitlines(keepends=True),fromfile='a/'+name,tofile='b/'+name)),encoding='utf8')
(folder/'manifest.json').write_text(json.dumps(dict(files=[dict(target=name,source=str(delivery),baselineSha256=before,sha256=sha(delivery),kind='modify')],patchSha256=sha(folder/'candidate.patch'),reason='Put width/angle units beside labels, reclaim three field-row heights so the default four-point XYZ list is directly visible. No source parameter or coordinate change.'),ensure_ascii=False,indent=2),encoding='utf8')
print('Prepared one scoped stylesheet change; actual default table visibility to be verified in run 004.')
