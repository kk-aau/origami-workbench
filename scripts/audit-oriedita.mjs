// Read-only source inventory. Always inspect the upstream commit, not local Java edits.
// This counts identifiers and UI references, NOT verified tools or product parity.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repo = fileURLToPath(new URL('../../zhezhi/', import.meta.url));
const commit = '0891f8e8133ddf3aba8c6ec8a2b1ef565a0ea86e';
const git = (...args) => execFileSync('git', ['-C', repo, ...args], {
  encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true,
});
const read = file => git('show', `${commit}:${file}`);
const actionFile = 'oriedita-ui/src/main/java/oriedita/editor/action/ActionType.java';
const modeFile = 'oriedita-common/src/main/java/oriedita/editor/canvas/MouseMode.java';
const actions = [...read(actionFile).matchAll(/^\s*(\w+)\("([^"]+)"\)[,;]/gm)]
  .map(([, enumName, id]) => ({ enumName, id }));
const modes = [...read(modeFile).matchAll(/^\s*([A-Z][A-Z0-9_]+)\((\d+)\)[,;]/gm)]
  .map(([, name, value]) => ({ name, value: Number(value), unused: name.startsWith('UNUSED_') }));
if (!actions.length || !modes.length) throw new Error('Upstream enum format changed; audit parser needs review.');

const uiRoot = 'oriedita-ui/src/main/java/';
const uiFiles = git('ls-tree', '-r', '--name-only', commit, '--', uiRoot)
  .trim().split(/\r?\n/).filter(file => file.endsWith('.java'));
const uiReferences = [];
for (const file of uiFiles) {
  const source = read(file);
  // Only literal command IDs. Dynamic registrations/direct listeners require manual review.
  const patterns = [
    /\bsetActionCommand\(\s*"([A-Za-z0-9_]+)"\s*\)/g,
    /\bregisterButton\(\s*[^,\n]+,\s*"([A-Za-z0-9_]+)"/g,
  ];
  for (const pattern of patterns) for (const match of source.matchAll(pattern)) {
    uiReferences.push({
      id: match[1], file, line: source.slice(0, match.index).split('\n').length,
    });
  }
}
const enumIds = new Set(actions.map(action => action.id));
const uiIds = new Set(uiReferences.map(reference => reference.id));
const additionalUiIds = [...uiIds].filter(id => !enumIds.has(id)).sort();
const inventory = {
  baseline: { version: '1.1.3', commit, repository: path.resolve(repo) },
  limitations: 'Static enum/literal UI references only; not a count of working tools. Include direct listeners, preferences, file filters and handlers in manual review. UNUSED modes excluded from required behavior.',
  counts: {
    actionEnumIds: enumIds.size,
    mouseModes: modes.length,
    nonUnusedMouseModes: modes.filter(mode => !mode.unused).length,
    additionalLiteralUiIds: additionalUiIds.length,
    candidateCommandIds: new Set([...enumIds, ...uiIds]).size,
  },
  actions, modes, additionalUiIds, uiReferences,
};
console.log(JSON.stringify(process.argv.includes('--summary')
  ? { baseline: inventory.baseline, counts: inventory.counts, additionalUiIds, limitations: inventory.limitations }
  : inventory, null, 2));
