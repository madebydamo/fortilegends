"""Build the blog with MkDocs and serve the static files with nginx.

Production entrypoint of the Nix-built image (modules/packages/image.nix).
The content (mkdocs.yml + docs/) is mounted read-only at $SITE_SOURCE. On
start and a few seconds after any file there changes, `mkdocs build` writes a
fresh copy of the site into $SITE_WORK/build-<n>; the symlink
$SITE_WORK/current, nginx's document root, then switches to it in one step.
A failed build leaves the previous site online.

Telemetry (docs/APP-TELEMETRY.md in Neo): JSON log lines (MkDocs and nginx
output included), job "build", and the gauges below on $NEO_METRICS_PORT.

For writing posts or theme work use `mkdocs serve` (docker-compose.yml).
"""

from __future__ import annotations

import logging
import os
import re
import shutil
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path

from prometheus_client import Gauge

import neo_telemetry as tel

SOURCE = Path(os.environ.get("SITE_SOURCE", "/docs"))
WORK = Path(os.environ.get("SITE_WORK", "/tmp/site"))
PORT = int(os.environ.get("PORT", "8000"))
POLL_SECONDS = float(os.environ.get("SITE_POLL_SECONDS", "3"))
NGINX = os.environ.get("NGINX_BIN", "nginx")
MIME_TYPES = os.environ.get("NGINX_MIME_TYPES", "/etc/nginx/mime.types")
VERSION = os.environ.get("SITE_VERSION", "dev")

BUILD_OK = Gauge("fortilegends_build_ok", "1 when the last site build succeeded, 0 when it failed.")
BUILD_WARNINGS = Gauge("fortilegends_build_warnings", "Warnings (broken links, missing files) MkDocs reported in the last build.")
SITE_PAGES = Gauge("fortilegends_site_pages", "HTML pages in the published site.")
SITE_BYTES = Gauge("fortilegends_site_bytes", "Size of the published site, media included.")
PUBLISHED = Gauge("fortilegends_site_published_timestamp_seconds", "Unix time the current site version went online.")

log = logging.getLogger("site")
mkdocs_log = logging.getLogger("mkdocs")
nginx_log = logging.getLogger("nginx")

MKDOCS_LINE = re.compile(r"^(DEBUG|INFO|WARNING|ERROR|CRITICAL)\s+-\s+(.*)$")
NGINX_LINE = re.compile(r"\[(debug|info|notice|warn|error|crit|alert|emerg)\]")
NGINX_LEVELS = {
    "debug": logging.DEBUG,
    "info": logging.INFO,
    "notice": logging.INFO,
    "warn": logging.WARNING,
    "error": logging.ERROR,
    "crit": logging.CRITICAL,
    "alert": logging.CRITICAL,
    "emerg": logging.CRITICAL,
}

PLACEHOLDER = """<!doctype html>
<html lang="de-CH"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Forti-Legends</title></head>
<body style="font-family:sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem">
<h1>Forti-Legends</h1><p>D Siite wird grad neu baut. Probier's i es paar Minute nomal.</p>
</body></html>
"""

NGINX_CONF = """\
worker_processes 2;
pid {tmp}/nginx.pid;
error_log stderr warn;
daemon off;

events {{ worker_connections 1024; }}

http {{
  include {mime};
  default_type application/octet-stream;
  charset utf-8;
  charset_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml application/rss+xml image/svg+xml;

  # SWAG logs every request; a second access log adds nothing.
  access_log off;
  log_not_found off;
  server_tokens off;
  sendfile on;
  tcp_nopush on;
  client_body_temp_path {tmp}/body;
  proxy_temp_path {tmp}/proxy;
  fastcgi_temp_path {tmp}/fastcgi;
  uwsgi_temp_path {tmp}/uwsgi;
  scgi_temp_path {tmp}/scgi;

  gzip on;
  gzip_min_length 1024;
  gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml image/svg+xml;

  server {{
    listen {port};
    root {root};
    index index.html;
    # Behind SWAG: redirects (/2025 -> /2025/) must not carry this port.
    absolute_redirect off;
    error_page 404 /404.html;

    # Browser events (docs/APP-TELEMETRY.md, beacon). SWAG logs them; the
    # pattern keeps the event names short and bounded.
    location ^~ /_e/ {{
      add_header Cache-Control "no-store" always;
      location ~ "^/_e/[a-z_]{{1,32}}(/[a-z0-9._-]{{1,64}}){{0,2}}$" {{
        add_header Cache-Control "no-store" always;
        return 204;
      }}
      return 404;
    }}

    # Pages: always ask whether there is a newer version (cheap 304).
    location / {{
      add_header Cache-Control "no-cache";
      try_files $uri $uri/ =404;
    }}

    # Theme code: may change with a plugin update.
    location ~* \\.(?:css|js|mjs)$ {{
      add_header Cache-Control "public, max-age=3600";
    }}

    # Photos, videos, fonts and models: rarely change once posted.
    location ~* \\.(?:jpe?g|png|gif|webp|avif|svg|ico|mp4|m4v|mov|webm|woff2?|ttf|otf|glb|gltf)$ {{
      add_header Cache-Control "public, max-age=86400";
    }}
  }}
}}
"""


def fingerprint() -> tuple:
    """Paths, sizes and modification times of the content (dot entries and a stray site/ skipped)."""
    entries = []
    for root, dirs, files in os.walk(SOURCE):
        dirs[:] = [d for d in dirs if not d.startswith(".") and not (root == str(SOURCE) and d == "site")]
        for f in files:
            if f.startswith("."):
                continue
            path = os.path.join(root, f)
            try:
                st = os.stat(path)
            except FileNotFoundError:
                continue
            entries.append((path, st.st_size, st.st_mtime_ns))
    entries.sort()
    return tuple(entries)


