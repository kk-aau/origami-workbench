import { useEffect, useRef } from 'react';
import type { TextProperties } from '../app/textTools';
import ColorPicker from '../ui/ColorPicker';

export interface TextDraft extends TextProperties { id?: string }
export default function TextParameters({ draft, onChange, onSave, onCancel, onDelete }: {
  draft: TextDraft; onChange: (draft: TextDraft) => void; onSave: () => void; onCancel: () => void; onDelete: () => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { input.current?.focus(); }, [draft.id]);
  return <section className="construction-parameters text-parameters" aria-label="文字编辑参数"
    onContextMenu={e => { e.preventDefault(); onCancel(); }}
    onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); onSave(); } }}>
    <label>注释内容<textarea ref={input} aria-label="注释内容" rows={3} maxLength={10000} value={draft.text} onChange={e => onChange({ ...draft, text: e.target.value })}/></label>
    <label>字号（mm）<input aria-label="文字字号" type="number" min="0.1" max="1000000" step="0.5" value={draft.fontSize} onChange={e => onChange({ ...draft, fontSize: e.target.valueAsNumber || 0 })}/></label>
    <label>文字颜色<ColorPicker aria-label="文字颜色" value={draft.color} onChange={color => onChange({ ...draft, color })}/></label>
    <button className="outline" disabled={!draft.text.trim()} onClick={onSave}>应用文字</button><button onClick={onCancel}>取消文字编辑</button>
    {draft.id && <button onClick={onDelete}>删除此文字</button>}
    <small>Enter 换行 · Ctrl+Enter 应用 · Esc／右击取消 · 应用后可拖动文字</small>
  </section>;
}
