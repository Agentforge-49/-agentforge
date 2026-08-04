export function shouldReloadPreloadError(lastReload, now = Date.now(), cooldownMs = 15_000) {
  const previous = Number(lastReload || 0)
  return !Number.isFinite(previous) || now - previous > cooldownMs
}
