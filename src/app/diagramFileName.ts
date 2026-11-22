export function diagramFileName(path:string):string|undefined {
  const file=path.split(/[\\/]/).pop()??'';
  const stem=file.replace(/(?:\.diagram\.json|\.zds|\.json)$/i,'').trim();
  return stem&&stem.length<=160?stem:undefined;
}
