import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';

import {
  assertKnowledgeFile,
  csvToKnowledgeText,
  extractKnowledgeFile,
  htmlToKnowledgeText,
  notionBlockText,
} from '../lib/knowledge-sources.js';

function minimalPdf(text) {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    null,
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let output = '%PDF-1.4\n';
  const offsets = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = Buffer.byteLength(output);
    output += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index += 1) {
    output += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output);
}

async function minimalDocx(text) {
  const archive = new JSZip();
  archive.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  archive.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  archive.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`);
  return archive.generateAsync({ type:'nodebuffer' });
}

test('website extraction drops hidden code and decodes readable content', () => {
  const text = htmlToKnowledgeText('<main><h1>Policy &amp; support</h1><script>steal()</script><p>Safe answer.</p></main>');
  assert.match(text, /Policy & support/);
  assert.match(text, /Safe answer/);
  assert.doesNotMatch(text, /steal/);
});

test('CSV extraction preserves quoted delimiters as readable rows', () => {
  assert.equal(csvToKnowledgeText('name,detail\nAgentForge,"safe, visible"'), 'name | detail\nAgentForge | safe, visible');
});

test('PDF and DOCX uploads extract bounded text', async () => {
  const pdf = await extractKnowledgeFile(minimalPdf('AgentForge PDF knowledge works'), {
    fileName:'guide.pdf', mimeType:'application/pdf',
  });
  assert.match(pdf.text, /AgentForge PDF knowledge works/);
  const docx = await extractKnowledgeFile(await minimalDocx('AgentForge DOCX knowledge works'), {
    fileName:'guide.docx',
    mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  assert.match(docx.text, /AgentForge DOCX knowledge works/);
});

test('file validation rejects spoofed and unsupported uploads', () => {
  assert.throws(() => assertKnowledgeFile(Buffer.from('not a pdf'), {
    fileName:'fake.pdf', mimeType:'application/pdf',
  }), /valid PDF/);
  assert.throws(() => assertKnowledgeFile(Buffer.from('binary'), {
    fileName:'archive.zip', mimeType:'application/zip',
  }), /Supported files/);
});

test('Notion blocks become citation-ready plain text', () => {
  assert.equal(notionBlockText({
    type:'paragraph',
    paragraph:{ rich_text:[{ plain_text:'Approved policy' }] },
  }), 'Approved policy');
  assert.equal(notionBlockText({
    type:'table_row',
    table_row:{ cells:[[{ plain_text:'Plan' }], [{ plain_text:'Free' }]] },
  }), 'Plan | Free');
});

