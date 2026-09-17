# Forti-Legends Blog

The blog of the **Forti-Legends** social club (https://fortilegends.ch/). It's a
record of the club's events: friendship, memories, good times. Built with MkDocs
and our own fork of the `simple-blog` theme. Posts are mostly in Swiss German or
German, so any text you add to the site should use the same tone and language.

## Goal

Make the site look as good as possible. Most of the work happens in the
**theme**. The **front page** (`index.md`) should be really flashy, the best
page on the site.

## Where to edit and where not

| Path | Rule |
|------|------|
| `theme/` | **Main place to work.** Our fork of mkdocs-simple-blog. Change it freely. |
| `test-docs/docs/index.md` | **Edit freely.** This is the front page and must be flashy. |
| `test-docs/docs/**` (all other `.md` files) | **Keep changes minimal.** These are real blog posts written by members. Don't rewrite, restyle or restructure them. A small fix is fine if a new theme feature needs it. |
| `test-docs/mkdocs.yml` | Only small changes, such as turning on a Markdown extension a new feature needs. |
| `test-docs/docs/assets/` | Don't rename or delete media. Posts link to these files. |
| `flake.nix`, `flake.lock`, `modules/**/*.nix` | **Don't touch.** Leave all the Nix stuff alone. |
| `Dockerfile`, `docker-compose.yml` | Only change if a theme change really needs it (for example a new pip dependency). |

### Reusable components for future posts

New building blocks that authors can use in future posts are welcome, such as
event cards, photo galleries, date badges or hero banners. Rules:

- Put the styling and any JS in the theme, not inline in a post.
- Make them usable from plain Markdown, for example with `attr_list` classes
  (`{ .card }`) or small HTML blocks. Authors write Markdown, not templates.
- Don't retrofit existing posts to use them. Showing them on `index.md` is fine.
- Explain how to use them in `theme/README.md`, in the fork section at the top.

## Theme layout (`theme/`)

- `mkdocs_simple_blog/`: the installed package. MkDocs uses this directory.
  - `base.html`, `main.html`: page skeleton. Put front-page-only markup behind
    `page.is_homepage`.
  - `modules/*.html`: partials (header, menu, sidebar, content, footer, …).
  - `assets/css/*.min.css`, `assets/js/*.min.js`: **the files that are actually served**.
  - `mkdocs_theme.yml`: default theme options.
  - `plugin/`: optional blog-posts plugin. It isn't enabled in our `mkdocs.yml`.
- `template/assets/`: unminified CSS/JS sources from upstream. There is no build
  step. If you edit a source file, update its `.min` twin in
  `mkdocs_simple_blog/assets/` too. Otherwise the change never shows up.
- `UPSTREAM`, `LICENSE`: upstream provenance (v0.6.1, MIT). Keep them.
- Keep `theme.name: simple-blog`. The Docker image installs `theme/` under that name.
- The theme loads fonts and Font Awesome from CDNs (Google Fonts, cdnjs).
  Remember that when adding more external assets.

## Content structure (`test-docs/`)

`test-docs/` is a **local test copy** of the production content. It's
**gitignored**. In production the same tree is mounted from the server's appdata
volume into the container at `/docs`.

```text
test-docs/
  mkdocs.yml
  docs/
    index.md          # front page: welcome, upcoming dates ("Ausblick"), year sections linking to posts
    2024/ 2025/ 2026/ # posts, one .md per event
    assets/           # shared images and videos
```

Posts use YAML front matter: `title`, `summary`, `authors` (list), `date`.
Enabled Markdown extensions: `markdown_captions`, `attr_list`.

**What this means for changes:** edits in `test-docs/` (including `index.md`)
are not committed and don't deploy. The theme in git is what ships. So:

- Put the look of the front page (layouts, hero, animations, card styles) in
  the **theme**. Keep the markup in `index.md` simple.
- When you change `index.md`, tell the user that they have to copy it to the
  production content themselves.

## Running locally

```sh
docker compose up --build
```

The site runs at http://localhost:8000. Markdown in `test-docs/docs` reloads
live. The theme is **copied into the image at build time**, so theme changes
only show up after you rebuild (`docker compose up --build`).

Another option without Docker is `pip install mkdocs markdown-captions click==8.2.1 ./theme`,
then `mkdocs serve` inside `test-docs/`. `click` is pinned for live-reload
compatibility.

## Design checklist

- Check both desktop and phone widths.
- Posts are photo-heavy and include `.mp4` videos, so media should look great.
- Check a normal post page as well as the front page after changing shared CSS.

