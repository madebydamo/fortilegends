"""Search engine and LLM metadata for the Forti-Legends site.

Everything here runs from the theme alone (no plugin in mkdocs.yml), because
the production mkdocs.yml lives on the content volume:

- `seo` filter: theme options (`theme.seo` in mkdocs.yml) merged over the
  Forti-Legends defaults below
- `seo_title`: the <title> of a page
- `seo_jsonld`: schema.org graph (Organization, WebSite, BlogPosting,
  BreadcrumbList, Blog + Events on the front page)
- `seo_content`: fills empty `alt` attributes from the photo caption
- `seo_pages` / `seo_lastmod` / `seo_images`: data for sitemap.xml, llms.txt
- `llms_markdown`: a post as clean Markdown with absolute links (llms-full.txt)

All URLs use the public origin from mkdocs.yml, never the `mkdocs serve`
bind address (production runs `mkdocs serve`).
"""

from __future__ import annotations

import datetime as dt
import json
import os
import posixpath
import re
from html import unescape
from typing import Any
from urllib.parse import urljoin, urlparse

from markupsafe import Markup

from .social import (
    WHITESPACE_RE,
    _cfg,
    _is_image_src,
    _plain,
    authors_of,
    build_description,
    first_image,
    absolute_image_url,
    public_origin,
    public_page_url,
)

DEFAULTS: dict[str, Any] = {
    "name": "Forti-Legends",
    "alternate_names": [
        "Fortilegends",
        "Forti Legends",
        "Forti-Legends Gossau",
        "Fortilegends Gossau",
    ],
    # Appended to every post title: "<post> – Forti-Legends Gossau"
    "title_suffix": "Forti-Legends Gossau",
    "home_title": "Forti-Legends Gossau – Verein, Events & Blog",
    "description": (
        "Forti-Legends (Fortilegends) ist ein Verein aus Gossau SG: ehemalige "
        "Handball- und Teamkollegen, die seit 2024 gemeinsam Events feiern. "
        "Hier steht die Ziitkapsle mit allen Anlässen, Fotos und Terminen."
    ),
    "lang": "de-CH",
    "locality": "Gossau",
    "region": "SG",
    "region_name": "St. Gallen",
    "postal_code": "9200",
    "country": "CH",
    "latitude": 47.4153,
    "longitude": 9.2546,
    "founding_date": "2024-12-21",
    "keywords": [
        "Forti-Legends",
        "Fortilegends",
        "Forti Gossau",
        "Gossau SG",
        "Verein Gossau",
        "Handball Gossau",
        "Events Gossau",
        "St. Gallen",
    ],
    "same_as": [],
    "logo": "assets/img/logo.png",
    # Short facts for llms.txt (and anyone asking an AI about the club).
    "facts": [
        "Name: Forti-Legends (Schreibweisen: Fortilegends, Forti Legends)",
        "Ort: Gossau, Kanton St. Gallen, Schweiz",
        "Was: Verein von ehemaligen Handball- und Teamkollegen; "
        "gemeinsame Events, Fründschaft und Erinnerige",
        "Gegründet: 21. Dezember 2024 am Weihnachtsessen, "
        "mit über 18 Gründungsmitgliedern",
        "Website und Blog: https://fortilegends.ch/ (seit 29. Mai 2025)",
        "Sprache der Beiträge: Schweizerdeutsch und Deutsch",
    ],
}

AI_CRAWLERS = [
    "GPTBot",
    "OAI-SearchBot",
    "ChatGPT-User",
    "ClaudeBot",
    "Claude-SearchBot",
    "Claude-User",
    "anthropic-ai",
    "PerplexityBot",
    "Perplexity-User",
    "Google-Extended",
    "Applebot-Extended",
    "Amazonbot",
    "meta-externalagent",
    "DuckAssistBot",
    "MistralAI-User",
    "cohere-ai",
    "CCBot",
]

