import type {Doc,Point} from '../core/types';
import {inspectMaterialTopology} from '../core/materialTopology';
import {resolveStartingFace} from './flatFoldSettings';
import {materialFrameMap} from '../core/materialFlatGeometry';

/** The contract's reference face and the user's active face are different
 * identities. Change basis explicitly; never relabel unchanged FF coordinates. */
export function materialViewFrame(doc:Doc){
 const m=inspectMaterialTopology(doc);if(!m.ok)throw new Error(m.reason);const root=resolveStartingFace(doc,m.graph);if(root.stale)throw new Error('材料起始面已失效，请先重新选择。');
 return {root:root.face,...materialFrameMap(m,root.face)};
}
