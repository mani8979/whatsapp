import { EventEmitter } from 'events';

// Create a single shared event broker instance
const eventBus = new EventEmitter();

export default eventBus;
