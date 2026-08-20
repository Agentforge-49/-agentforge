import { preview } from 'vite'
import lighthouse from 'lighthouse'
import { launch } from 'chrome-launcher'

const server = await preview({ preview:{ host:'127.0.0.1', port:0, strictPort:false } })
const address = server.httpServer.address()
const port = typeof address === 'object' && address ? address.port : 4174
let chrome
try {
  chrome = await launch({ chromeFlags:['--headless=new', '--no-sandbox', '--disable-gpu'] })
  const result = await lighthouse(`http://127.0.0.1:${port}/`, {
    port:chrome.port,
    formFactor:'desktop',
    screenEmulation:{ mobile:false, width:1350, height:940, deviceScaleFactor:1, disabled:false },
    throttlingMethod:'simulate',
    throttling:{ rttMs:40, throughputKbps:10240, cpuSlowdownMultiplier:1 },
    output:'json',
    logLevel:'error',
    onlyCategories:['performance', 'accessibility', 'best-practices', 'seo'],
  })
  const report = result.lhr
  const scores = Object.fromEntries(Object.entries(report.categories).map(([key, value]) => [key, value.score]))
  const lcp = report.audits['largest-contentful-paint'].numericValue
  const fcp = report.audits['first-contentful-paint'].numericValue
  const cls = report.audits['cumulative-layout-shift'].numericValue
  const tbt = report.audits['total-blocking-time'].numericValue
  const lcpBreakdown = report.audits['lcp-breakdown-insight']?.details?.items
  console.log(JSON.stringify({ scores, fcp_ms:Math.round(fcp), lcp_ms:Math.round(lcp), cls:Number(cls.toFixed(3)), tbt_ms:Math.round(tbt), lcp_breakdown:lcpBreakdown }, null, 2))
  const failed = scores.performance < .80 || scores.accessibility < .95 ||
    scores['best-practices'] < .90 || scores.seo < .90 || lcp > 2500 || cls > .1 || tbt > 200
  if (failed) process.exitCode = 1
} finally {
  try { await chrome?.kill() } catch (error) {
    if (error?.code !== 'EPERM') throw error
  }
  await server.close()
}
