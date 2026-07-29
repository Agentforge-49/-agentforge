import assert from 'node:assert/strict';
import test from 'node:test';

import { chunkDocument, formatKnowledgeContext } from '../lib/knowledge.js';

test('knowledge chunking is deterministic, bounded, and overlapping', () => {
  const input = `${'Alpha sentence. '.repeat(100)}\n\n${'Beta sentence. '.repeat(80)}`;
  const first = chunkDocument(input, { maxChars:400, overlap:50 });
  const second = chunkDocument(input, { maxChars:400, overlap:50 });
  assert.deepEqual(first, second);
  assert.ok(first.length > 2);
  assert.ok(first.every((chunk, index) => (
    chunk.chunk_index === index
    && chunk.content.length <= 400
    && chunk.token_estimate === Math.ceil(chunk.content.length / 4)
  )));
});

test('knowledge context produces stable numbered citations', () => {
  assert.equal(formatKnowledgeContext([
    { title:'Policy', content:'Refunds take five days.' },
    { title:'Guide', content:'Contact support for help.' },
  ]), '[1] Policy\nRefunds take five days.\n\n[2] Guide\nContact support for help.');
});

test('empty documents produce no chunks and invalid overlap is rejected', () => {
  assert.deepEqual(chunkDocument('  '), []);
  assert.throws(
    () => chunkDocument('text', { maxChars:200, overlap:200 }),
    /overlap/,
  );
});
