# MkDocs Simple Blog (FortiLegends fork)

Vendored from [FernandoCelmer/mkdocs-simple-blog](https://github.com/FernandoCelmer/mkdocs-simple-blog) **v0.6.1**
(`9562df46713ed3309aa6d6849ed743853de65870`). MIT licensed; original `LICENSE` retained.

Edit templates in `mkdocs_simple_blog/` and the CSS/JS that MkDocs serves in
`mkdocs_simple_blog/assets/`. Unminified CSS/JS sources are in `template/`.

The Docker image installs this directory instead of the PyPI package. Keep
`theme.name: simple-blog` in `mkdocs.yml`.

## Design

The look follows a brutalist, editorial style: off-white page, black 1px grid
lines, huge tight `Inter` headings and `Roboto Mono` for everything else
(both loaded from Google Fonts). Bootstrap and jQuery are no longer used; the
theme ships one small `main.js`.

Global pieces on every page:

- **Header**: pill logo, nav with hover dropdowns for the year folders,
  `Suche` link. Collapses into a full-screen menu on phones.
- **Ticker** (`marquee`): black bar that scrolls all post titles. Set
  `theme.marquee: false` in `mkdocs.yml` to turn it off, or give it a list of
  strings to show your own text.
- **Footer**: three bordered columns (description, index, "Mitmache" with the
  edit link from `edit_uri`). `theme.footer_tagline` sets the second line.

Post pages get a big title block with `Datum // Autor // Kurz gseit` cells
taken from the front matter, a sticky `INDEX` table of contents on the left
(`theme.sidebar: true`), bordered photos with captions, side-by-side photo rows
when two images follow each other, a click-to-zoom lightbox, and a
`Vorher / Wiiter` pager. Inline `code` (backticks) is drawn as a thin framed
box in the running text instead of a black block; the frame repeats on every
line when it wraps. Fenced code blocks stay black.

## Front page (`index.md`)

The front page is built from ordinary Markdown plus a bit of front matter. The
theme renders the hero and the stats band itself; `main.js` turns the Markdown
below into agenda rows and event cards (without JS the page is still readable
Markdown).

```yaml
---
title: Willkommen bei Forti-Legends
hero:
  kicker: Ziitkapsle vo de Forti-Legends // sit 2024   # small line above the title
  title: Forti-Legends                                 # defaults to site_name
  image: assets/2026_3_gruppenfoto.jpeg                # big photo on the right
  image_alt: Die Legende vor em Big Event
  image_tag: Big Event 2026 // Gossow                  # little label on the photo
  cta: Zum neuste Biitrag                              # button label
  # cta_url: 2026/3_Bigevent.md                        # default: newest post by date
  # cta2: Zur Gründig                                  # optional second (solid) button
  # cta2_url: 2024/die_gruendung.md
stats:                                                 # optional; defaults are computed
  - { label: Events, value: 10 }
  - { label: Legende, value: 23, caption: Mitglieder }  # caption is optional
  - { label: Bier, value: 1.2, unit: K }
  - { label: Status, value: Live }                      # text values work too
stats_title: Legendär sit 2024                         # fat heading above the numbers
---
```

Set `hero: false` or `stats: false` to hide a block. Without `stats` the theme
shows `Events` (post count), `Jahre` (year folders), `Status // Live` and
`Chronik // On`. The band is a fat title (default **Legendär sit 2024**), then
the stats in a row (2 x 2 on tablets and phones), each with a thin left rule.
Numbers count up when they scroll into view.

Everything before the first `##` heading becomes the hero text.

### Mini game intro (throw the handball)

The front page starts with a white stage: a handball goal with red/white
posts (thin black outlines keep the white parts visible) and a red / navy
handball with white speed lines and the site name as its wordmark, held at
hand height. The visitor throws it into the goal:

- **Phone**: swipe in any direction. The ball follows that direction and
  curves into the goal; it can't miss. A tap throws straight.
- **Desktop**: point the mouse (a dotted arrow shows the direction) and click.

Then the movie: the net swings, the ball drops, the title slides in over the
scene, and the ball rolls back and on down the page in one continuous motion.
The page scrolls along and the stage title travels down with it and turns
into the hero title (same font and the same line breaks, so it is one shape
the whole way, each line on a page-coloured backing; `.hero__title` stays
hidden until it arrives). From the roll-back on the ball is drawn on its own
small canvas (`.intro__pageball`) above everything, so it always passes in
front of the title; a hidden stand-in keeps its shadow on the stage floor. It all ends with the hero at the top of the screen (right under
the header) and the ball resting next to the first line of the hero title,
wordmark to the front. Scrolling during that motion hands the scroll back to
the visitor. From there the normal page continues (hero, stats, agenda,
cards). Scrolling before the throw skips straight to that end state. Clicking
or tapping the resting ball plays again. Visitors with "reduced motion" get
the end state right away; without WebGL (or if the CDN is blocked) the stage
shows just the title.

Above the goal hangs a hall scoreboard: team names, score, period, the game
clock (counts up to the end of the half and stops there) and a penalty timer
(player number and time, counts down and stops together with the game
clock). A goal adds one point to the home score. It is drawn in code (no
image), so the numbers are configurable:

The 3D part is `assets/js/intro.min.js` (source `template/assets/js/intro.js`),
an ES module that loads three.js from jsdelivr through an import map in
`base.html`. Styles are the `Game intro` block in `main.css` / `media.css`,
markup is `modules/intro.html`. The resting spot is computed from
`.hero__title` (first line) and `.hero__copy`; without a hero the ball rests
in the stage.

Optional front matter:

```yaml
intro:
  title: Forti-Legends                       # defaults to site_name
  kicker: Ziitkapsle vo de Forti-Legends     # small line top left
  label: Mini-Game // Wirf de Ball is Goal   # small line top right (hidden on phones)
  since: 2024                                # used in the default kicker
  hint: Klick, zum de Ball wärfe             # bottom hint before the throw
  hint_done: Scrolle ↓                       # bottom hint afterwards
  ball_model: assets/models/handball/scene.gltf   # see below
  ball_front: 0,0,0                          # x,y,z degrees: turn the model so its logo faces front
  goal_model: assets/models/goal/scene.gltf
  goal_rotation: 0                           # degrees, if the goal faces the wrong way (try 180)
  board:                                     # scoreboard above the goal (board: false hides it)
    home: Forti
    guest: Gast
    score: 64:5                              # home:guest before the throw (+1 for home at the goal)
    period: 2
    clock: 29:30                             # game clock, counts up to 30:00 (or 60:00)
    penalty: 1:09                            # penalty time, counts down
    penalty_number: 3                        # number of the penalised player
```

Set `intro: false` to turn the stage off.

**Real 3D models.** Without `ball_model` / `goal_model` the theme draws its own
ball and goal in code. To use the Sketchfab models
([Football_085, a Kempa handball](https://sketchfab.com/3d-models/football-085-b6314e3f5c274e40b3c62141ffbfba7f),
[Cartoon Handball Goal Post](https://sketchfab.com/3d-models/cartoon-handball-goal-post-bdb0492c70c7405c8f47189a524ba967)),
download them as glTF, unzip each into
`mkdocs_simple_blog/assets/models/<name>/` (so that `scene.gltf`, `scene.bin`
and `textures/` sit there; a single `.glb` works too), set `ball_model` /
`goal_model` in the front matter and rebuild the image. The theme sizes and
places the models itself; the ball keeps its colours, black parts of the goal
become red (`#e11c1e`) and solid parts get black outlines. The net of a loaded goal is found by name (`net`), so the ball can
push it. Use `ball_front` to turn the model so its logo faces the visitor at
rest. Draco-compressed files are not supported; keep textures at 1024 px or
smaller so the page stays quick. Mind the model licenses.

### Agenda (upcoming dates)

```markdown
## Ausblick { .agenda }

- `27. Februar 2027` **2. Generalversammlung**
- `12. Dezember 2026` **Winter Wonderland**
```

Each list item becomes a numbered row: date in backticks, title in bold. The
theme adds a "In 3 Mönet / Verbi" cell by reading the date (formats
`27. Februar 2027`, `27.02.2027`, `2027-02-27`).

### Event cards

```markdown
## 2026 { .cards }

### Der Big Event - Wahlfahrt von Gossow nach Gossow

`01. August 2026` **Nationalfeiertag, Adiletten und der letzte Becher**

Big Event des zweiten Geschäftsjahres. [so ischäs abglaufä](2026/3_Bigevent.md)

![](assets/2026_3_gruppenfoto.jpeg)
```

Every `###` under a `{ .cards }` heading becomes one card: the backtick date,
the bold subtitle, the remaining text, the first link (the whole card links
there and the link text becomes the arrow line) and the first image (4:3,
cropped). Consecutive `{ .cards }` sections sit next to each other as columns
(3 on desktop, 2 on tablets, 1 on phones). Add `{ .cards data-kicker="Saison" }`
to change the small "Vereinsjohr //" label. Clicking a year head (or its
arrow button) folds that column so only the head stays; click again to open
it. Handy on phones, where the years stack.

### Other building blocks

| Markdown | Result |
|----------|--------|
| `## Bis zum nöchschte Mol. { .display }` | Giant headline |
| `[Text](page.md){ .button }` | Outlined button |
| `[Text](page.md){ .button .button--solid }` | Black button |
| `Text { .lead }` on a paragraph | Larger intro paragraph |
| `<span class="badge">Neu</span>` | Small bordered label |

All of these need the `attr_list` Markdown extension, which is on.

## Editing the CSS/JS

Sources live in `template/assets/css/*.css` and `template/assets/js/main.js`.
The served files are the `.min` twins in `mkdocs_simple_blog/assets/`. After
editing a source, regenerate them (Node is enough, no install needed):

```sh
cd theme
npx --yes clean-css-cli@5 -O1 --inline none -o mkdocs_simple_blog/assets/css/root.min.css  template/assets/css/root.css
npx --yes clean-css-cli@5 -O1 --inline none -o mkdocs_simple_blog/assets/css/main.min.css  template/assets/css/main.css
npx --yes clean-css-cli@5 -O1 --inline none -o mkdocs_simple_blog/assets/css/media.min.css template/assets/css/media.css
npx --yes terser@5 template/assets/js/main.js -c -m -o mkdocs_simple_blog/assets/js/main.min.js
```

If clean-css rewrites the `@import url(root.min.css)` line at the top of
`main.min.css`/`media.min.css` to a `template/...` path, change it back to
`root.min.css`.

---

# [MkDocs Simple Blog](https://fernandocelmer.github.io/mkdocs-simple-blog/)
>  Theme for [MkDocs](https://www.mkdocs.org/)

![Image](https://raw.githubusercontent.com/FernandoCelmer/mkdocs-simple-blog/develop/docs/assets/simple-blog.png)

![GitHub forks](https://img.shields.io/github/forks/FernandoCelmer/mkdocs-simple-blog?label=Forks&style=flat-square)
![GitHub Repo stars](https://img.shields.io/github/stars/FernandoCelmer/mkdocs-simple-blog?label=Stars&style=flat-square)
![GitHub last commit](https://img.shields.io/github/last-commit/FernandoCelmer/mkdocs-simple-blog?style=flat-square)
![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/FernandoCelmer/mkdocs-simple-blog/python-publish-pypi.yml?label=%F0%9F%93%A6%20PyPI&style=flat-square)
![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/FernandoCelmer/mkdocs-simple-blog/python-publish-pypi-test.yml?label=%F0%9F%93%A6%20PyPI-Test&style=flat-square)

## Install

### Installation MkDocs

To install MkDocs, run the following command from the command line:

```bash
pip install mkdocs
```

### Installation theme

Install the theme using PIP:

```bash
pip install mkdocs-simple-blog
```

### Activating theme

After the theme is installed, edit your `mkdocs.yml` file and set the theme name to `simple-blog`:

```yml
theme:
    name: simple-blog
```

## Screenshots

**Blog List — featured layout**

![Blog List featured layout](https://raw.githubusercontent.com/FernandoCelmer/mkdocs-simple-blog/develop/docs/assets/blog-list-featured.png)

**Blog List — compact layout**

![Blog List compact layout](https://raw.githubusercontent.com/FernandoCelmer/mkdocs-simple-blog/develop/docs/assets/blog-list-compact.png)

## Getting Help

We use GitHub issues for tracking bugs and feature requests and have limited bandwidth to address them. If you need anything, I ask you to please follow our templates for opening issues or discussions.

- 🐛 [Bug Report](https://github.com/FernandoCelmer/mkdocs-simple-blog/issues/new/choose)
- 📕 [Documentation Issue](https://github.com/FernandoCelmer/mkdocs-simple-blog/issues/new/choose)
- 🚀 [Feature Request](https://github.com/FernandoCelmer/mkdocs-simple-blog/issues/new/choose)
- ⚠️ [Security Request](https://github.com/FernandoCelmer/mkdocs-simple-blog/issues/new/choose)
- 💬 [General Question](https://github.com/FernandoCelmer/mkdocs-simple-blog/issues/new/choose)

## Commit Style

- ⚙️ FEATURE
- 📝 PEP8
- 📌 ISSUE
- 🪲 BUG
- 📘 DOCS
- 📦 PyPI
- ❤️️ TEST
- ⬆️ CI/CD
- ⚠️ SECURITY

## License
![GitHub License](https://img.shields.io/github/license/FernandoCelmer/mkdocs-simple-blog)

This project is licensed under the terms of the MIT License.