MONTHS = {
    "januar": 1, "jänner": 1, "jaenner": 1, "februar": 2, "märz": 3,
    "maerz": 3, "april": 4, "mai": 5, "juni": 6, "juli": 7, "august": 8,
    "september": 9, "oktober": 10, "november": 11, "dezember": 12,
}
DATE_DMY_WORD = re.compile(r"(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)\s+(\d{4})")
DATE_DMY = re.compile(r"(\d{1,2})\.(\d{1,2})\.(\d{4})")
DATE_ISO = re.compile(r"(\d{4})-(\d{2})-(\d{2})")
TIME_RANGE = re.compile(r"(\d{1,2}):(\d{2})(?:\s*[–-]\s*(\d{1,2}):(\d{2}))?")
AGENDA_HEAD = re.compile(r"^#{1,6}\s+(.*?)\s*\{[^}]*\.agenda\b[^}]*\}\s*$")
HEADING = re.compile(r"^#{1,6}\s")
IMG_TAG = re.compile(r"<img\b([^>]*?)\s*/?>", re.IGNORECASE)
FIGCAPTION = re.compile(r"<figcaption\b[^>]*>(.*?)</figcaption>", re.IGNORECASE | re.DOTALL)
SRC_ATTR = re.compile(r"""\bsrc\s*=\s*(['"])(.*?)\1""", re.IGNORECASE)
ALT_ATTR = re.compile(r"""\balt\s*=\s*(['"])(.*?)\1""", re.IGNORECASE | re.DOTALL)
FRONT_ATTR = re.compile(r"\s*\{\s*[.#:][^}]*\}")
MD_LINK = re.compile(r"(!?\[[^\]]*\]\()\s*(<[^>]+>|[^)\s]+)")
HTML_TAG = re.compile(r"</?[a-zA-Z][^>]*>")
COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
BLOCK_JUNK = re.compile(
    r"<(script|style|svg)\b.*?</\1>", re.IGNORECASE | re.DOTALL
)


def install(env: Any) -> None:
    env.filters["seo"] = seo_options
    env.filters["seo_title"] = seo_title
    env.filters["seo_jsonld"] = seo_jsonld
    env.filters["seo_content"] = seo_content
    env.filters["seo_pages"] = seo_pages
    env.filters["seo_posts"] = seo_posts
    env.filters["seo_lastmod"] = seo_lastmod
    env.filters["seo_images"] = seo_images
    env.filters["seo_url"] = seo_url
    env.filters["seo_events"] = seo_events
    env.filters["seo_description"] = seo_description
    env.filters["llms_markdown"] = llms_markdown
    env.globals["seo_ai_crawlers"] = AI_CRAWLERS


# --------------------------------------------------------------------------
# options


def seo_options(config: Any) -> dict[str, Any]:
    """`config | seo` → DEFAULTS with `theme.seo` from mkdocs.yml on top."""
    theme = getattr(config, "theme", None) if not isinstance(config, dict) else config.get("theme")
    custom: Any = None
    if theme is not None:
        try:
            custom = theme["seo"]
        except (KeyError, TypeError):
            custom = getattr(theme, "seo", None)
    opts = dict(DEFAULTS)
    if isinstance(custom, dict):
        opts.update({k: v for k, v in custom.items() if v is not None})
    opts["name"] = opts.get("name") or _cfg(config, "site_name")
    opts["origin"] = public_origin(config)
    return opts


# --------------------------------------------------------------------------
# page helpers


def _meta(page: Any) -> dict[str, Any]:
    meta = getattr(page, "meta", None)
    return meta if isinstance(meta, dict) else {}


def is_indexable(page: Any) -> bool:
    if page is None or getattr(page, "is_link", False):
        return False
    meta = _meta(page)
    if meta.get("noindex") or str(meta.get("robots", "")).lower().startswith("noindex"):
        return False
    file = getattr(page, "file", None)
    inclusion = getattr(file, "inclusion", None)
    if inclusion is not None and getattr(inclusion, "value", 1) < 0:
        # not_in_nav (e.g. example.md), drafts
        return False
    return True


def is_post(page: Any) -> bool:
    return (
        is_indexable(page)
        and not getattr(page, "is_homepage", False)
        and bool(_meta(page).get("date"))
    )


def seo_url(page: Any, config: Any) -> str:
    return public_page_url(page, public_origin(config))


def seo_title(page: Any, config: Any) -> str:
    opts = seo_options(config)
    meta = _meta(page)
    if meta.get("seo_title"):
        return str(meta["seo_title"])
    if page is None:
        return opts["name"]
    if getattr(page, "is_homepage", False):
        return opts.get("home_title") or opts["name"]
    title = str(meta.get("title") or getattr(page, "title", "") or "").strip()
    suffix = opts.get("title_suffix") or opts["name"]
    if not title:
        return suffix
    return f"{title} – {suffix}"


