import {readBaseDesignBank,summarizeBaseDesignBank} from '../app/baseDesignLibrary';
const scope=globalThis as unknown as {onmessage:((event:MessageEvent<string>)=>void)|null;postMessage:(message:unknown)=>void};
scope.onmessage=event=>{try{const bank=readBaseDesignBank(event.data);scope.postMessage({bank,summaries:summarizeBaseDesignBank(bank)});}catch(error){scope.postMessage({error:error instanceof Error?error.message:String(error)});}};
