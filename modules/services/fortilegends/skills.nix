# Hermes skill for the Forti-Legends blog.
{...}: {
  neoPlugin.modules.fortilegends-skills = {
    config,
    lib,
    plugin,
    ...
  }: let
    name = plugin.name "fortilegends";
    cfg = config.neo.services.${name};
  in {
    config.neo.services.${name}.skill.conf = lib.neo.mkServiceSkill {
      service = name;
      inherit config;
      description = "Forti-Legends club blog hosting (MkDocs)";
      tags = ["neo" name "mkdocs" "blog" "docs"];
      title = "Neo · Forti-Legends${plugin.label}";
      body = ''
        ## When to Use
        Hosting and ops for the Forti-Legends club blog: container, reverse proxy,
        appdata layout, content tree, site rebuilds. Not for writing posts (that is
        content work in appdata).

        ## About the site
        Official blog of Forti-Legends: document and archive club time — friendship,
        memories, events. Index is the homepage with outlook dates and year sections
        linking into posts. Public site by default (auth off).

        ## Architecture (hosting)
        - Container: `${name}` (image built by the plugin, loaded by `${name}-image.service`),
          Docker network `app-${name}`, runs as the homeserver user
        - Inside: a small Python supervisor runs `mkdocs build` with the vendored
          `simple-blog` theme into `/tmp/site/build-<n>` and serves `/tmp/site/current`
          with nginx on **:${toString cfg.port}** (setting `services.${name}.port`)
        - Every 3 s it checks the content; a few seconds after a change it rebuilds and
          switches to the new version. A failed build keeps the previous version online
        - `GET|POST /_e/<event>[/<detail>]` answers 204: browser events (game throws,
          sponsor clicks, calendar adds, JS errors) counted from SWAG's log
        - SWAG: `https://<subdomain>.<domain>` → `http://${name}:${toString cfg.port}`
        - Optional tinyauth / VPN via Neo options; defaults are public + no VPN
        - Metrics on :9464 while monitoring collects: `fortilegends_build_ok`,
          `fortilegends_build_warnings`, `fortilegends_site_pages`, `neo_app_job_runs_total{job="build"}`;
          dashboard "Forti-Legends" in Grafana (Apps)

        ## Where content is hosted
        Image has no site content. Neo mounts appdata read-only:

        | Role | Path |
        |------|------|
        | Host appdata | `<neo.core.volumes.appdata>/${name}` |
        | Container | `/docs` |
        | Config | `/docs/mkdocs.yml` |
        | Pages | `/docs/docs/**` |

        Typical tree:

        ```text
        <appdata>/${name}/
          mkdocs.yml
          docs/
            index.md              # homepage: welcome, outlook, year → post links
            assets/               # shared media (images, video, …)
            2024/
              … .md
            2025/
              … .md
              assets/             # optional per-year assets
            2026/
              … .md
              assets/
        ```

        - **index.md** is the hub: links to posts (e.g. `2026/2_Sportleranlass.md`).
        - Posts live under year directories; media often under `docs/assets/` or
          `docs/<year>/assets/` with relative links from the post.
        - `mkdocs.yml` defines `site_name` and `nav` (at least Home → `index.md`).
          Deep year pages can be reached via index links even if not every file is
          listed in `nav` — keep `nav` and index consistent if you care about menus.

        ### Post front matter (YAML)
        Posts use a YAML front matter block, then Markdown body. Hosting does not
        validate fields; broken front matter can still render oddly depending on theme.

        ```yaml
        ---
        title: …
        summary: …
        authors:
            - Name
        date: YYYY-MM-DD
        ---
        ```

        Common extras in the wild: multi-author lists, relative image/video links,
        HTML `<figure>`/`<video>` for media. Relative links between posts (e.g. to
        another year folder) must stay valid after renames/moves.

        ### Caveats (content volume)
        - Missing `mkdocs.yml` or empty `docs/` → build fails; a fresh container then shows
          a "being rebuilt" placeholder page
        - Broken relative asset/post links → 404s in the browser only
        - Clearing appdata **wipes the blog** — confirm first
        - Public by default: no secrets in Markdown or assets
        - Edits to `mkdocs.yml` and anything under `docs/` are picked up automatically;
          to force a rebuild, `touch <appdata>/${name}/mkdocs.yml`
        - Do not invent or rewrite club history in ops tasks; only fix hosting/paths

        ## Ops
        ```bash
        systemctl status docker-${name}
        docker logs ${name} --tail 100
        ls -la <appdata>/${name}
        ls -la <appdata>/${name}/docs
        docker logs ${name} 2>&1 | grep -E '"level": "(warning|error|critical)"'   # build problems
        docker exec swag curl -sS -o /dev/null -w '%{http_code}\n' http://${name}:${toString cfg.port}/   # 200
        # The image has no shell or coreutils; inspect content on the host (appdata).
        ```

        1. Units `${name}-image` and `docker-${name}` active; log shows "site published"
        2. Appdata has `mkdocs.yml` + `docs/index.md`
        3. Public URL loads; index links open posts; assets load
        4. Neo settings for enable / subdomain / auth / VPN → activate

        ## Credentials
        - None for the app itself
        - Edge: optional tinyauth (`services.${name}.auth`; default off)

        ## Verification
        - Container up; homepage loads; a linked post and an image/video from
          `assets/` resolve; new/edited files under appdata appear a few seconds later
          (log: "content changed, rebuilding" then "site published")
      '';
    };
  };
}
