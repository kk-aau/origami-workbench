/** Desktop messages share the application dialog style and restore editor focus. */
export function confirmAction(message:string):boolean {
  try {return (window.desktop?.confirm ? window.desktop.confirm(message) : window.confirm(message))===true;}
  catch {return false;}
}
