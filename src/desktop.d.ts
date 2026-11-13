export type DesktopDocumentWorkspace='edit'|'design'|'tess'|'sim'|'diagram';
export type DesktopDocumentLayout='tabs'|'horizontal'|'vertical'|'grid';
export type DesktopDocumentCommand='open'|'new'|'save'|'save-artwork'|'save-crease'|'undo'|'redo'|'library'|'artwork-overview'|'export'|'settings'|'print'|`workspace:${DesktopDocumentWorkspace}`;
export interface DesktopDocumentBounds {id:string;x:number;y:number;width:number;height:number;visible:boolean}
export interface DesktopDocumentInfo {home?:boolean;id:string;title:string;windowId:string;active:boolean;dirty:boolean;busy:boolean;saving:boolean;ready:boolean;workspace:DesktopDocumentWorkspace;visible:boolean;bounds:Omit<DesktopDocumentBounds,'id'|'visible'>|null}
export interface DesktopDocumentWindow {workspace:DesktopDocumentWorkspace;id:string;title:string;documentIds:string[];activeId:string|null;layout:DesktopDocumentLayout}
export interface DesktopDocumentSnapshot {windowId:string;revision:number;windows:DesktopDocumentWindow[];documents:DesktopDocumentInfo[]}
export interface DesktopDocumentMetadata {title?:string;workspace?:DesktopDocumentWorkspace;dirty?:boolean;busy?:boolean;saving?:boolean;ready?:boolean}
export interface DesktopDocumentMenuItem {id:string;label:string;enabled?:boolean;checked?:boolean;separator?:boolean}
export interface DesktopDocuments {
  getContext:()=>Promise<{role:'shell'|'document';documentId:string|null;windowId:string}>;
  list:()=>Promise<DesktopDocumentSnapshot>;
  activate:(id:string)=>Promise<void>;
  setBounds:(rects:DesktopDocumentBounds[])=>Promise<void>;
  openWorkspace:(workspace:DesktopDocumentWorkspace,initialCommand?:'open'|'new',transfer?:string,libraryKey?:string,returnToOrigin?:boolean)=>Promise<{windowId:string;id:string;alreadyOpen?:boolean}>;
  setLibraryIdentity:(key:string|null)=>Promise<void>;
  focusOrigin:()=>Promise<void>;
  close:(id:string)=>Promise<void>;
  sendCommand:(id:string,command:DesktopDocumentCommand)=>Promise<void>;
  report:(metadata:DesktopDocumentMetadata)=>Promise<void>;
  subscribe:(callback:(snapshot:DesktopDocumentSnapshot)=>void)=>()=>void;
  onCommand:(callback:(command:DesktopDocumentCommand)=>void)=>()=>void;
  popupMenu:(items:DesktopDocumentMenuItem[],position:{x:number;y:number})=>Promise<string|null>;
}
export interface DesktopWindowState {maximized:boolean;fullscreen:boolean}
export type DesktopExportResult={status:'saved';path:string}|{status:'cancelled'};
export interface DesktopExportOptions {signal?:AbortSignal;onProgress?:(written:number,total:number)=>void}
declare global {
  interface Window {
    desktop?: {
      isDesktop: true;
      role?: 'shell'|'document';
      documentId?:string|null;
      documents?:DesktopDocuments;
      ready?: () => void;
      openProject?: (kind:'crease'|'diagram'|'design'|'tool-layout') => Promise<{name:string;bytes:Uint8Array<ArrayBuffer>}|null>;
      preferences: import('./app/preferenceStorage').Preferences;
      storage: {pickDirectory:(kind:'projectsDir'|'diagramsDir'|'dataDir')=>Promise<{cancelled:boolean;selectionId?:string;path?:string}>};
      print: () => Promise<{success:boolean;failureReason?:string}>;
      openDataDirectory?: () => Promise<void>;
      saveExport?: (blob:Blob,name:string,options?:DesktopExportOptions) => Promise<DesktopExportResult>;
      window?: {
        getState: () => Promise<DesktopWindowState>;
        minimize: () => Promise<void>;
        toggleMaximize: () => Promise<void>;
        toggleFullscreen: () => Promise<void>;
        startDragging: () => Promise<void>;
        close: () => Promise<void>;
        onStateChanged: (callback:(state:DesktopWindowState)=>void) => () => void;
      };
      confirm?: (message:string) => boolean;
      onCommand: (callback:(command:'open'|'save'|'export'|'print'|'settings')=>void) => () => void;
    };
  }
}
