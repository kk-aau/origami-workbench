'use strict';
const shell = document.querySelector('.startup-shell');
const title = document.querySelector('#startup-title');
const detail = document.querySelector('#startup-detail');
const version = document.querySelector('#startup-version');
const actions = document.querySelector('.startup-actions');
function render(state) {
  if (!state || !['starting', 'service', 'workspace', 'error'].includes(state.stage)) return;
  const failed = state.stage === 'error';
  shell.dataset.startupStage = state.stage;
  shell.dataset.startupSlow = String(state.slow === true);
  title.textContent = state.title;
  detail.textContent = state.slow && !failed
    ? '启动时间较长，仍在准备中。您可以继续等待，或退出后重试。'
    : state.detail;
  version.textContent = state.version ? `v${state.version}` : '';
  actions.hidden = !failed;
  document.title = failed ? '折纸工坊 · 启动遇到问题' : '折纸工坊 · 正在启动';
}
document.querySelector('#startup-close').addEventListener('click', () => window.startup?.close());
document.querySelector('#startup-quit').addEventListener('click', () => window.startup?.close());
document.querySelector('#startup-open-logs').addEventListener('click', () => window.startup?.openLogs());
window.startup?.onState(render);
