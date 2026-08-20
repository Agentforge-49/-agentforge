import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('knowledge API exposes source sync, preview, deletion, and binary upload contracts', async () => {
  const source = await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8')

  assert.match(source, /\/api\/knowledge\/\$\{id\}\/sources/)
  assert.match(source, /\/sources\/\$\{sourceId\}\/sync/)
  assert.match(source, /\/documents\/\$\{documentId\}\/preview/)
  assert.match(source, /'Content-Type':'application\/octet-stream'/)
  assert.match(source, /'X-File-Name':encodeURIComponent\(file\.name\)/)
})

test('knowledge workspace limits uploads and presents every supported file type', async () => {
  const source = await readFile(new URL('../src/pages/Knowledge.jsx', import.meta.url), 'utf8')

  assert.match(source, /file\.size > 5_000_000/)
  assert.match(source, /accept="\.pdf,\.docx,\.csv,\.tsv,\.txt,\.md,\.json,\.xml"/)
  assert.match(source, /PDF, DOCX, CSV, TXT, Markdown, JSON, or XML/)
  assert.match(source, /syncKnowledgeSource/)
  assert.match(source, /getKnowledgeDocumentPreview/)
})
