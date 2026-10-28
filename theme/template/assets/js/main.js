/* Forti-Legends theme JS
 * - mobile navigation
 * - table of contents (collapse on phones, scroll spy)
 * - front-page composer: turns plain Markdown into agenda rows and event cards
 * - fallback for the front-page mini game (intro.js) when it cannot run
 * - count-up animation for the stats band
 * - side-by-side photo rows and a lightbox for post media
 */
(function () {
  "use strict";

  var doc = document;

  function $(sel, root) {
    return (root || doc).querySelector(sel);
  }

  function $$(sel, root) {
    return Array.prototype.slice.call((root || doc).querySelectorAll(sel));
  }

  function el(tag, cls, html) {
    var node = doc.createElement(tag);
    if (cls) node.className = cls;
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  var isMobile = window.matchMedia("(max-width: 900px)");

  /* ------------------------------------------------------------------ */
  /* Navigation                                                          */
  /* ------------------------------------------------------------------ */

  function initNav() {
    var nav = $(".nav");
    var toggle = $(".nav__toggle");
    if (!nav || !toggle) return;

    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      doc.documentElement.classList.toggle("menu-open", open);
    });

    $$(".nav__item--section > a").forEach(function (link) {
      link.addEventListener("click", function (event) {
        if (!isMobile.matches) return;
        event.preventDefault();
        var item = link.parentNode;
        var open = item.classList.toggle("is-open");
        link.setAttribute("aria-expanded", open ? "true" : "false");
      });
    });

    doc.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && nav.classList.contains("is-open")) {
        toggle.click();
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Table of contents                                                   */
  /* ------------------------------------------------------------------ */

  function initToc() {
    var toc = $("details.toc");
    if (!toc) return;

    function sync() {
      if (!isMobile.matches) toc.open = true;
    }
    if (isMobile.matches) toc.open = false;
    if (isMobile.addEventListener) isMobile.addEventListener("change", sync);
    else if (isMobile.addListener) isMobile.addListener(sync);

    var links = $$("a[href^='#']", toc);
    if (!links.length || !("IntersectionObserver" in window)) return;

    var map = {};
    links.forEach(function (link) {
      map[decodeURIComponent(link.getAttribute("href").slice(1))] = link;
    });

    var headings = $$(".post__body h1[id], .post__body h2[id], .post__body h3[id], .post__body h4[id]").filter(function (h) {
      return map[h.id];
    });
    if (!headings.length) return;

    var current = null;
    function activate(id) {
      if (current === id) return;
      current = id;
      links.forEach(function (link) {
        link.classList.remove("is-active");
      });
      if (map[id]) map[id].classList.add("is-active");
    }

    var observer = new IntersectionObserver(
      function () {
        var top = window.scrollY + 120;
        var active = headings[0];
        for (var i = 0; i < headings.length; i++) {
          if (headings[i].getBoundingClientRect().top + window.scrollY <= top) active = headings[i];
        }
        activate(active.id);
      },
      { rootMargin: "-100px 0px -60% 0px", threshold: [0, 1] }
    );
    headings.forEach(function (h) {
      observer.observe(h);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Helpers for the composer                                            */
  /* ------------------------------------------------------------------ */

  function siblingsUntil(node, stop) {
    var out = [];
    var next = node.nextElementSibling;
    while (next && !next.matches(stop)) {
      out.push(next);
      next = next.nextElementSibling;
    }
    return out;
  }

  function firstImage(nodes) {
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].tagName === "IMG") return nodes[i];
      var img = nodes[i].querySelector && nodes[i].querySelector("img");
      if (img) return img;
    }
    return null;
  }

  function isEmptyNode(node) {
    return !node.textContent.replace(/ /g, " ").trim() && !node.querySelector("img, video");
  }

  var MONTHS = {
    januar: 0, jan: 0, februar: 1, feb: 1, "märz": 2, marz: 2, maerz: 2, mar: 2,
    april: 3, apr: 3, mai: 4, juni: 5, jun: 5, juli: 6, jul: 6,
    august: 7, aug: 7, september: 8, sep: 8, sept: 8, oktober: 9, okt: 9,
    november: 10, nov: 10, dezember: 11, dez: 11
  };

  /* Understands "27. Februar 2027", "27.02.2027", "2027-02-27". */
  function parseDate(text) {
    var t = text.trim().toLowerCase();
    var m = t.match(/(\d{1,2})\.?\s+([a-zäöü]+)\.?\s+(\d{4})/);
    if (m && MONTHS[m[2]] !== undefined) return new Date(+m[3], MONTHS[m[2]], +m[1]);
    m = t.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    return null;
  }

  function relativeLabel(date) {
    if (!date) return "";
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var days = Math.round((date - today) / 86400000);
    if (days === 0) return "Hüt";
    if (days === 1) return "Morn";
    if (days < 0) return "Verbi";
    if (days < 60) return "In " + days + " Täg";
    if (days < 365) return "In " + Math.round(days / 30) + " Mönet";
    return "In " + (days / 365).toFixed(1).replace(/\.0$/, "") + " Johr";
  }

  function pad(n) {
    return (n < 10 ? "0" : "") + n;
  }

  /* ------------------------------------------------------------------ */
  /* Agenda calendar file (.ics)                                         */
  /* A row tap hands the phone or computer a VEVENT. Defaults:           */
  /* 12:00–23:00 Europe/Zurich, summary "Fortilegends - <title>",        */
  /* COLOR:red (CSS color name, RFC 7986).                               */
  /* ------------------------------------------------------------------ */

  var CAL_COLOR = "red";
  var CAL_START = { h: 12, min: 0 };
  var CAL_END = { h: 23, min: 0 };
  var CAL_URL = "https://fortilegends.ch/";
  var EXTRA_KEYS = {
    ort: "location", location: "location", wo: "location",
    info: "info", text: "info", beschrib: "info", beschreibung: "info",
    notiz: "info", details: "info",
    zit: "time", ziit: "time", zeit: "time", time: "time",
    farb: "color", farbe: "color", color: "color",
    link: "link", url: "link"
  };

  var ZURICH_ZONE = [
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Zurich",
    "X-LIC-LOCATION:Europe/Zurich",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:CEST",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:CET",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "END:VTIMEZONE"
  ];

  function plainText(html) {
    var node = doc.createElement("div");
    node.innerHTML = html;
    return (node.textContent || "").replace(/\s+/g, " ").trim();
  }

  function ownCode(li) {
    var codes = $$("code", li);
    for (var i = 0; i < codes.length; i++) {
      var parent = codes[i].parentNode;
      var nested = false;
      while (parent && parent !== li) {
        if (parent.tagName === "UL" || parent.tagName === "OL") nested = true;
        parent = parent.parentNode;
      }
      if (!nested) return codes[i];
    }
    return null;
  }

  function agendaTitle(li) {
    var strong = li.querySelector("strong");
    if (strong) {
      var parent = strong.parentNode;
      var nested = false;
      while (parent && parent !== li) {
        if (parent.tagName === "UL" || parent.tagName === "OL") nested = true;
        parent = parent.parentNode;
      }
      if (!nested) return strong.innerHTML;
    }
    var clone = li.cloneNode(true);
    $$("ul, ol, code", clone).forEach(function (n) {
      n.parentNode.removeChild(n);
    });
    return clone.innerHTML.replace(/^[\s–—-]+/, "").trim();
  }

  function lineToExtra(text, out) {
    text = String(text).replace(/\s+/g, " ").trim();
    if (!text) return;
    var match = text.match(/^([A-Za-zäöüÄÖÜ]+)\s*:\s*(.*)$/);
    var key = match ? EXTRA_KEYS[match[1].toLowerCase()] : "";
    if (!key) {
      out.notes.push(text);
      return;
    }
    var value = match[2].trim();
    if (!value) return;
    if (key === "info") out.notes.push(value);
    else if (key === "time") out.timeText = value;
    else out[key] = value;
  }

  /* Nested bullets (4 spaces in this Markdown) and a following bullet with
     no date both count as extra lines for the event above them. */
  function agendaExtras(li, siblingLines) {
    var out = { location: "", notes: [], timeText: "", color: "", link: "" };
    var lines = siblingLines ? siblingLines.slice() : [];
    Array.prototype.forEach.call(li.children, function (child) {
      if (child.tagName !== "UL" && child.tagName !== "OL") return;
      Array.prototype.forEach.call(child.children, function (item) {
        if (item.tagName === "LI") lines.push(item.textContent || "");
      });
    });
    lines.forEach(function (line) {
      lineToExtra(line, out);
    });
    return out;
  }

  function stripClocks(text) {
    return text
      .replace(/\s+\d{1,2}:\d{2}\s*(?:[-–—]|bis)\s*\d{1,2}:\d{2}/gi, "")
      .replace(/\s+\d{1,2}:\d{2}/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseClock(token) {
    var match = String(token).match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    var h = +match[1];
    var min = +match[2];
    if (h > 23 || min > 59) return null;
    return { h: h, min: min };
  }

  function parseTimeRange(text) {
    var tokens = String(text).match(/\d{1,2}:\d{2}/g) || [];
    return {
      start: tokens[0] ? parseClock(tokens[0]) : null,
      end: tokens[1] ? parseClock(tokens[1]) : null
    };
  }

  function resolveTimes(range) {
    var start = range.start || CAL_START;
    var end = range.end || CAL_END;
    var nextDay = end.h * 60 + end.min <= start.h * 60 + start.min;
    return { start: start, end: end, nextDay: nextDay };
  }

  function calendarColor(value) {
    var v = (value || "").trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) return v.toUpperCase();
    if (/^[a-z]{3,20}$/i.test(v)) return v.toLowerCase();
    return CAL_COLOR;
  }

  function httpUrl(value) {
    var v = (value || "").trim();
    return /^https?:\/\/\S+$/i.test(v) ? v : "";
  }

  function clockLabel(hm) {
    return pad(hm.h) + ":" + pad(hm.min);
  }

  function icsText(value) {
    return String(value)
      .replace(/\\/g, "\\\\")
      .replace(/\r\n|\n|\r/g, "\\n")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,");
  }

  function foldLine(line) {
    var encoder = new TextEncoder();
    if (encoder.encode(line).length <= 75) return line;
    var out = "";
    var size = 0;
    var chars = Array.from(line);
    for (var i = 0; i < chars.length; i++) {
      var n = encoder.encode(chars[i]).length;
      if (size + n > 75) {
        out += "\r\n ";
        size = 1;
      }
      out += chars[i];
      size += n;
    }
    return out;
  }

  function icsStamp(date) {
    return date.getUTCFullYear()
      + pad(date.getUTCMonth() + 1)
      + pad(date.getUTCDate())
      + "T"
      + pad(date.getUTCHours())
      + pad(date.getUTCMinutes())
      + pad(date.getUTCSeconds())
      + "Z";
  }

  function icsLocal(date, hm) {
    return date.getFullYear()
      + pad(date.getMonth() + 1)
      + pad(date.getDate())
      + "T"
      + pad(hm.h)
      + pad(hm.min)
      + "00";
  }

  function addDays(date, days) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  }

  function slug(text) {
    return text.toLowerCase()
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
  }

  function buildIcs(entry) {
    var endDate = entry.times.nextDay ? addDays(entry.date, 1) : entry.date;
    var summary = "Fortilegends - " + entry.title;
    var whenLine = entry.shownDate + ", " + clockLabel(entry.times.start) + "–" + clockLabel(entry.times.end);
    var desc = [whenLine];
    if (entry.notes.length) desc.push(entry.notes.join("\n"));
    desc.push(entry.link || CAL_URL);
    var lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Forti-Legends//fortilegends.ch//DE",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "COLOR:" + entry.color
    ].concat(ZURICH_ZONE, [
      "BEGIN:VEVENT",
      "UID:" + entry.uid,
      "DTSTAMP:" + icsStamp(new Date()),
      "DTSTART;TZID=Europe/Zurich:" + icsLocal(entry.date, entry.times.start),
      "DTEND;TZID=Europe/Zurich:" + icsLocal(endDate, entry.times.end),
      "SUMMARY:" + icsText(summary),
      "DESCRIPTION:" + icsText(desc.join("\n\n")),
      "URL:" + (entry.link || CAL_URL),
      entry.location ? "LOCATION:" + icsText(entry.location) : "",
      "COLOR:" + entry.color,
      "STATUS:CONFIRMED",
      "END:VEVENT",
      "END:VCALENDAR"
    ]).filter(Boolean);
    return lines.map(foldLine).join("\r\n") + "\r\n";
  }

  function isIos() {
    var ua = navigator.userAgent || "";
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  }

  /* iPhone Safari hands a text/calendar data URL to Calendar. Elsewhere the
     browser downloads the .ics and the default calendar app opens it. */
  function openCalendar(ics, filename) {
    if (isIos()) {
      var href = "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
      var opened = window.open(href, "_blank");
      if (!opened) window.location.assign(href);
      return;
    }
    var blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = doc.createElement("a");
    link.href = url;
    link.download = filename;
    doc.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 4000);
  }

  /* ------------------------------------------------------------------ */
  /* Agenda: `## Ausblick { .agenda }` + list                              */
  /* ------------------------------------------------------------------ */

  function buildAgenda(h2) {
    var nodes = siblingsUntil(h2, "h2");
    var list = null;
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].matches("ul, ol")) {
        list = nodes[i];
        break;
      }
    }
    if (!list) return;

    h2.classList.remove("agenda");
    var section = el("section", "agenda");
    var head = el("div", "agenda__head");
    var headText = el("div");
    headText.appendChild(el("p", "agenda__kicker", "Ausblick //"));
    head.appendChild(headText);
    h2.parentNode.insertBefore(section, h2);
    headText.appendChild(h2);
    section.appendChild(head);

    var items = [];
    Array.prototype.forEach.call(list.children, function (node) {
      if (node.tagName !== "LI") return;
      if (ownCode(node) || !items.length) {
        items.push({ li: node, lines: [] });
      } else {
        items[items.length - 1].lines.push(node.textContent || "");
      }
    });
    var count = el("p", "agenda__count", items.length + " Termin" + (items.length === 1 ? "" : "e") + " //");
    head.appendChild(count);
    var status = el("p", "sr-only");
    status.setAttribute("aria-live", "polite");
    head.appendChild(status);

    var ol = el("ol", "agenda__list");
    items.forEach(function (item, index) {
      var li = item.li;
      var row = el("li", "agenda__row");
      var code = ownCode(li);
      var dateText = code ? code.textContent.trim() : "";
      var titleHtml = agendaTitle(li);
      var title = plainText(titleHtml);
      var extras = agendaExtras(li, item.lines);
      var shownDate = stripClocks(dateText) || dateText;
      var date = parseDate(shownDate);
      var range = parseTimeRange(extras.timeText || dateText);
      var times = resolveTimes(range);
      var when = relativeLabel(date);
      var face = date && title ? el("button", "agenda__add") : el("div", "agenda__add");
      if (face.tagName === "BUTTON") face.type = "button";

      var idx = el("span", "agenda__idx");
      idx.textContent = pad(index + 1);
      var dateEl = el("span", "agenda__date");
      dateEl.textContent = shownDate;
      var titleEl = el("span", "agenda__title", titleHtml);
      var whenEl = el("span", "agenda__when");
      whenEl.textContent = when || "//";
      face.appendChild(idx);
      face.appendChild(dateEl);
      face.appendChild(titleEl);
      face.appendChild(whenEl);
      row.appendChild(face);

      if (face.tagName === "BUTTON") {
        var color = calendarColor(extras.color);
        var link = httpUrl(extras.link);
        var day = date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate());
        var entry = {
          title: title,
          shownDate: shownDate,
          date: date,
          times: times,
          notes: extras.notes,
          location: extras.location,
          link: link,
          color: color,
          uid: "fortilegends-" + day + "-" + (slug(title) || "termin") + "@fortilegends.ch"
        };
        var filename = "fortilegends-" + (slug(title) || "termin") + ".ics";
        face.setAttribute("aria-label", title + ", " + shownDate + ", in Kalender iträge");
        face.addEventListener("click", function () {
          openCalendar(buildIcs(entry), filename);
          status.textContent = title + " isch als Kalenderdatei parat.";
        });
      }

      ol.appendChild(row);
    });

    section.appendChild(ol);
    nodes.forEach(function (n) {
      if (n === list || isEmptyNode(n)) n.parentNode.removeChild(n);
      else section.appendChild(n);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Card columns: `## 2026 { .cards }` + (h3, meta, text, link, image)*  */
  /* ------------------------------------------------------------------ */

  function buildCard(h3, nodes) {
    var card = el("article", "card");
    var link = el("a", "card__link");
    card.appendChild(link);

    var href = null;
    var ctaText = "";
    var dateText = "";
    var subtitleHtml = "";
    var descParts = [];
    var img = firstImage(nodes);

    nodes.forEach(function (node) {
      if (node.tagName === "P" || node.tagName === "DIV") {
        var clone = node.cloneNode(true);
        var code = clone.querySelector("code");
        if (code && !dateText) {
          dateText = code.textContent.trim();
          code.parentNode.removeChild(code);
        }
        var strong = clone.querySelector("strong");
        if (strong && !subtitleHtml) {
          subtitleHtml = strong.innerHTML;
          strong.parentNode.removeChild(strong);
        }
        var a = clone.querySelector("a");
        if (a && !href) {
          href = a.getAttribute("href");
          ctaText = a.textContent.trim();
          a.parentNode.removeChild(a);
        }
        $$("img", clone).forEach(function (i) {
          i.parentNode.removeChild(i);
        });
        var text = clone.innerHTML.replace(/^[\s:–—-]+|[\s:.–—-]+$/g, "").trim();
        if (text) descParts.push(text);
      }
    });

    if (href) link.href = href;
    else link.removeAttribute("href");

    link.appendChild(h3);
    h3.className = "card__title";

    var meta = el("div", "card__meta");
    if (dateText) meta.appendChild(el("span", "card__date", dateText));
    if (meta.childNodes.length) link.appendChild(meta);
    if (subtitleHtml) link.appendChild(el("div", "card__subtitle", subtitleHtml));
    if (descParts.length) link.appendChild(el("p", "card__desc", descParts.join(" ")));

    if (img) {
      var media = el("div", "card__media");
      img.removeAttribute("width");
      img.removeAttribute("height");
      img.loading = "lazy";
      media.appendChild(img);
      link.appendChild(media);
    }

    if (href) link.appendChild(el("div", "card__cta", ctaText || "Zum Biitrag"));
    return card;
  }

  function buildCards(h2) {
    var nodes = siblingsUntil(h2, "h2");
    h2.classList.remove("cards");
    var section = el("section", "card-column");
    var head = el("div", "card-column__head");
    head.appendChild(el("p", "card-column__kicker", (h2.getAttribute("data-kicker") || "Vereinsjohr") + " //"));
    h2.parentNode.insertBefore(section, h2);
    head.appendChild(h2);
    section.appendChild(head);

    var groups = [];
    var current = null;
    nodes.forEach(function (node) {
      if (node.tagName === "H3") {
        current = { h3: node, nodes: [] };
        groups.push(current);
      } else if (current) {
        current.nodes.push(node);
      } else if (!isEmptyNode(node)) {
        section.appendChild(node);
      } else {
        node.parentNode.removeChild(node);
      }
    });

    head.appendChild(el("span", "card-column__count", groups.length + " Event" + (groups.length === 1 ? "" : "s")));

    /* The whole head toggles the column; the button is there for keyboards. */
    var toggle = el("button", "card-column__toggle");
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", (h2.textContent || "").trim() + " zueklappe");
    head.appendChild(toggle);
    head.addEventListener("click", function (event) {
      if (event.target.closest("a")) return;
      var collapsed = section.classList.toggle("is-collapsed");
      toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
      toggle.setAttribute("aria-label", (h2.textContent || "").trim() + (collapsed ? " ufklappe" : " zueklappe"));
    });

    groups.forEach(function (group) {
      var card = buildCard(group.h3, group.nodes);
      group.nodes.forEach(function (n) {
        if (n.parentNode) n.parentNode.removeChild(n);
      });
      section.appendChild(card);
    });
    return section;
  }

  function wrapColumns(body) {
    var cols = $$(".card-column", body);
    cols.forEach(function (col) {
      if (col.parentNode.classList.contains("columns")) return;
      var wrapper = el("div", "columns");
      col.parentNode.insertBefore(wrapper, col);
      var next = col;
      while (next && next.classList && next.classList.contains("card-column")) {
        var after = next.nextElementSibling;
        wrapper.appendChild(next);
        next = after;
      }
    });
  }

  function moveLeadToHero(body) {
    var hero = $(".hero__text");
    if (!hero || hero.childNodes.length) return;
    var lead = [];
    var node = body.firstElementChild;
    while (node && !node.matches("h1, h2, h3, section, .columns")) {
      lead.push(node);
      node = node.nextElementSibling;
    }
    lead.forEach(function (n) {
      hero.appendChild(n);
    });
  }

  function composeFrontPage() {
    var body = $(".post--home .post__body");
    if (!body) return;
    moveLeadToHero(body);
    $$("h2.agenda", body).forEach(buildAgenda);
    $$("h2.cards", body).forEach(buildCards);
    wrapColumns(body);
    body.classList.add("is-composed");
  }

  /* ------------------------------------------------------------------ */
  /* Count-up numbers                                                    */
  /* ------------------------------------------------------------------ */

  function initCountUp() {
    var values = $$(".stat__value[data-count]");
    if (!values.length) return;
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function run(node) {
      var target = parseFloat(node.getAttribute("data-count"));
      var text = node.getAttribute("data-text");
      var decimals = (text.split(".")[1] || "").length;
      var start = null;
      var duration = 1400;
      var span = node.querySelector(".stat__number");
      function step(ts) {
        if (!start) start = ts;
        var p = Math.min(1, (ts - start) / duration);
        var eased = 1 - Math.pow(1 - p, 3);
        span.textContent = (target * eased).toFixed(decimals);
        if (p < 1) requestAnimationFrame(step);
        else span.textContent = text;
      }
      requestAnimationFrame(step);
    }

    if (reduce || !("IntersectionObserver" in window)) return;
    var pending = values.slice();
    function start(node) {
      var idx = pending.indexOf(node);
      if (idx === -1) return;
      pending.splice(idx, 1);
      observer.unobserve(node);
      run(node);
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) start(entry.target);
      });
    }, { threshold: 0.3 });
    values.forEach(function (v) {
      v.querySelector(".stat__number").textContent = "0";
      observer.observe(v);
    });
    /* Safety net: never leave zeros on screen if the observer never fires. */
    setTimeout(function () {
      pending.slice().forEach(start);
    }, 4000);
  }

  /* ------------------------------------------------------------------ */
  /* Post media: photo rows + lightbox                                   */
  /* ------------------------------------------------------------------ */

  function initMediaRows() {
    var body = $(".post--article .post__body");
    if (!body) return;
    var figures = $$(":scope > figure", body);
    var i = 0;
    while (i < figures.length) {
      var run = [figures[i]];
      while (
        run.length < 2 &&
        figures[i + run.length] &&
        run[run.length - 1].nextElementSibling === figures[i + run.length] &&
        !figures[i + run.length].querySelector("video") &&
        !run[0].querySelector("video")
      ) {
        run.push(figures[i + run.length]);
      }
      if (run.length === 2) {
        var row = el("div", "media-row");
        run[0].parentNode.insertBefore(row, run[0]);
        run.forEach(function (f) {
          row.appendChild(f);
        });
      }
      i += run.length;
    }
  }

  function initLightbox() {
    var imgs = $$(".post__body img").filter(function (img) {
      return !img.closest("a") && !img.closest(".card") && !img.closest(".gossau-gossow");
    });
    if (!imgs.length) return;

    var box = el("div", "lightbox");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    var pic = el("img");
    var close = el("button", "lightbox__close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Schliesse");
    box.appendChild(pic);
    box.appendChild(close);
    doc.body.appendChild(box);

    function open(src, alt) {
      pic.src = src;
      pic.alt = alt || "";
      box.classList.add("is-open");
      doc.documentElement.classList.add("lightbox-open");
    }
    function shut() {
      box.classList.remove("is-open");
      doc.documentElement.classList.remove("lightbox-open");
      pic.removeAttribute("src");
    }

    imgs.forEach(function (img) {
      img.setAttribute("data-zoom", "");
      img.addEventListener("click", function () {
        open(img.currentSrc || img.src, img.alt);
      });
    });
    box.addEventListener("click", shut);
    doc.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && box.classList.contains("is-open")) shut();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Front-page intro (mini game): the 3D part lives in intro.js (ES     */
  /* module). If it never reports ready (old browser, CDN blocked, no    */
  /* WebGL), show the calm static version so the title is always there.  */
  /* ------------------------------------------------------------------ */

  function initIntroFallback() {
    var intro = $(".intro");
    if (!intro) return;
    setTimeout(function () {
      if (!intro.classList.contains("is-ready")) intro.classList.add("is-static");
    }, 6000);
  }

  /* ------------------------------------------------------------------ */

  function init() {
    initNav();
    composeFrontPage();
    initIntroFallback();
    initToc();
    initCountUp();
    initMediaRows();
    initLightbox();
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init);
  else init();
})();