def seo_description(page: Any, config: Any) -> str:
    """Meta description. The front page gets the club description."""
    opts = seo_options(config)
    meta = _meta(page)
    if getattr(page, "is_homepage", False):
        return str(meta.get("description") or opts.get("description") or "").strip()
    return build_description(
        meta,
        getattr(page, "markdown", "") or "",
        getattr(page, "content", "") or "",
        site_description=_cfg(config, "site_description"),
    )


def _to_date(value: Any) -> dt.date | None:
    if isinstance(value, dt.datetime):
        return value.date()
    if isinstance(value, dt.date):
        return value
    if isinstance(value, str):
        m = DATE_ISO.search(value)
        if m:
            try:
                return dt.date(int(m[1]), int(m[2]), int(m[3]))
            except ValueError:
                return None
    return None


def seo_lastmod(page: Any) -> str:
    """Last change of the source file (YYYY-MM-DD), else the post date."""
    file = getattr(page, "file", None)
    path = getattr(file, "abs_src_path", None)
    if path:
        try:
            ts = os.path.getmtime(path)
            return dt.datetime.fromtimestamp(ts, dt.timezone.utc).date().isoformat()
        except OSError:
            pass
    date = _to_date(_meta(page).get("date"))
    return date.isoformat() if date else ""


def seo_pages(pages: Any) -> list[Any]:
    """Indexable pages from the `pages` (File list) of a static template."""
    result = []
    for item in pages or []:
        page = getattr(item, "page", item)
        if is_indexable(page):
            result.append(page)
    result.sort(key=lambda p: (not getattr(p, "is_homepage", False), getattr(p, "url", "")))
    return result


def seo_posts(pages: Any) -> list[Any]:
    """Posts (pages with a date), newest first."""
    posts = [p for p in seo_pages(pages) if is_post(p)]
    posts.sort(key=lambda p: str(_meta(p).get("date")), reverse=True)
    return posts


def seo_images(page: Any, config: Any) -> list[str]:
    """Absolute URLs of all photos on a page (sitemap image extension)."""
    html = getattr(page, "content", "") or ""
    url = seo_url(page, config)
    seen: list[str] = []
    for match in IMG_TAG.finditer(html):
        src_m = SRC_ATTR.search(match.group(1))
        if not src_m:
            continue
        src = unescape(src_m.group(2))
        if not _is_image_src(src):
            continue
        absolute = _absolute(src, url)
        if absolute not in seen:
            seen.append(absolute)
    meta = _meta(page)
    hero = meta.get("hero") if isinstance(meta.get("hero"), dict) else {}
    if hero and hero.get("image"):
        absolute = urljoin(public_origin(config), str(hero["image"]).lstrip("/"))
        if absolute not in seen:
            seen.insert(0, absolute)
    return seen


def _absolute(src: str, page_url: str) -> str:
    if urlparse(src).scheme in ("http", "https"):
        return src
    base = page_url if page_url.endswith("/") else page_url + "/"
    return urljoin(base, src)


# --------------------------------------------------------------------------
# HTML content


def seo_content(html: str, page: Any = None) -> Markup:
    """Give photos an alt text: the figure caption, else the post title.

    markdown_captions turns `![text](img)` into <img> + <figcaption> and
    drops the alt attribute. Search engines read alt, not figcaption.
    """
    if not html:
        return Markup(html or "")
    title = str(_meta(page).get("title") or getattr(page, "title", "") or "").strip()
    out: list[str] = []
    pos = 0
    for match in IMG_TAG.finditer(html):
        attrs = match.group(1)
        out.append(html[pos:match.start()])
        pos = match.end()
        alt_m = ALT_ATTR.search(attrs)
        if alt_m and alt_m.group(2).strip():
            out.append(match.group(0))
            continue
        caption = FIGCAPTION.search(html, match.end(), match.end() + 600)
        between = html[match.end(): caption.start()] if caption else ""
        if caption and "<img" not in between.lower():
            alt = _plain(caption.group(1))
        else:
            alt = f"Foto: {title}" if title else ""
        if not alt:
            out.append(match.group(0))
            continue
        alt = alt.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;")
        if alt_m:
            attrs = attrs[: alt_m.start()] + attrs[alt_m.end():]
        out.append(f'<img{attrs} alt="{alt}" />')
    out.append(html[pos:])
    return Markup("".join(out))


# --------------------------------------------------------------------------
# Ausblick (agenda) → Events


