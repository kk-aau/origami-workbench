import {useId,useState} from 'react';
import type {Doc} from '../core/types';
import type {Tool} from '../app/tools';
import type {BackgroundView} from '../app/backgroundAnchor';
import BackgroundPanel from './BackgroundPanel';
import './CanvasBackgroundSettings.css';

export default function CanvasBackgroundSettings({doc,view,tool,onChange,onTool}:{doc:Doc;view:BackgroundView|null;tool:Tool;onChange:(doc:Doc)=>boolean;onTool:(tool:Tool)=>void}){
  const bodyId=useId(),[collapsed,setCollapsed]=useState(false);
  return <div className="canvas-settings-panel canvas-background-settings">
    <section className={'canvas-settings-section'+(collapsed?' is-collapsed':'')}>
      <div className="canvas-background-heading"><h3><button type="button" className="canvas-section-toggle" aria-expanded={!collapsed} aria-controls={bodyId} onClick={()=>setCollapsed(value=>!value)}><svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d={collapsed?'m4 2 4 4-4 4':'m2 4 4 4 4-4'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>底图</button></h3></div>
      <div id={bodyId} className="canvas-settings-body" hidden={collapsed}>
        <BackgroundPanel compact doc={doc} view={view} activeTool={tool} onTool={onTool} onChange={onChange} onPosition={()=>onTool('backgroundposition')}/>
      </div>
    </section>
  </div>;
}
