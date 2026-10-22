import {register} from 'node:module';

register('./ts-ext-resolver.mjs', import.meta.url);
register('./raw-json-test-loader.mjs', import.meta.url);
