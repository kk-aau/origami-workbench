import { validateDoc, type Doc } from './types';
import {hasMaterialTopology,inspectMaterialTopology} from './materialTopology';

export const PROJECT_VERSION = 2;

/** A pure, explicit migration. Never overwrites files or fills missing paper edges. */
export function upgradeProject(value: unknown): Doc {
  validateDoc(value);
  if(hasMaterialTopology(value)){
    const material=inspectMaterialTopology(value);
    if(!material.ok)throw new Error(material.reason);
  }
  return { ...structuredClone(value), schemaVersion: PROJECT_VERSION, objects: structuredClone(value.objects ?? []) };
}
