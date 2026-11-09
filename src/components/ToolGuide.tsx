import { TOOL_GUIDES, getToolPurpose, getToolStep, type Tool } from '../app/tools';
export { getToolStep } from '../app/tools';
import './toolGuide.css';

interface Props {
  tool: Tool;
  pendingCount: number;
  error?: string | null;
  stepOverride?: ReturnType<typeof getToolStep>;
}

export default function ToolGuide({ tool, pendingCount, error, stepOverride }: Props) {
  const guide = TOOL_GUIDES[tool];
  const step = stepOverride ?? getToolStep(tool, pendingCount);

  return <section className="tool-guide" aria-label="工具用法" data-tool={tool}>
    <div className="tool-guide-heading">
      <strong className="tool-guide-name">{guide.name}</strong>
      {guide.reference && <span className="tool-guide-reference"><i aria-hidden="true" />紫色为参考线，不表示山谷</span>}
    </div>
    <p className="tool-guide-purpose"><strong>作用：</strong>{getToolPurpose(tool)}</p>
    <p className="tool-guide-usage">{guide.usage}</p>
    <div className={'tool-guide-step' + (error ? ' has-error' : '')} aria-live="polite" aria-atomic="true">
      <span className="tool-guide-step-number">{step.label}</span>
      <span>{error || step.instruction}</span>
    </div>
    <p className="tool-guide-cancel"><kbd>Esc</kbd> / 右击取消当前操作；{tool==='text'?'空闲时右击优先删文字，未命中则删线或圆；框选删除文字、线段与圆。':'空闲时右击删线或辅助圆。'}向右拖实线框：完整包含；向左拖虚线框：线段或圆周相交、接触。</p>
  </section>;
}
