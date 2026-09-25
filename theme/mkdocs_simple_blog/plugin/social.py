"""Open Graph / Twitter card metadata for Forti-Legends posts.

Share previews (WhatsApp, iMessage, Discord, X, …) are built from the
page itself so authors do not have to add extra front matter:

- image: first photo in the post (or `image:` / `hero.image` override)
- description: author(s) plus the opening paragraph
- title: the post title

`summary` stays the short "Kurz gseit" line on the post and is only used
as a fallback when the body has no opening text.
"""

from __future__ import annotations

import posixpath
import re
from html import unescape
from typing import Any
from urllib.parse import urljoin, urlparse

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
VIDEO_EXTS = {".mp4", ".webm", ".mov", ".ogg"}
IMAGE_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
}

# ![alt](src) and ![alt](src "title")
IMG_MD_RE = re.compile(
    r"!\[(?P<alt>[^\]]*)\]\(\s*(?P<src><[^>\s]+>|[^)\s]+)"
    r"(?:\s+[\"'][^\"']*[\"'])?\s*\)",
    re.MULTILINE,
)
IMG_HTML_RE = re.compile(
    r"<img\b(?P<tag>[^>]*)>",
    re.IGNORECASE | re.DOTALL,
)
ATTR_RE = re.compile(
    r"""\b(?P<name>src|alt)\s*=\s*(?P<q>['"])(?P<val>.*?)(?P=q)""",
    re.IGNORECASE | re.DOTALL,
)
CAPTION_RE = re.compile(
    r"<figcaption\b[^>]*>(.*?)</figcaption>",
    re.IGNORECASE | re.DOTALL,
)
P_RE = re.compile(r"<p\b[^>]*>(.*?)</p>", re.IGNORECASE | re.DOTALL)
LOCAL_HOSTS = {"0.0.0.0", "127.0.0.1", "localhost", "::", "::1"}
TAG_RE = re.compile(r"<[^>]+>", re.DOTALL)
WHITESPACE_RE = re.compile(r"\s+")
FENCE_RE = re.compile(r"```.*?```", re.DOTALL)
HEADING_MD_RE = re.compile(r"^#{1,6}\s+")
LINK_MD_RE = re.compile(r"\[([^\]]+)\]\([^)]+\)")

DESC_LIMIT = 220
MIN_OPENING = 80


def install_filters(env: Any) -> None:
    """Register the `social_card` Jinja filter (idempotent)."""
    env.filters["social_card"] = social_card


def social_card(page: Any, config: Any) -> dict[str, str]:
    """Jinja filter: `page | social_card(config)` → card fields."""
    meta = getattr(page, "meta", None) or {}
    markdown = getattr(page, "markdown", None) or ""
    html = getattr(page, "content", None) or ""
    src_uri = ""
    file = getattr(page, "file", None)
    if file is not None:
        src_uri = getattr(file, "src_uri", None) or ""

    site_url = public_origin(config)
    site_name = _cfg(config, "site_name")
    site_description = _cfg(config, "site_description")
    canonical = public_page_url(page, site_url)
    is_home = bool(getattr(page, "is_homepage", False))

    title = (
        (meta.get("title") if isinstance(meta, dict) else None)
        or getattr(page, "title", None)
        or site_name
    )
    title = str(title).strip() if title else site_name

    src, alt, origin = first_image(markdown, html, meta)
    image = absolute_image_url(
        src,
        origin=origin,
        page_url=canonical,
        site_url=site_url,
        src_uri=src_uri,
    )
    image_alt = alt or title
    author = authors_of(meta) or _cfg(config, "site_author")
    description = build_description(
        meta,
        markdown,
        html,
        site_description=site_description,
    )
    date = _iso_date(meta.get("date") if isinstance(meta, dict) else None)

    return {
        "title": title,
        "description": description,
        "image": image,
        "image_alt": image_alt,
        "image_type": image_type(image),
        "url": canonical or "",
        "site_name": site_name,
        "type": "website" if is_home else "article",
        "author": author,
        "date": date,
        "card": "summary_large_image" if image else "summary",
        "locale": "de_CH",
    }


def authors_of(meta: dict[str, Any] | None) -> str:
    if not meta:
        return ""
    authors = meta.get("authors")
    if isinstance(authors, str) and authors.strip():
        return authors.strip()
    if isinstance(authors, (list, tuple)):
        names = [str(a).strip() for a in authors if str(a).strip()]
        if names:
            return " & ".join(names)
    author = meta.get("author")
    if author:
        return str(author).strip()
    return ""


