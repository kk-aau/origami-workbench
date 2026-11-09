/** Explicit build target: a disconnected desktop must never become a web app. */
export const WEB_APP=import.meta.env?.VITE_WEB_APP==='true';
export const appAsset=(name:string)=>`${import.meta.env?.BASE_URL??'/'}${name.replace(/^\/+/, '')}`;
export const DESKTOP_DOWNLOAD='https://github.com/kk-aau/origami-workbench/releases/latest';
