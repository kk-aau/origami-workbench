export type DesktopDocumentWorkspace='edit'|'design'|'tess'|'sim'|'diagram';
export type DesktopDocumentLayout='tabs'|'horizontal'|'vertical'|'grid';
export type DesktopDocumentCommand='open'|'new'|'save'|'save-file'|'save-file-as'|'save-artwork'|'save-crease'|'undo'|'redo'|'library'|'artwork-overview'|'export'|'settings'|'print'|`workspace:${DesktopDocumentWorkspace}`;
export interface DesktopDocumentBounds {id:string;x:number;y:number;width:number;height:number;visible:boolean}
export interface DesktopDocumentInfo {hasEditorCP?:boolean;home?:boolean;id:string;title:string;windowId:string;active:boolean;dirty:boolean;busy:boolean;saving:boolean;ready:boolean;workspace:DesktopDocumentWorkspace;visible:boolean;bounds:Omit<DesktopDocumentBounds,'id'|'visible'>|null}
export interface DesktopDocumentWindow {workspace:DesktopDocumentWorkspace;id:string;title:string;documentIds:string[];activeId:string|null;layout:DesktopDocumentLayout}
export interface DesktopDocumentSnapshot {windowId:string;revision:number;windows:DesktopDocumentWindow[];documents:DesktopDocumentInfo[]}
export interface DesktopDocumentMetadata {hasEditorCP?:boolean;title?:string;workspace?:DesktopDocumentWorkspace;dirty?:boolean;busy?:boolean;saving?:boolean;ready?:boolean}
export interface DesktopDocumentMenuItem {id:string;label:string;enabled?:boolean;checked?:boolean;separator?:boolean}
export interface DesktopDocuments {
  checkUpdate:()=>Promise<{current:string;latest:string;available:boolean}>;
  openReleasePage:()=>Promise<void>;
  getContext:()=>Promise<{role:'shell'|'document';documentId:string|null;windowId:string}>;
  list:()=>Promise<DesktopDocumentSnapshot>;
  activate:(id:string)=>Promise<void>;
  setBounds:(rects:DesktopDocumentBounds[],viewport:{width:number;height:number})=>Promise<void>;
  openWorkspace:(workspace:DesktopDocumentWorkspace,initialCommand?:'open'|'new',transfer?:string,libraryKey?:string,returnToOrigin?:boolean)=>Promise<{windowId:string;id:string;alreadyOpen?:boolean}>;
  openCPPreview:(phase:'before'|'after',token:string)=>Promise<void>;
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
export type DesktopExportResult={status:'saved';path:string;binding?:string}|{status:'cancelled'};
export interface DesktopExportOptions {projectFile?:boolean;binding?:string;signal?:AbortSignal;onProgress?:(written:number,total:number)=>void}
export interface DesktopBlenderAnimationOptions extends DesktopExportOptions {step?:string;onCommit?:()=>void}
declare global {
  interface Window {
    cpWindowAction?:(action:'state'|'pin'|'unpin'|'drag'|'maximize'|'minimize'|'close')=>Promise<boolean>;
    desktop?: {
      isDesktop: true;
      role?: 'shell'|'document';
      documentId?:string|null;
      documents?:DesktopDocuments;
      ready?: (errorPage?:boolean) => void;
      openProject?: (kind:'associated'|'project'|'crease'|'diagram'|'design'|'tool-layout') => Promise<{name:string;binding?:string;bytes:Uint8Array<ArrayBuffer>}|null>;
      preferences: import('./app/preferenceStorage').Preferences;
      storage: {pickDirectory:(kind:'projectsDir'|'diagramsDir'|'dataDir')=>Promise<{cancelled:boolean;selectionId?:string;path?:string}>};
      print: () => Promise<{success:boolean;failureReason?:string}>;
      openDataDirectory?: () => Promise<void>;
      saveNamedDiagram?: (name:string,encode:(filename:string)=>Promise<Blob>) => Promise<DesktopExportResult>;
      verifyProjectFile?: (binding:string) => Promise<string>;
      saveExport?: (blob:Blob,name:string,options?:DesktopExportOptions) => Promise<DesktopExportResult>;
      sendToBlender?: (blob:Blob) => Promise<{status:'launched'}>;
      sendAnimationToBlender?: (blob:Blob,options?:DesktopBlenderAnimationOptions) => Promise<{status:'launched'|'linked'|'updated'|'cancelled'}>;
      blenderStepIsOpen?: (step:string) => Promise<boolean>;
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
