import {useEffect,useState,type MouseEvent} from 'react';
import type {DesktopWindowState} from '../desktop';
import './WindowControls.css';

/** Use only on the app's title bar. Form controls and menus retain normal input. */
export function handleDesktopTitlebarMouseDown(event:MouseEvent<HTMLElement>) {
  const host=window.desktop?.window;
  if(!host||event.button!==0||event.defaultPrevented)return;
  const target=event.target as Element;
  if(target.closest('button,input,select,textarea,a,summary,label,[role="button"],[role="menu"],[contenteditable="true"],[data-no-window-drag]'))return;
  event.preventDefault();
  void (event.detail===2?host.toggleMaximize():host.startDragging()).catch(console.error);
}

export default function WindowControls({onError}:{onError?:(message:string)=>void}) {
  const host=typeof window==='undefined'?undefined:window.desktop?.window;
  const [state,setState]=useState<DesktopWindowState>({maximized:false,fullscreen:false});
  const [error,setError]=useState('');
  useEffect(()=>{
    if(!host)return;
    let active=true;
    const update=(value:DesktopWindowState)=>{if(active)setState(value);};
    const off=host.onStateChanged(update);
    void host.getState().then(update).catch(()=>{});
    return()=>{active=false;off();};
  },[host]);
  if(!host)return null;
  const run=(action:()=>Promise<void>)=>{
    setError('');
    void action().catch(cause=>{const message='窗口操作未完成：'+(cause instanceof Error?cause.message:String(cause));setError(message);onError?.(message);});
  };
  const restore=state.maximized||state.fullscreen;
  const label=state.fullscreen?'退出全屏':state.maximized?'还原窗口':'最大化';
  return <div className="desktop-window-controls" data-no-window-drag="true" data-maximized={state.maximized} data-fullscreen={state.fullscreen}>
    <button type="button" aria-label="最小化" title="最小化" onClick={()=>run(host.minimize)}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10"/></svg></button>
    <button type="button" aria-label={label} title={label} onClick={()=>run(host.toggleMaximize)}><svg viewBox="0 0 16 16" aria-hidden="true">{restore?<path d="M5 5V3h8v8h-2M3 5h8v8H3Z"/>:<path d="M3 3h10v10H3Z"/>}</svg></button>
    <button type="button" className="desktop-window-close" aria-label="关闭窗口" title="关闭窗口" onClick={()=>run(host.close)}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 3 10 10M3 13 13 3"/></svg></button>
    {error&&!onError&&<span className="desktop-window-error" role="alert">{error}</span>}
  </div>;
}
