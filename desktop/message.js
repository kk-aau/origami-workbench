'use strict';

const bridge = window.messageWindow;
const cancel = document.getElementById('message-cancel');
const accept = document.getElementById('message-accept');
let answered = false;
function respond(accepted) {
  if (answered) return;
  answered = true;
  bridge.respond(accepted);
}

document.getElementById('message-close').addEventListener('click', () => respond(false));
cancel.addEventListener('click', () => respond(false));
accept.addEventListener('click', () => respond(true));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); respond(false); return; }
  if (event.key !== 'Tab') return;
  const controls = [...document.querySelectorAll('button')].filter(button => !button.disabled && !button.hidden);
  const first = controls[0], last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

bridge.ready().then(payload => {
  if (!payload) { respond(false); return; }
  document.documentElement.dataset.theme = payload.theme === 'dark' ? 'dark' : 'light';
  document.title = payload.title;
  const dialog = document.querySelector('.ui-dialog');
  dialog.setAttribute('role', payload.kind === 'confirm' ? 'alertdialog' : 'dialog');
  document.getElementById('message-title').textContent = payload.title;
  document.getElementById('message-text').textContent = payload.message;
  const detail = document.getElementById('message-detail');
  if (payload.detail) detail.textContent = payload.detail;
  else { detail.remove(); dialog.setAttribute('aria-describedby', 'message-text'); }
  accept.textContent = payload.confirmLabel;
  if (payload.danger) { accept.classList.remove('is-primary'); accept.classList.add('is-danger'); }
  if (payload.kind === 'info') cancel.remove();
  else cancel.textContent = payload.cancelLabel;
  // Hidden-window RAF may stall; render and focus locally before showing this
  // independent renderer while the main renderer remains blocked in sendSync.
  (payload.kind === 'confirm' ? cancel : accept).focus();
  bridge.show();
}).catch(() => respond(false));
