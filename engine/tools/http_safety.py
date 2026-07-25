"""Guardrails for agent-controlled outbound HTTP requests."""

import ipaddress
import socket
from urllib.parse import urljoin, urlparse

import requests


REDIRECT_STATUSES = {301, 302, 303, 307, 308}
BLOCKED_HOSTNAMES = {"localhost", "localhost.localdomain"}


class UnsafeUrlError(ValueError):
    """Raised when a URL could reach a private or unsupported destination."""


def _validate_ip(address: str) -> None:
    ip = ipaddress.ip_address(address)
    if not ip.is_global:
        raise UnsafeUrlError("Private, local, or reserved network addresses are blocked")


def validate_public_url(url: str) -> str:
    """Return a normalized URL after ensuring its host resolves publicly."""
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise UnsafeUrlError("Only http and https URLs are allowed")
    if not parsed.hostname:
        raise UnsafeUrlError("A valid hostname is required")
    if parsed.username or parsed.password:
        raise UnsafeUrlError("Credentials in URLs are not allowed")

    hostname = parsed.hostname.rstrip(".").lower()
    if hostname in BLOCKED_HOSTNAMES or hostname.endswith((".local", ".internal")):
        raise UnsafeUrlError("Local and internal hostnames are blocked")

    try:
        _validate_ip(hostname)
        return url
    except ValueError:
        pass

    try:
        addresses = socket.getaddrinfo(hostname, parsed.port or 443, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise UnsafeUrlError("The hostname could not be resolved") from exc

    if not addresses:
        raise UnsafeUrlError("The hostname could not be resolved")
    for address in addresses:
        _validate_ip(address[4][0])

    return url


def safe_request(method: str, url: str, *, max_redirects: int = 3, **kwargs):
    """Request a public URL while validating every redirect destination."""
    session = requests.Session()
    session.trust_env = False
    current_method = method.upper()
    current_url = url

    try:
        for redirect_count in range(max_redirects + 1):
            validate_public_url(current_url)
            response = session.request(
                current_method,
                current_url,
                allow_redirects=False,
                **kwargs,
            )

            if response.status_code not in REDIRECT_STATUSES:
                return response

            location = response.headers.get("Location")
            if not location:
                return response
            if redirect_count == max_redirects:
                response.close()
                raise UnsafeUrlError("Too many redirects")

            next_url = urljoin(current_url, location)
            response.close()
            validate_public_url(next_url)
            current_url = next_url
            if response.status_code == 303:
                current_method = "GET"
                kwargs.pop("data", None)
                kwargs.pop("json", None)
    finally:
        session.close()
