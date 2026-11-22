import {useMemo,useState} from 'react';
import {preferenceStorage} from '../app/preferenceStorage';

export function useDiagramDrawer(side:'tools'|'cp', width:number) {
  const size=width>0&&width<680?'narrow':width>0&&width<900?'medium':'wide';
  const key='zhezhi.diagram-'+side+'-'+size+'.v1';
  const [overrides,setOverrides]=useState<Record<string,boolean>>({});
  const stored=useMemo(()=>{try{return preferenceStorage.getItem(key);}catch{return null;}},[key]);
  const automatic=size==='narrow'||size==='medium'&&side==='cp';
  const collapsed=overrides[key]??(stored==='closed'?true:stored==='open'?false:automatic);
  function setCollapsed(value:boolean|((old:boolean)=>boolean),remember=true){
    const next=typeof value==='function'?value(collapsed):value;
    setOverrides(existing=>({...existing,[key]:next}));
    if(remember)try{preferenceStorage.setItem(key,next?'closed':'open');}catch{/* Keep the session choice. */}
  }
  return [collapsed,setCollapsed] as const;
}