def _parse_date(text: str) -> dt.date | None:
    m = DATE_ISO.search(text)
    if m:
        y, mo, d = int(m[1]), int(m[2]), int(m[3])
    else:
        m = DATE_DMY.search(text)
        if m:
            d, mo, y = int(m[1]), int(m[2]), int(m[3])
        else:
            m = DATE_DMY_WORD.search(text)
            if not m:
                return None
            mo = MONTHS.get(m[2].lower())
            if not mo:
                return None
            d, y = int(m[1]), int(m[3])
    try:
        return dt.date(y, mo, d)
    except ValueError:
        return None


def seo_events(page: Any) -> list[dict[str, Any]]:
    """Read the `## … { .agenda }` list of a page (front page Ausblick)."""
    markdown = getattr(page, "markdown", "") or ""
    events: list[dict[str, Any]] = []
    inside = False
    current: dict[str, Any] | None = None
    for raw in markdown.splitlines():
        line = raw.rstrip()
        if AGENDA_HEAD.match(line.strip()):
            inside = True
            continue
        if not inside:
            continue
        if HEADING.match(line.strip()):
            break
        if not line.strip():
            continue
        indented = raw[:1] in (" ", "\t")
        item = line.strip()
        if not item.startswith(("- ", "* ", "+ ")):
            continue
        item = item[2:].strip()
        code = re.search(r"`([^`]+)`", item)
        date = _parse_date(code.group(1)) if code and not indented else None
        if date:
            title_m = re.search(r"\*\*(.+?)\*\*", item)
            title = title_m.group(1) if title_m else re.sub(r"`[^`]*`", "", item)
            current = {
                "date": date,
                "title": _plain(title).strip(),
                "place": "",
                "info": [],
                "url": "",
                "time": TIME_RANGE.search(code.group(1)) if code else None,
            }
            events.append(current)
            continue
        if current is None:
            continue
        label, _, value = item.partition(":")
        key = label.strip().lower()
        value = value.strip()
        if key == "ort" and value:
            current["place"] = value
        elif key in ("zit", "zeit") and value:
            current["time"] = TIME_RANGE.search(value)
        elif key == "link" and value:
            current["url"] = value
        elif key in ("info",) and value:
            current["info"].append(value)
        elif key not in ("farb", "farbe"):
            current["info"].append(_plain(item))
    for event in events:
        event["start"], event["end"] = _event_times(event["date"], event.pop("time"))
        event["info"] = " ".join(event["info"]).strip()
        event["upcoming"] = event["date"] >= dt.date.today()
    events.sort(key=lambda e: e["date"])
    return events


def _event_times(date: dt.date, time: Any) -> tuple[str, str]:
    start_h, start_m, end_h, end_m = 12, 0, 23, 0
    if time:
        start_h, start_m = int(time.group(1)), int(time.group(2))
        if time.group(3):
            end_h, end_m = int(time.group(3)), int(time.group(4))
    offset = _zurich_offset(date)
    return (
        f"{date.isoformat()}T{start_h:02d}:{start_m:02d}:00{offset}",
        f"{date.isoformat()}T{end_h:02d}:{end_m:02d}:00{offset}",
    )


def _zurich_offset(date: dt.date) -> str:
    try:
        from zoneinfo import ZoneInfo

        moment = dt.datetime(date.year, date.month, date.day, 12, tzinfo=ZoneInfo("Europe/Zurich"))
        seconds = int(moment.utcoffset().total_seconds())  # type: ignore[union-attr]
        return f"+{seconds // 3600:02d}:00"
    except Exception:  # pragma: no cover - tzdata missing
        # CEST from the last Sunday in March to the last Sunday in October
        return "+02:00" if 4 <= date.month <= 9 else "+01:00"


# --------------------------------------------------------------------------
# JSON-LD


def _address(opts: dict[str, Any]) -> dict[str, Any]:
    return {
        "@type": "PostalAddress",
        "addressLocality": opts["locality"],
        "postalCode": opts.get("postal_code") or None,
        "addressRegion": opts.get("region") or None,
        "addressCountry": opts.get("country") or None,
    }


def _place(opts: dict[str, Any]) -> dict[str, Any]:
    place: dict[str, Any] = {
        "@type": "Place",
        "name": f"{opts['locality']} {opts.get('region') or ''}".strip(),
        "address": _address(opts),
    }
    if opts.get("latitude") and opts.get("longitude"):
        place["geo"] = {
            "@type": "GeoCoordinates",
            "latitude": opts["latitude"],
            "longitude": opts["longitude"],
        }
    return place


