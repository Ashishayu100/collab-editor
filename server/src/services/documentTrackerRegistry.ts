import { RedisDocumentTracker } from './RedisDocumentTracker';

let instance: RedisDocumentTracker | null = null;

/** Set once at server startup, after the RedisDocumentTracker is constructed. */
export function setDocumentTracker(tracker: RedisDocumentTracker): void {
  instance = tracker;
}

/** Read anywhere (e.g. REST controllers) that needs cross-server active-user counts. */
export function getDocumentTracker(): RedisDocumentTracker | null {
  return instance;
}
