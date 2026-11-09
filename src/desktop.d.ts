export interface DesktopWindowState {maximized:boolean;fullscreen:boolean}
export type DesktopExportResult={status:'saved';path:string}|{status:'cancelled'};
export interface DesktopExportOptions {signal?:AbortSignal;onProgress?:(written:number,total:number)=>void}
declare global {
  interface Window {
    desktop?: {
      isDesktop: true;
      ready?: () => void;
      openProject?: (kind:'crease'|'diagram'|'design'|'tool-layout') => Promise<{name:string;bytes:Uint8Array<ArrayBuffer>}|null>;
      preferences: Pick<Storage,'getItem'|'setItem'>&{compareAndSet?:(key:string,expectedValue:string|null,value:string)=>boolean};
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
