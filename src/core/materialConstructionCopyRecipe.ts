import type {Doc} from './types';
import {buildMaterialConstructionCopy,type MaterialConstructionCopyIntent} from '../app/materialConstructionCopy';
import {materialCopyGeometry} from './materialCopyRecipe';
export function buildMaterialConstructionCopyGeometry(doc:Doc,recipe:MaterialConstructionCopyIntent){return materialCopyGeometry(doc,recipe.segmentIds,buildMaterialConstructionCopy(doc,recipe));}
