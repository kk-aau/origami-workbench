import {upgradeProject} from '../core/project';
import {validateDoc,type Doc} from '../core/types';
import {splitEditableSegments} from './planarize';

/** Prepare a detached document for an ordinary editor history frame. This is
 * an explicit source handoff, not a material edit against the previous CP. */
export function prepareDiagramEditorCP(source:Doc):Doc {
  const doc=splitEditableSegments(upgradeProject(structuredClone(source)));
  validateDoc(doc);return doc;
}
