/** Search the existing paper identifiers without changing their physical order. */
export function filterDiagramLayerStackFaces(faces:readonly number[],query:string):number[] {
  const term=query.normalize('NFKC').replace(/\s+/g,'').toLowerCase();
  return faces.filter(face=>`f${face+1}`.includes(term));
}
