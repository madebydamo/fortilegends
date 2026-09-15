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

    var items = $$("li", list);
    var count = el("p", "agenda__count", items.length + " Termin" + (items.length === 1 ? "" : "e") + " //");
    head.appendChild(count);

    var ol = el("ol", "agenda__list");
    items.forEach(function (li, index) {
      var row = el("li", "agenda__row");
      var code = li.querySelector("code");
      var strong = li.querySelector("strong");
      var dateText = code ? code.textContent : "";
      var titleHtml;
      if (strong) {
        titleHtml = strong.innerHTML;
      } else {
        var clone = li.cloneNode(true);
        var c = clone.querySelector("code");
        if (c) c.parentNode.removeChild(c);
        titleHtml = clone.innerHTML.replace(/^[\s–—-]+/, "");
      }
      var when = relativeLabel(parseDate(dateText));
      row.appendChild(el("span", "agenda__idx", pad(index + 1)));
      row.appendChild(el("span", "agenda__date", dateText));
      row.appendChild(el("span", "agenda__title", titleHtml));
      row.appendChild(el("span", "agenda__when", when || "//"));
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
