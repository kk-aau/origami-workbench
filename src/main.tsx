import React from 'react';
import { createRoot } from 'react-dom/client';
import DocumentWindowShell from './components/DocumentWindowShell';
import './styles.css';
import './ui/dialog.css';
import './components/applicationChrome.css';
import './components/tabletLayout.css';
import {connect} from './app/api';
import {initializeStoragePreferences} from './app/storageSettings';
import {WEB_APP} from './app/webRuntime';
const App=React.lazy(()=>import('./App'));

function StartupFailure({message}:{message:string}){
  React.useLayoutEffect(()=>{window.desktop?.ready?.(true);},[]);
  return <main className="fatal" role="alert"><h1>暂时无法打开本地工作台</h1><p>{message}</p><button onClick={()=>location.reload()}>重新打开</button></main>;
}

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  render() { return this.state.failed ? <main className="fatal"><h1>工作台暂时无法显示</h1><p>已保存的工程不会被修改。请刷新页面，或从自动恢复副本继续。</p><button onClick={() => location.reload()}>重新打开工作台</button></main> : this.props.children; }
}
async function openWorkbench(){
  try{await connect();await initializeStoragePreferences();}catch(error){
    if(WEB_APP||window.desktop?.preferences?.cacheOnly){createRoot(document.getElementById('root')!).render(<StartupFailure message={error instanceof Error?error.message:String(error)}/>);return;}
    /* Older or offline services keep the existing local storage and recovery flow. */
  }
  createRoot(document.getElementById('root')!).render(<WorkbenchRoot />);
}
function WorkbenchRoot(){
  const workspace=new URLSearchParams(location.search).get('workspace');
  const documentView=window.desktop?.role==='document'||!!window.desktop?.documentId||!!workspace&&/^[a-f0-9-]{36}$/i.test(workspace);
  const shellView=!WEB_APP&&!documentView&&window.desktop?.role==='shell'&&!!window.desktop.documents;
  const managedDocument=documentView&&!!window.desktop?.documents;
  // Document App publishes ready only after its semantic command listener exists.
  React.useLayoutEffect(()=>{if(!managedDocument)window.desktop?.ready?.();},[managedDocument]);
  return <ErrorBoundary>{shellView?<DocumentWindowShell />:<React.Suspense fallback={<main className="fatal" role="status"><p>正在打开作品工作区…</p></main>}><App /></React.Suspense>}</ErrorBoundary>;
}
const previewToken=new URLSearchParams(location.search).get('cpPreview');
if(previewToken&&/^[a-f0-9-]{36}$/i.test(previewToken)){
  void import('./components/DiagramCPPreviewWindow').then(({default:Preview})=>{
    createRoot(document.getElementById('root')!).render(<ErrorBoundary><Preview token={previewToken}/></ErrorBoundary>);
  });
}else void openWorkbench();
