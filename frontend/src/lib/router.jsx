/* eslint-disable react-refresh/only-export-components */
import { forwardRef } from 'react'
import {
  Link as WouterLink,
  Redirect,
  Route as WouterRoute,
  Router,
  Switch,
  useLocation,
  useParams,
} from 'wouter'
import { renderNavLinkChildren, renderNavLinkProp } from './nav-link.js'

export const BrowserRouter = Router
export const Routes = Switch
export { useLocation, useParams }

export function Route({ element, ...props }) {
  return <WouterRoute {...props}>{element}</WouterRoute>
}

export function Navigate(props) {
  return <Redirect {...props} />
}

export function useNavigate() {
  const [, navigate] = useLocation()
  return navigate
}

export const Link = forwardRef(function Link(props, ref) {
  return <WouterLink ref={ref} {...props} />
})

export const NavLink = forwardRef(function NavLink({
  to,
  end = false,
  style,
  className,
  children,
  ...props
}, ref) {
  const [location] = useLocation()
  const isActive = location === to || (!end && to !== '/' && location.startsWith(`${to}/`))
  return (
    <WouterLink
      ref={ref}
      to={to}
      style={renderNavLinkProp(style, isActive)}
      className={renderNavLinkProp(className, isActive)}
      {...props}
    >
      {renderNavLinkChildren(children, isActive)}
    </WouterLink>
  )
})
