import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url),locations=require('../../desktop/storageLocations.cjs'),original=locations.createStorageLocations;
// A private test process supplies a deterministic picker. Production receives
// only the native picker and exposes no path-registration HTTP endpoint.
locations.createStorageLocations=options=>original({...options,picker:async start=>path.join(process.env.ZHEZHI_STORAGE_TEST_ROOT,path.basename(start)==='projects'?'projectsDir':path.basename(start)==='diagrams'?'diagramsDir':'dataDir')});
await import('../../server.mjs');
