import PanelDivider from './PanelDivider';
import type {ComponentProps} from 'react';

type Props=ComponentProps<typeof PanelDivider>&{
  name:string;
  collapsed:boolean;
  onToggle:()=>void;
  resizable?:boolean;
};

export default function DiagramDrawerRail({name,collapsed,onToggle,resizable=true,...divider}:Props){
  const left=divider.side==='left';
  const action=collapsed?'展开'+name:(left?'向左收起':'向右收起')+name;
  return <div className={'diagram-drawer-rail '+(left?'diagram-tools-drawer-rail':'diagram-cp-drawer-rail')}>
    {!collapsed&&resizable&&<PanelDivider {...divider}/>}
    <button type="button" aria-label={action} title={action} aria-expanded={!collapsed} onClick={onToggle}>
      <svg aria-hidden="true" width="10" height="14" viewBox="0 0 10 14" fill="none"><path d={left?'m7 3-4 4 4 4':'m3 3 4 4-4 4'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </button>
  </div>;
}
