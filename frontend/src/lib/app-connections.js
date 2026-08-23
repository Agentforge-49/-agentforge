export function appConnectionPath(app) {
  const slug = String(app?.slug || '')
  const mode = app?.mode === 'native' ? 'native' : 'universal'
  if (!/^[a-z0-9][a-z0-9_-]{0,99}$/.test(slug)) throw new Error('App identifier is invalid')
  return `/credentials?app=${encodeURIComponent(slug)}&mode=${mode}`
}

const SHARED_PROVIDERS = {
  google_sheets:'google', google_drive:'google', gmail:'google', google_calendar:'google',
  microsoft_outlook:'microsoft', microsoft_teams:'microsoft',
}

export function connectionProviderForApp(app) {
  const slug = String(app?.slug || '').toLowerCase()
  return SHARED_PROVIDERS[slug] || slug
}

export function isAppConnected(app, providers) {
  if (!providers?.has) return false
  return providers.has(app.slug) || providers.has(connectionProviderForApp(app))
}
