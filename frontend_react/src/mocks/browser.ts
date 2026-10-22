// src/mocks/browser.ts
import { setupWorker } from 'msw/browser';
import { handlers } from './handlers'
import {localMode} from '../config/development';
import {localHandlers, unhandledLocalApi} from './local';

export const worker = setupWorker(...(localMode ? [...localHandlers, ...handlers, unhandledLocalApi] : handlers));
