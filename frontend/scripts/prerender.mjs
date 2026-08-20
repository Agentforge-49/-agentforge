import { readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'vite'

const server = await createServer({ appType:'custom', server:{ middlewareMode:true } })
try {
  const { renderLanding } = await server.ssrLoadModule('/src/entry-prerender.jsx')
  const landing = renderLanding()
  const indexUrl = new URL('../dist/index.html', import.meta.url)
  const source = await readFile(indexUrl, 'utf8')
  const marker = '<div id="root"></div>'
  if (!source.includes(marker)) throw new Error('Production root marker was not found during prerendering.')
  await writeFile(indexUrl, source.replace(marker, `<div id="root">${landing}</div>`), 'utf8')
  console.log('Prerendered the public landing page into dist/index.html')
} finally {
  await server.close()
}
