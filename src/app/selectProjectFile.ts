/** Desktop uses a parented native chooser; browsers retain their file input. */
export async function selectProjectFile(input:Pick<HTMLInputElement,'click'>|null,kind:'crease'|'diagram'='crease'):Promise<File|null>{
  if(!window.desktop?.openProject){input?.click();return null;}
  const selected=await window.desktop.openProject(kind);
  return selected?new File([selected.bytes],selected.name):null;
}
