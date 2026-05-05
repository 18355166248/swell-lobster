import { EventEmitter } from 'node:events';

export const notifyBus = new EventEmitter();
notifyBus.setMaxListeners(100);
