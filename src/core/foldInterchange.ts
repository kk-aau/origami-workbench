/** Core geometry shared by FOLD readers, including Oriedita's strict reader.
 * Derived adjacency and workbench material data stay in a namespaced extension. */
const sharedFields=new Set(['file_spec','file_creator','file_author','file_title','file_description','file_classes','frame_author','frame_title','frame_description','frame_classes','frame_attributes','frame_unit','vertices_coords','edges_vertices','edges_assignment','edges_foldAngle','faces_vertices','faces_edges']);
const extensionKey='zhezhi:workbench';
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const split=(raw:Record<string,unknown>)=>{
  const standard:Record<string,unknown>={},extra:Record<string,unknown>={};
  for(const [key,value] of Object.entries(raw)){
    if(key==='file_frames')continue;
    (sharedFields.has(key)?standard:extra)[key]=value;
  }
  return{standard,extra};
};

export function exportFoldInterchange(raw:Record<string,unknown>):Record<string,unknown>{
  const {standard,extra}=split(raw);
  const frames=Array.isArray(raw.file_frames)?raw.file_frames.map(frame=>split(frame as Record<string,unknown>)):undefined;
  return{...standard,...(frames?{file_frames:frames.map(frame=>frame.standard)}:{}),[extensionKey]:{version:1,fields:extra,...(frames?{frames:frames.map(frame=>frame.extra)}:{})}};
}

/** Old underscore extensions remain accepted. New fields cannot override the
 * standard geometry: material import checks its saved copy against that graph. */
export function importFoldInterchange(raw:Record<string,unknown>):Record<string,unknown>{
  if(!Object.hasOwn(raw,extensionKey))return raw;
  const extension=raw[extensionKey];
  if(!record(extension)||extension.version!==1||!record(extension.fields))throw new Error('FOLD 工坊扩展版本或内容无效。');
  const check=(value:unknown):Record<string,unknown>=>{
    if(!record(value)||Object.keys(value).some(key=>sharedFields.has(key)||key==='file_frames'||key===extensionKey))throw new Error('FOLD 工坊扩展不能覆盖标准几何字段。');
    return value;
  };
  const restored={...check(extension.fields),...raw};delete restored[extensionKey];
  if(extension.frames!==undefined){
    if(!Array.isArray(extension.frames)||!Array.isArray(raw.file_frames)||extension.frames.length!==raw.file_frames.length)throw new Error('FOLD 工坊帧扩展与文件帧不一致。');
    const frameExtras=extension.frames;
    restored.file_frames=raw.file_frames.map((frame,index)=>{
      if(!record(frame))throw new Error('FOLD 文件帧无效。');
      return{...check(frameExtras[index]),...frame};
    });
  }
  return restored;
}
