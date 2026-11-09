import type {Doc} from '../core/types';
import {buildDiagramFold} from '../core/geometry';
import {setStartingFace} from './flatFoldSettings';

/** Store a diagram's physical face, never a face created only by an F mark. */
export function setDiagramStartingFace(doc:Doc,index:number):Doc {
  return setStartingFace(doc,index,buildDiagramFold(doc).graph);
}
