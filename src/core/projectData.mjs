// Project files retain all data; serialization has no application byte quota.
export function serializeProject(doc, pretty = false) {
  const value = {...doc, schemaVersion: 2, objects: doc.objects ?? [], format: 'zhezhi-workbench', version: 2};
  return JSON.stringify(value, null, pretty ? 2 : undefined);
}
