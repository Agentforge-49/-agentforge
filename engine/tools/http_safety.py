"""Guardrails for agent-controlled outbound HTTP requests."""

from dataclasses import dataclass
import http.client
import ipaddress
import socket
from typing import Mapping
from urllib.parse import urljoin, urlparse

import requests


REDIRECT_STATUSES = {301, 302, 303, 307, 308}
BLOCKED_HOSTNAMES = {"localhost", "localhost.localdomain"}
DEFAULT_MAX_RESPONSE_BYTES = 1_000_000


class UnsafeUrlError(ValueError):
    """Raised when a URL could reach a private or unsupported destination."""


@dataclass(frozen=True)
class SafeResponse:
    status_code: int
    headers: Mapping[str, str]
    content: bytes

    @property
    def text(self) -> str:
        content_type = self.headers.get("content-type", "")
        charset = "utf-8"
        if "charset=" in content_type:
            charset = content_type.split("charset=", 1)[1].split(";", 1)[0].strip()
        try:
            return self.content.decode(charset, errors="replace")
        except LookupError:
            return self.content.decode("utf-8", errors="replace")

    def close(self) -> None:
        return None


def _validate_ip(address: str) -> None:
    ip = ipaddress.ip_address(address)
    if not ip.is_global:
        raise UnsafeUrlError("Private, local, or reserved network addresses are blocked")


def _resolve_public_address(url: str):
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
        family = socket.AF_INET6 if ":" in hostname else socket.AF_INET
        return parsed, (family, hostname)
    except ValueError:
        pass

    try:
        addresses = socket.getaddrinfo(
            hostname,
            parsed.port or (443 if parsed.scheme == "https" else 80),
            type=socket.SOCK_STREAM,
        )
    except socket.gaierror as exc:
        raise UnsafeUrlError("The hostname could not be resolved") from exc

    if not addresses:
        raise UnsafeUrlError("The hostname could not be resolved")
    for address in addresses:
        _validate_ip(address[4][0])
    return parsed, (addresses[0][0], addresses[0][4][0])


def validate_public_url(url: str) -> str:
    """Return a URL after ensuring every resolved address is public."""
    _resolve_public_address(url)
    return url


def _read_bounded(response, max_response_bytes: int) -> bytes:
    declared_length = response.getheader("Content-Length")
    if declared_length and int(declared_length) > max_response_bytes:
        raise UnsafeUrlError("Response exceeded the maximum allowed size")
    chunks = []
    total = 0
    while True:
        chunk = response.read(min(65_536, max_response_bytes + 1 - total))
        if not chunk:
            break
        total += len(chunk)
        if total > max_response_bytes:
            raise UnsafeUrlError("Response exceeded the maximum allowed size")
        chunks.append(chunk)
    return b"".join(chunks)


def _request_once(method: str, url: str, *, max_response_bytes: int, **kwargs):
    parsed, (family, pinned_address) = _resolve_public_address(url)
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    timeout = kwargs.pop("timeout", 10)
    headers = dict(kwargs.pop("headers", {}) or {})
    body = kwargs.pop("data", None)
    if "json" in kwargs:
        import json

        body = json.dumps(kwargs.pop("json"))
        headers.setdefault("Content-Type", "application/json")
    if kwargs:
        raise TypeError(f"Unsupported request options: {', '.join(sorted(kwargs))}")

    connection_class = (
        http.client.HTTPSConnection if parsed.scheme == "https"
        else http.client.HTTPConnection
    )
    connection = connection_class(parsed.hostname, port, timeout=timeout)

    def create_pinned_connection(_address, connect_timeout=None, source_address=None):
        return socket.create_connection(
            (pinned_address, port),
            timeout=connect_timeout,
            source_address=source_address,
        )

    connection._create_connection = create_pinned_connection
    path = parsed.path or "/"
    if parsed.query:
        path += f"?{parsed.query}"
    try:
        connection.request(method, path, body=body, headers=headers)
        raw_response = connection.getresponse()
        content = _read_bounded(raw_response, max_response_bytes)
        return SafeResponse(
            status_code=raw_response.status,
            headers={key.lower(): value for key, value in raw_response.getheaders()},
            content=content,
        )
    except socket.timeout as exc:
        raise requests.exceptions.Timeout(str(exc)) from exc
    except OSError as exc:
        raise requests.exceptions.RequestException(str(exc)) from exc
    finally:
        connection.close()


def safe_request(
    method: str,
    url: str,
    *,
    max_redirects: int = 3,
    max_response_bytes: int = DEFAULT_MAX_RESPONSE_BYTES,
    **kwargs,
):
    """Request a public URL with a DNS-pinned connection and bounded response."""
    current_method = method.upper()
    current_url = url
    request_kwargs = dict(kwargs)

    for redirect_count in range(max_redirects + 1):
        response = _request_once(
            current_method,
            current_url,
            max_response_bytes=max_response_bytes,
            **request_kwargs,
        )
        if response.status_code not in REDIRECT_STATUSES:
            return response

        location = response.headers.get("location")
        if not location:
            return response
        if redirect_count == max_redirects:
            raise UnsafeUrlError("Too many redirects")
        current_url = urljoin(current_url, location)
        validate_public_url(current_url)
        if response.status_code == 303:
            current_method = "GET"
            request_kwargs.pop("data", None)
            request_kwargs.pop("json", None)

    raise UnsafeUrlError("Too many redirects")