def first_image(
    markdown: str,
    html: str,
    meta: dict[str, Any] | None,
) -> tuple[str, str, str]:
    """Return `(src, alt, origin)` where origin is meta|html|markdown."""
    meta = meta or {}
    image = meta.get("image")
    if image:
        return str(image).strip(), str(meta.get("image_alt") or "").strip(), "meta"
    hero = meta.get("hero") or {}
    if isinstance(hero, dict) and hero.get("image"):
        return (
            str(hero["image"]).strip(),
            str(hero.get("image_alt") or "").strip(),
            "meta",
        )

    md_src, md_alt = _first_md_image(markdown) if markdown else ("", "")

    # Rendered HTML paths are already relative to the page URL.
    # markdown-captions moves the alt text into <figcaption>, so keep the
    # markdown alt as a fallback.
    if html:
        src, alt = _first_html_image(html)
        if src:
            return src, alt or md_alt, "html"

    if md_src:
        return md_src, md_alt, "markdown"

    return "", "", ""


def _first_md_image(markdown: str) -> tuple[str, str]:
    for match in IMG_MD_RE.finditer(markdown):
        src = match.group("src").strip().strip("<>")
        if _is_image_src(src):
            return src, match.group("alt").strip()
    return "", ""


def _first_html_image(html: str) -> tuple[str, str]:
    for match in IMG_HTML_RE.finditer(html):
        attrs = {
            m.group("name").lower(): m.group("val").strip()
            for m in ATTR_RE.finditer(match.group("tag"))
        }
        src = attrs.get("src") or ""
        if not _is_image_src(src):
            continue
        alt = attrs.get("alt") or ""
        if not alt:
            after = html[match.end() : match.end() + 500]
            caption = CAPTION_RE.search(after)
            if caption:
                alt = _plain(caption.group(1))
        return src, alt
    return "", ""


def _is_image_src(src: str) -> bool:
    if not src or src.startswith("data:"):
        return False
    path = urlparse(src).path.lower()
    ext = posixpath.splitext(path)[1]
    if ext in VIDEO_EXTS:
        return False
    if ext in IMAGE_EXTS:
        return True
    # Extensionless / unusual, but still a photo under docs/assets.
    if "assets/" in src.replace("\\", "/") and ext not in {".svg", ".ico"}:
        return True
    return False


def first_paragraph(markdown: str, html: str) -> str:
    """Plain-text opening of the post, for the card description."""
    text = _opening_from_html(html) if html else ""
    if not text and markdown:
        text = _opening_from_markdown(markdown)
    return text


def _opening_from_html(html: str) -> str:
    paragraphs: list[str] = []
    for match in P_RE.finditer(html):
        inner = match.group(1)
        if re.search(r"<(?:figure|img|figcaption)\b", inner, re.IGNORECASE):
            continue
        text = _plain(inner)
        if text:
            paragraphs.append(text)
    return _collect_opening(paragraphs)


def _opening_from_markdown(markdown: str) -> str:
    md = FENCE_RE.sub(" ", markdown)
    md = IMG_MD_RE.sub(" ", md)
    md = TAG_RE.sub(" ", md)
    paragraphs: list[str] = []
    buf: list[str] = []

    def flush() -> None:
        blob = _strip_md_inline(" ".join(buf))
        blob = WHITESPACE_RE.sub(" ", blob).strip()
        if blob:
            paragraphs.append(blob)
        buf.clear()

    for raw in md.splitlines():
        line = raw.strip()
        if not line:
            flush()
            continue
        if HEADING_MD_RE.match(line):
            flush()
            continue
        if line.startswith(">"):
            line = line.lstrip("> ").strip()
            if not line:
                continue
        if (
            line.startswith("|")
            or line.startswith("- ")
            or line.startswith("* ")
            or line.startswith("+ ")
            or re.match(r"^\d+\.\s", line)
        ):
            if not buf:
                continue
        buf.append(line)
    flush()
    return _collect_opening(paragraphs)


_END_PUNCT = set(".!?…")


def _collect_opening(paragraphs: list[str], min_len: int = MIN_OPENING) -> str:
    chunks: list[str] = []
    total = 0
    for paragraph in paragraphs:
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        if chunks and chunks[-1][-1] not in _END_PUNCT:
            chunks[-1] += "."
        chunks.append(paragraph)
        total += len(paragraph)
        if total >= min_len:
            break
    return " ".join(chunks)


def _strip_md_inline(text: str) -> str:
    text = LINK_MD_RE.sub(r"\1", text)
    for token in ("**", "__", "*", "_", "`"):
        text = text.replace(token, "")
    return unescape(text)


def _plain(html_fragment: str) -> str:
    text = re.sub(r"<br\s*/?>", " ", html_fragment, flags=re.IGNORECASE)
    text = TAG_RE.sub("", text)
    text = unescape(text)
    return WHITESPACE_RE.sub(" ", text).strip()


