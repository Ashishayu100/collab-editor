import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';

describe('Yjs CRDT merge behavior', () => {
  it('merges concurrent inserts at the same position', () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    const text1 = doc1.getText('content');
    const text2 = doc2.getText('content');

    text1.insert(0, 'Hello');
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

    text1.insert(5, ' World');
    text2.insert(5, ' Earth');

    Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2));
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

    expect(text1.toString()).toBe(text2.toString());
    expect(text1.toString()).toContain('World');
    expect(text1.toString()).toContain('Earth');
  });

  it('handles a concurrent delete and insert at overlapping positions', () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    const text1 = doc1.getText('content');
    const text2 = doc2.getText('content');

    text1.insert(0, 'Hello World');
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

    text1.delete(6, 5); // remove "World"
    text2.insert(6, 'Beautiful '); // insert before "World"

    Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2));
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

    expect(text1.toString()).toBe(text2.toString());
  });

  it('converges after many rapid sequential edits from two peers', () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    const text1 = doc1.getText('content');
    const text2 = doc2.getText('content');

    for (let i = 0; i < 100; i++) {
      text1.insert(i, String.fromCharCode(97 + (i % 26)));
    }
    for (let i = 0; i < 100; i++) {
      text2.insert(i, String.fromCharCode(65 + (i % 26)));
    }

    Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2));
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

    expect(text1.toString()).toBe(text2.toString());
    expect(text1.toString().length).toBe(200);
  });

  it('converges with 5 concurrent editors under a full-mesh merge', () => {
    const docs = Array.from({ length: 5 }, () => new Y.Doc());
    const texts = docs.map((doc) => doc.getText('content'));

    texts[0].insert(0, 'Alice says hi. ');
    texts[1].insert(0, 'Bob was here. ');
    texts[2].insert(0, 'Carol joined. ');
    texts[3].insert(0, 'Dave editing. ');
    texts[4].insert(0, 'Eve watching. ');

    for (let i = 0; i < docs.length; i++) {
      for (let j = 0; j < docs.length; j++) {
        if (i !== j) {
          Y.applyUpdate(docs[i], Y.encodeStateAsUpdate(docs[j]));
        }
      }
    }

    const expected = texts[0].toString();
    for (let i = 1; i < docs.length; i++) {
      expect(texts[i].toString()).toBe(expected);
    }

    ['Alice', 'Bob', 'Carol', 'Dave', 'Eve'].forEach((name) => {
      expect(expected).toContain(name);
    });
  });

  it('supports incremental sync via state-vector diffing', () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    const text1 = doc1.getText('content');
    const text2 = doc2.getText('content');

    text1.insert(0, 'Hello ');

    const sv2 = Y.encodeStateVector(doc2);
    const diff = Y.encodeStateAsUpdate(doc1, sv2);
    Y.applyUpdate(doc2, diff);
    expect(text2.toString()).toBe('Hello ');

    text2.insert(6, 'World');

    const sv1 = Y.encodeStateVector(doc1);
    const diff2 = Y.encodeStateAsUpdate(doc2, sv1);
    Y.applyUpdate(doc1, diff2);
    expect(text1.toString()).toBe('Hello World');
  });

  it('merges XmlFragment content (the structure TipTap actually uses)', () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    const frag1 = doc1.getXmlFragment('default');
    const frag2 = doc2.getXmlFragment('default');

    const para = new Y.XmlElement('paragraph');
    const text = new Y.XmlText();
    text.insert(0, 'Hello from TipTap');
    para.insert(0, [text]);
    frag1.insert(0, [para]);

    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

    expect(frag2.length).toBe(1);
    expect(frag2.get(0).toString()).toContain('Hello from TipTap');
  });

  it('two peers concurrently editing separate XmlFragment paragraphs converge', () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();
    const frag1 = doc1.getXmlFragment('default');

    const para1 = new Y.XmlElement('paragraph');
    para1.insert(0, [new Y.XmlText('Paragraph one')]);
    frag1.insert(0, [para1]);
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

    const frag2 = doc2.getXmlFragment('default');

    // doc1 appends a second paragraph.
    const para2 = new Y.XmlElement('paragraph');
    para2.insert(0, [new Y.XmlText('Paragraph two')]);
    frag1.insert(1, [para2]);

    // doc2 concurrently edits the text inside the first paragraph.
    const existingText = frag2.get(0) as Y.XmlElement;
    (existingText.get(0) as Y.XmlText).insert(9, ' EDITED');

    Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2));
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

    expect(frag1.toString()).toBe(frag2.toString());
    expect(frag1.length).toBe(2);
    expect(frag1.toString()).toContain('EDITED');
    expect(frag1.toString()).toContain('Paragraph two');
  });

  it('round-trips through binary serialization exactly as stored in Postgres', () => {
    const doc1 = new Y.Doc();
    doc1.getText('content').insert(0, 'Test content for serialization');

    const binary = Y.encodeStateAsUpdate(doc1);
    expect(binary).toBeInstanceOf(Uint8Array);
    expect(binary.length).toBeGreaterThan(0);

    const doc2 = new Y.Doc();
    Y.applyUpdate(doc2, binary);
    expect(doc2.getText('content').toString()).toBe('Test content for serialization');
  });

  it('merging two empty documents does not throw and stays empty', () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2));
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

    expect(doc1.getText('content').toString()).toBe('');
    expect(doc2.getText('content').toString()).toBe('');
  });

  it('converges identically regardless of update application order', () => {
    const doc1 = new Y.Doc();
    const text1 = doc1.getText('content');

    const updates: Uint8Array[] = [];
    doc1.on('update', (update: Uint8Array) => updates.push(update));

    text1.insert(0, 'A');
    text1.insert(1, 'B');
    text1.insert(2, 'C');
    text1.insert(3, 'D');

    const forward = new Y.Doc();
    updates.forEach((u) => Y.applyUpdate(forward, u));

    const reverse = new Y.Doc();
    [...updates].reverse().forEach((u) => Y.applyUpdate(reverse, u));

    expect(forward.getText('content').toString()).toBe('ABCD');
    expect(reverse.getText('content').toString()).toBe('ABCD');
  });

  it('is idempotent — re-applying the same update twice changes nothing further', () => {
    const doc1 = new Y.Doc();
    doc1.getText('content').insert(0, 'idempotent');
    const update = Y.encodeStateAsUpdate(doc1);

    const doc2 = new Y.Doc();
    Y.applyUpdate(doc2, update);
    Y.applyUpdate(doc2, update);
    Y.applyUpdate(doc2, update);

    expect(doc2.getText('content').toString()).toBe('idempotent');
  });
});
