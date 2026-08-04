export function renderNavLinkChildren(children, isActive) {
  return typeof children === 'function' ? children({ isActive }) : children
}

export function renderNavLinkProp(value, isActive) {
  return typeof value === 'function' ? value({ isActive }) : value
}
