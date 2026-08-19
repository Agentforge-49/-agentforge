export function appConnectionPath(app) {
  const slug = String(app?.slug || '')
  const mode = app?.mode === 'native' ? 'native' : 'universal'
  if (!/^[a-z0-9][a-z0-9_-]{0,99}$/.test(slug)) throw new Error('App identifier is invalid')
  return `/credentials?app=${encodeURIComponent(slug)}&mode=${mode}`
}
