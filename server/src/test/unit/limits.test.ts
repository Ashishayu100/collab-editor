import { describe, it, expect } from 'vitest';
import { DOCUMENT_LIMITS, WS_LIMITS, REDIS_PUBLISH_LIMITS } from '../../config/limits';

describe('DOCUMENT_LIMITS', () => {
  it('defines the expected title/content/comment ceilings', () => {
    expect(DOCUMENT_LIMITS.MAX_TITLE_LENGTH).toBe(200);
    expect(DOCUMENT_LIMITS.MAX_DOCUMENT_SIZE).toBe(5 * 1024 * 1024);
    expect(DOCUMENT_LIMITS.MAX_COMMENT_LENGTH).toBe(5000);
  });

  it('defines quota ceilings per document/user', () => {
    expect(DOCUMENT_LIMITS.MAX_COMMENTS_PER_DOCUMENT).toBe(500);
    expect(DOCUMENT_LIMITS.MAX_COLLABORATORS_PER_DOCUMENT).toBe(50);
    expect(DOCUMENT_LIMITS.MAX_FOLDERS_PER_USER).toBe(100);
    expect(DOCUMENT_LIMITS.MAX_DOCUMENTS_PER_USER).toBe(500);
  });
});

describe('WS_LIMITS', () => {
  it('defines message-rate and connection ceilings', () => {
    expect(WS_LIMITS.MAX_MESSAGE_SIZE).toBe(2 * 1024 * 1024);
    expect(WS_LIMITS.MAX_MESSAGES_PER_SECOND).toBeLessThan(WS_LIMITS.MAX_MESSAGES_PER_SECOND_HARD);
    expect(WS_LIMITS.MAX_CONNECTIONS_PER_IP).toBeGreaterThan(0);
    expect(WS_LIMITS.CONNECTION_RATE_LIMIT).toBeGreaterThan(0);
  });
});

describe('REDIS_PUBLISH_LIMITS', () => {
  it('defines batch/throttle windows', () => {
    expect(REDIS_PUBLISH_LIMITS.YJS_BATCH_WINDOW_MS).toBeGreaterThan(0);
    expect(REDIS_PUBLISH_LIMITS.AWARENESS_THROTTLE_MS).toBeGreaterThan(0);
  });
});