def build_description(
    meta: dict[str, Any] | None,
    markdown: str,
    html: str,
    site_description: str = "",
) -> str:
    meta = meta or {}
    author = authors_of(meta)
    # Explicit `description:` wins. `summary` is the short kicker on the
    # page ("4. Event usem 2026") and is too thin as a share hook.
    explicit = str(meta.get("description") or "").strip()
    opening = explicit or first_paragraph(markdown, html)
    hook = opening or str(meta.get("summary") or "").strip() or site_description
    hook = WHITESPACE_RE.sub(" ", hook).strip()
    if author and hook:
        desc = f"{author} — {hook}"
    else:
        desc = hook or author
    return _truncate(desc, DESC_LIMIT)


def _truncate(text: str, limit: int) -> str:
    text = WHITESPACE_RE.sub(" ", text).strip()
    if len(text) <= limit:
        return text
    cut = text[: limit - 1]
    if " " in cut:
        cut = cut.rsplit(" ", 1)[0]
    return cut.rstrip(".,;:—–- ") + "…"


def absolute_image_url(
    src: str,
    *,
    origin: str,
    page_url: str,
    site_url: str,
    src_uri: str,
) -> str:
    if not src:
        return ""
    src = src.strip()
    if src.startswith("//"):
        return "https:" + src
    parsed = urlparse(src)
    if parsed.scheme in ("http", "https"):
        return src

    site = site_url or ""
    if origin == "meta":
        return _join_site(site, src)
    if origin == "markdown":
        rel = _resolve_from_source(src, src_uri)
        return _join_site(site, rel)
    # HTML: already rewritten relative to the built page URL.
    base = page_url or site
    if base and not base.endswith("/") and not base.rsplit("/", 1)[-1].endswith(".html"):
        base += "/"
    if src.startswith("/"):
        return _origin(site or page_url).rstrip("/") + src
    return urljoin(base, src)


def _resolve_from_source(src: str, src_uri: str) -> str:
    if src.startswith("/"):
        return src.lstrip("/")
    directory = posixpath.dirname(src_uri or "")
    return posixpath.normpath(posixpath.join(directory, src))


def _join_site(site_url: str, path: str) -> str:
    path = path.lstrip("/")
    if not site_url:
        return path
    if not site_url.endswith("/"):
        site_url += "/"
    return urljoin(site_url, path)


def _origin(url: str) -> str:
    parsed = urlparse(url or "")
    if not parsed.scheme or not parsed.netloc:
        return url or ""
    return f"{parsed.scheme}://{parsed.netloc}"


def image_type(url: str) -> str:
    ext = posixpath.splitext(urlparse(url).path.lower())[1]
    return IMAGE_TYPES.get(ext, "")


def _iso_date(value: Any) -> str:
    if value is None or value == "":
        return ""
    iso = getattr(value, "isoformat", None)
    if callable(iso):
        return str(iso())
    return str(value)


def public_origin(config: Any) -> str:
    """Absolute site origin for share tags.

    `mkdocs serve` rewrites `site_url` to the bind address (`http://0.0.0.0:8000/`).
    Crawlers cannot fetch that, so we fall back to the value in mkdocs.yml.
    """
    live = _cfg(config, "site_url")
    if live and not _is_local_host(live):
        return _ensure_slash(live)
    yaml_url = _site_url_from_yaml(_config_file_path(config))
    if yaml_url:
        return _ensure_slash(yaml_url)
    return _ensure_slash(live)


def public_page_url(page: Any, origin: str) -> str:
    if not origin:
        return getattr(page, "canonical_url", None) or ""
    canonical = getattr(page, "canonical_url", None) or ""
    path = urlparse(canonical).path if canonical else ""
    if not path:
        file = getattr(page, "file", None)
        path = getattr(file, "url", None) or ""
    if not path:
        return origin
    if not path.startswith("/"):
        path = "/" + path
    return urljoin(origin, path)


def _is_local_host(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return host in LOCAL_HOSTS


def _ensure_slash(url: str) -> str:
    if url and not url.endswith("/"):
        return url + "/"
    return url


def _config_file_path(config: Any) -> str:
    if config is None:
        return ""
    if isinstance(config, dict):
        return str(config.get("config_file_path") or "")
    return str(getattr(config, "config_file_path", None) or "")


def _site_url_from_yaml(path: str) -> str:
    if not path:
        return ""
    try:
        with open(path, encoding="utf-8") as handle:
            for raw in handle:
                line = raw.strip()
                if not line.startswith("site_url:"):
                    continue
                value = line.split(":", 1)[1].strip().strip("'\"")
                return value
    except OSError:
        return ""
    return ""


def _cfg(config: Any, key: str, default: str = "") -> str:
    if config is None:
        return default
    if isinstance(config, dict):
        value = config.get(key)
    else:
        value = getattr(config, key, None)
    if value is None or value == "":
        return default
    return str(value)