def site_stats(path: Path) -> tuple[int, int]:
    pages = size = 0
    for root, _dirs, files in os.walk(path):
        for f in files:
            if f.endswith(".html"):
                pages += 1
            try:
                size += os.stat(os.path.join(root, f)).st_size
            except OSError:
                pass
    return pages, size


class BuildFailed(Exception):
    pass


def run_mkdocs(out: Path) -> int:
    """Run `mkdocs build` into `out`; its output becomes JSON log lines. Returns the warning count."""
    config = SOURCE / "mkdocs.yml"
    if not config.is_file():
        raise BuildFailed(f"{config} is missing")
    proc = subprocess.Popen(
        [sys.executable, "-m", "mkdocs", "build", "--clean", "--config-file", str(config), "--site-dir", str(out)],
        cwd=SOURCE,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        errors="replace",
    )
    warnings = 0
    level = logging.INFO
    assert proc.stdout is not None
    for raw in proc.stdout:
        line = raw.rstrip()
        if not line:
            continue
        m = MKDOCS_LINE.match(line)
        if m:
            level = getattr(logging, m.group(1))
            line = m.group(2).strip()
            if level == logging.WARNING:
                warnings += 1
        elif line.startswith(("Error:", "Aborted", "Traceback")):
            # Config and crash messages come without a level prefix.
            level = logging.ERROR
        # Continuation lines (tracebacks, wrapped messages) keep the last level.
        mkdocs_log.log(level, line, extra={"event": "mkdocs"})
    rc = proc.wait()
    if rc != 0:
        raise BuildFailed(f"mkdocs build exited with {rc}")
    return warnings


def publish(out: Path) -> None:
    """Point `current` at `out` in one step and drop older builds."""
    tmp = WORK / "current.tmp"
    if tmp.is_symlink() or tmp.exists():
        tmp.unlink()
    tmp.symlink_to(out.name)
    os.replace(tmp, WORK / "current")
    for old in WORK.glob("build-*"):
        if old != out:
            # Files nginx still sends (a video) stay readable until closed.
            shutil.rmtree(old, ignore_errors=True)


def build() -> bool:
    out = WORK / f"build-{time.time_ns()}"
    started = time.monotonic()
    try:
        with tel.job("build"):
            warnings = run_mkdocs(out)
    except Exception:
        # tel.job logged the failure with the exception.
        BUILD_OK.set(0)
        shutil.rmtree(out, ignore_errors=True)
        log.error("site build failed, the previous version stays online", extra={"event": "build_failed"})
        return False
    publish(out)
    pages, size = site_stats(out)
    BUILD_OK.set(1)
    BUILD_WARNINGS.set(warnings)
    SITE_PAGES.set(pages)
    SITE_BYTES.set(size)
    PUBLISHED.set(time.time())
    log.info(
        "site published",
        extra={
            "event": "published",
            "pages": pages,
            "bytes": size,
            "warnings": warnings,
            "seconds": round(time.monotonic() - started, 2),
        },
    )
    return True


def prepare() -> Path:
    WORK.mkdir(parents=True, exist_ok=True)
    placeholder = WORK / "build-0"
    placeholder.mkdir(exist_ok=True)
    for page in ("index.html", "404.html"):
        (placeholder / page).write_text(PLACEHOLDER, encoding="utf-8")
    if not (WORK / "current").exists():
        publish(placeholder)
    tmp = WORK / "nginx"
    tmp.mkdir(exist_ok=True)
    conf = tmp / "nginx.conf"
    conf.write_text(NGINX_CONF.format(tmp=tmp, mime=MIME_TYPES, port=PORT, root=WORK / "current"), encoding="utf-8")
    return conf


def forward_nginx(stream) -> None:
    for raw in stream:
        line = raw.rstrip()
        if not line:
            continue
        m = NGINX_LINE.search(line)
        nginx_log.log(NGINX_LEVELS[m.group(1)] if m else logging.INFO, line, extra={"event": "nginx"})


def main() -> int:
    tel.setup_logging()
    tel.start_metrics()
    tel.build_info(VERSION)

    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())

    conf = prepare()
    last = fingerprint()
    build()

    nginx = subprocess.Popen(
        [NGINX, "-e", "stderr", "-p", str(conf.parent), "-c", str(conf)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        errors="replace",
    )
    threading.Thread(target=forward_nginx, args=(nginx.stdout,), daemon=True).start()
    log.info("serving the site", extra={"event": "started", "port": PORT})

    while not stop.wait(POLL_SECONDS):
        if nginx.poll() is not None:
            log.critical("nginx stopped", extra={"event": "nginx_exit", "code": nginx.returncode})
            return 1
        try:
            current = fingerprint()
            if current == last:
                continue
            # Wait until the files stop changing (an upload in progress).
            while not stop.wait(POLL_SECONDS):
                again = fingerprint()
                if again == current:
                    break
                current = again
            if stop.is_set():
                break
            log.info("content changed, rebuilding", extra={"event": "content_changed"})
            last = current
            build()
        except Exception:
            log.exception("watching the content failed", extra={"event": "watch_failed"})

    nginx.terminate()
    try:
        nginx.wait(timeout=10)
    except subprocess.TimeoutExpired:
        nginx.kill()
    return 0


if __name__ == "__main__":
    sys.exit(main())
