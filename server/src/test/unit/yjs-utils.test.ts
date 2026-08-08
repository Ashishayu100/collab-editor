import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import {
  createEmptyYDocState,
  decodeBase64ToBuffer,
  encodeBufferToBase64,
  isValidYjsState,
  mergeYjsState,
  compactYjsState,
} from '../../utils/yjs';

describe('createEmptyYDocState', () => {
  it('produces a Buffer decodable into an empty Y.Doc', () => {
    const state = createEmptyYDocState();
    expect(Buffer.isBuffer(state)).toBe(true);

    const doc = new Y.Doc();
    Y.applyUpdate(doc, state);
    expect(doc.getXmlFragment('default').length).toBe(0);
  });
});

describe('base64 <-> Buffer round-trip', () => {
  it('encodes and decodes symmetrically', () => {
    const original = Buffer.from([1, 2, 3, 250, 255, 0]);
    const base64 = encodeBufferToBase64(original);
    const decoded = decodeBase64ToBuffer(base64);
    expect(decoded).toEqual(original);
  });
});

describe('isValidYjsState', () => {
  it('accepts a real Yjs update encoded as base64', () => {
    const doc = new Y.Doc();
    doc.getText('content').insert(0, 'hello');
    const base64 = Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64');
    expect(isValidYjsState(base64)).toBe(true);
  });

  it('accepts an empty document state', () => {
    const base64 = createEmptyYDocState().toString('base64');
    expect(isValidYjsState(base64)).toBe(true);
  });

  it('rejects garbage bytes that are not a Yjs update', () => {
    const base64 = Buffer.from('this is definitely not a yjs update').toString('base64');
    expect(isValidYjsState(base64)).toBe(false);
  });

  it('rejects non-base64 garbage', () => {
    expect(isValidYjsState('%%%not-base64%%%')).toBe(false);
  });
});

describe('mergeYjsState', () => {
  it('merges an update into null existing state (first save)', () => {
    const doc = new Y.Doc();
    doc.getText('content').insert(0, 'first save');
    const update = Buffer.from(Y.encodeStateAsUpdate(doc));

    const merged = mergeYjsState(null, update);

    const check = new Y.Doc();
    Y.applyUpdate(check, merged);
    expect(check.getText('content').toString()).toBe('first save');
  });

  it('merges an update into existing state, preserving both', () => {
    const doc1 = new Y.Doc();
    doc1.getText('content').insert(0, 'Hello');
    const existing = Buffer.from(Y.encodeStateAsUpdate(doc1));

    const doc2 = new Y.Doc();
    Y.applyUpdate(doc2, existing);
    doc2.getText('content').insert(5, ' World');
    const update = Buffer.from(Y.encodeStateAsUpdate(doc2, Y.encodeStateVector(doc1)));

    const merged = mergeYjsState(existing, update);

    const check = new Y.Doc();
    Y.applyUpdate(check, merged);
    expect(check.getText('content').toString()).toBe('Hello World');
  });
});

describe('compactYjsState', () => {
  it('preserves document content while garbage-collecting tombstones', () => {
    const doc = new Y.Doc();
    const text = doc.getText('content');
    text.insert(0, 'Hello World');
    text.delete(5, 6); // delete " World" to generate tombstoned history
    text.insert(5, '!');
    const state = Buffer.from(Y.encodeStateAsUpdate(doc));

    const compacted = compactYjsState(state);

    const check = new Y.Doc();
    Y.applyUpdate(check, compacted);
    expect(check.getText('content').toString()).toBe('Hello!');
  });
});
