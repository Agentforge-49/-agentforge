export function renderNavLinkChildren(children, isActive) {
  return typeof children === 'function' ? children({ isActive }) : children
}
