import { readdir, readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

const files = await readdir(new URL('../dist/assets/', import.meta.url))
const entry = files.find(name => /^index-[\w-]+\.js$/.test(name))
if (!entry) throw new Error('Built JavaScript entry was not found. Run npm run build first.')
const source = await readFile(new URL(`../dist/assets/${entry}`, import.meta.url))
const gzipBytes = gzipSync(source).byteLength
const budgetBytes = 180 * 1024
console.log(`Initial JavaScript: ${(gzipBytes / 1024).toFixed(1)} KB gzip (budget: 180 KB)`)
if (gzipBytes > budgetBytes) process.exitCode = 1
