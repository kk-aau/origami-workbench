import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './ui/dialog.css';
import './components/applicationChrome.css';
import {connect} from './app/api';
import {initializeStoragePreferences} from './app/storageSettings';

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  render() { return this.state.failed ? <main className="fatal"><h1>工作台暂时无法显示</h1><p>已保存的工程不会被修改。请刷新页面，或从自动恢复副本继续。</p><button onClick={() => location.reload()}>重新打开工作台</button></main> : this.props.children; }
}
async function openWorkbench(){
  try{await connect();await initializeStoragePreferences();}catch{/* Older or offline services keep the existing local storage and recovery flow. */}
  createRoot(document.getElementById('root')!).render(<WorkbenchRoot />);
}
function WorkbenchRoot(){
  React.useLayoutEffect(()=>{window.desktop?.ready?.();},[]);
  return <ErrorBoundary><App /></ErrorBoundary>;
}
void openWorkbench();