def _clean(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _clean(v) for k, v in value.items() if v not in (None, "", [], {})}
    if isinstance(value, list):
        return [_clean(v) for v in value if v not in (None, "", [], {})]
    return value


def _people(meta: dict[str, Any]) -> list[dict[str, Any]]:
    authors = meta.get("authors") or meta.get("author") or []
    if isinstance(authors, str):
        authors = [authors]
    return [{"@type": "Person", "name": str(a).strip()} for a in authors if str(a).strip()]


def _iso(value: Any) -> str:
    date = _to_date(value)
    return date.isoformat() if date else ""


def seo_jsonld(page: Any, config: Any, nav: Any = None) -> Markup:
    """`<script type="application/ld+json">` body for a page."""
    opts = seo_options(config)
    origin = opts["origin"]
    org_id = origin + "#organization"
    site_id = origin + "#website"
    url = seo_url(page, config) if page is not None else origin
    lang = opts.get("lang") or "de-CH"

    logo = urljoin(origin, str(opts.get("logo") or "").lstrip("/")) if opts.get("logo") else ""
    org = {
        "@type": "Organization",
        "@id": org_id,
        "name": opts["name"],
        "alternateName": opts.get("alternate_names"),
        "url": origin,
        "logo": {"@type": "ImageObject", "url": logo} if logo else None,
        "description": opts.get("description"),
        "foundingDate": opts.get("founding_date"),
        "foundingLocation": _place(opts),
        "location": _place(opts),
        "address": _address(opts),
        "areaServed": {"@type": "City", "name": opts["locality"]},
        "keywords": ", ".join(opts.get("keywords") or []),
        "sameAs": opts.get("same_as"),
    }
    website = {
        "@type": "WebSite",
        "@id": site_id,
        "name": opts["name"],
        "alternateName": opts.get("alternate_names"),
        "url": origin,
        "description": opts.get("description"),
        "inLanguage": lang,
        "publisher": {"@id": org_id},
    }
    graph: list[dict[str, Any]] = [org, website]

    if page is not None and getattr(page, "is_homepage", False):
        meta = _meta(page)
        hero = meta.get("hero") if isinstance(meta.get("hero"), dict) else {}
        image = urljoin(origin, str(hero.get("image")).lstrip("/")) if hero.get("image") else ""
        if image:
            org["image"] = image
        posts = _nav_posts(nav)
        graph.append(
            {
                "@type": ["WebPage", "CollectionPage"],
                "@id": url + "#webpage",
                "url": url,
                "name": seo_title(page, config),
                "description": seo_description(page, config),
                "inLanguage": lang,
                "isPartOf": {"@id": site_id},
                "about": {"@id": org_id},
                "primaryImageOfPage": image or None,
                "mainEntity": {"@id": origin + "#blog"},
            }
        )
        graph.append(
            {
                "@type": "Blog",
                "@id": origin + "#blog",
                "name": f"Blog vo de {opts['name']}",
                "url": origin,
                "inLanguage": lang,
                "publisher": {"@id": org_id},
                "about": {"@id": org_id},
                "blogPost": [
                    {
                        "@type": "BlogPosting",
                        "@id": seo_url(p, config) + "#article",
                        "headline": _meta(p).get("title") or p.title,
                        "url": seo_url(p, config),
                        "datePublished": _iso(_meta(p).get("date")),
                    }
                    for p in posts
                ],
            }
        )
        for event in [e for e in seo_events(page) if e["upcoming"]]:
            location: Any = None
            if event["place"]:
                location = {
                    "@type": "Place",
                    "name": event["place"],
                    "address": {
                        "@type": "PostalAddress",
                        "addressLocality": event["place"],
                        "addressCountry": opts.get("country"),
                    },
                }
            graph.append(
                {
                    "@type": "Event",
                    "name": f"{opts['name']} – {event['title']}",
                    "startDate": event["start"],
                    "endDate": event["end"],
                    "eventStatus": "https://schema.org/EventScheduled",
                    "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
                    "location": location,
                    "description": event["info"] or f"{event['title']} vo de {opts['name']} us {opts['locality']}.",
                    "organizer": {"@id": org_id},
                    "url": event["url"] or origin,
                    "image": image or None,
                    "inLanguage": lang,
                }
            )
    elif page is not None and is_indexable(page):
        meta = _meta(page)
        title = str(meta.get("title") or getattr(page, "title", "") or opts["name"])
        src, _alt, origin_kind = first_image(
            getattr(page, "markdown", "") or "", getattr(page, "content", "") or "", meta
        )
        file = getattr(page, "file", None)
        image = absolute_image_url(
            src, origin=origin_kind, page_url=url, site_url=origin,
            src_uri=getattr(file, "src_uri", "") or "",
        )
        images = seo_images(page, config)
        if image and image not in images:
            images.insert(0, image)
        if is_post(page):
            graph.append(
                {
                    "@type": "BlogPosting",
                    "@id": url + "#article",
                    "headline": title[:110],
                    "name": title,
                    "description": seo_description(page, config),
                    "abstract": meta.get("summary"),
                    "url": url,
                    "mainEntityOfPage": url,
                    "image": images[:10],
                    "datePublished": _iso(meta.get("date")),
                    "dateModified": seo_lastmod(page) or _iso(meta.get("date")),
                    "author": _people(meta) or {"@id": org_id},
                    "publisher": {"@id": org_id},
                    "isPartOf": [{"@id": site_id}, {"@id": origin + "#blog"}],
                    "about": {"@id": org_id},
                    "inLanguage": lang,
                    "keywords": ", ".join(opts.get("keywords") or []),
                    "wordCount": len(WHITESPACE_RE.split(_plain(getattr(page, "content", "") or ""))),
                }
            )
        else:
            graph.append(
                {
                    "@type": "WebPage",
                    "@id": url + "#webpage",
                    "url": url,
                    "name": title,
                    "inLanguage": lang,
                    "isPartOf": {"@id": site_id},
                }
            )
        crumbs = [{"name": opts["name"], "item": origin}]
        parent = getattr(page, "parent", None)
        if parent is not None and getattr(parent, "title", None):
            anchor = str(parent.title).lower().replace(" ", "-")
            crumbs.append({"name": str(parent.title), "item": f"{origin}#{anchor}"})
        crumbs.append({"name": title, "item": url})
        graph.append(
            {
                "@type": "BreadcrumbList",
                "itemListElement": [
                    {"@type": "ListItem", "position": i + 1, **c} for i, c in enumerate(crumbs)
                ],
            }
        )

    data = {"@context": "https://schema.org", "@graph": _clean(graph)}
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    # never let page text close the <script> element
    text = text.replace("</", "<\\/").replace("<!--", "<\\!--")
    return Markup(text)


