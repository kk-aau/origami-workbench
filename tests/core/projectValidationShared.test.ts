import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateDoc as client} from '../../src/core/types';
import {validateDoc as server} from '../../src/core/projectValidation.mjs';
test('客户端与Node存储边界使用同一个工程校验器',()=>{assert.equal(client,server);});
