import {parseBaseDesignFile} from '../app/baseDesignFile';
const scope=globalThis as unknown as {onmessage:((event:MessageEvent<string>)=>void)|null;postMessage:(message:unknown)=>void};
scope.onmessage=event=>{try{scope.postMessage({result:parseBaseDesignFile(event.data)});}catch(error){scope.postMessage({error:error instanceof Error?error.message:String(error)});}};