def _nav_posts(nav: Any) -> list[Any]:
    found: list[Any] = []

    def walk(items: Any) -> None:
        for item in items or []:
            children = getattr(item, "children", None)
            if children:
                walk(children)
            elif getattr(item, "is_page", False) and is_post(item):
                found.append(item)

    walk(nav)
    found.sort(key=lambda p: str(_meta(p).get("date")), reverse=True)
    return found


# --------------------------------------------------------------------------
# llms-full.txt


def llms_markdown(page: Any, config: Any) -> str:
    """A post as plain Markdown: absolute links, no HTML or attr_list noise."""
    markdown = getattr(page, "markdown", "") or ""
    url = seo_url(page, config)
    origin = public_origin(config)
    file = getattr(page, "file", None)
    src_dir = posixpath.dirname(getattr(file, "src_uri", "") or "")

    def fix(match: re.Match[str]) -> str:
        target = match.group(2).strip("<>")
        parsed = urlparse(target)
        if parsed.scheme or target.startswith(("#", "mailto:", "tel:")):
            if target.startswith("#"):
                target = url + target
            return match.group(1) + target
        path, _, frag = target.partition("#")
        if path.startswith("/"):
            rel = path.lstrip("/")
        else:
            rel = posixpath.normpath(posixpath.join(src_dir, path))
        if rel.endswith(".md"):
            rel = rel[:-3]
            rel = "" if rel in ("index", ".") else rel.removesuffix("/index") + "/"
        absolute = urljoin(origin, rel) + (f"#{frag}" if frag else "")
        return match.group(1) + absolute

    text = COMMENT.sub("", markdown)
    text = BLOCK_JUNK.sub("", text)
    text = HTML_TAG.sub("", text)
    text = FRONT_ATTR.sub("", text)
    text = MD_LINK.sub(fix, text)
    text = unescape(text)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    # demote headings so each post sits under its own "# Title"
    text = re.sub(r"^(#{1,5}) ", lambda m: "#" + m.group(1) + " ", text, flags=re.MULTILINE)
    return text.strip()
