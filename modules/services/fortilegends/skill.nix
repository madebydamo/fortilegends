# Hermes skill for fortilegends.
{...}: {
  flake.modules.nixos.fortilegends-skill = {
    config,
    lib,
    ...
  }: let
    cfg = config.neo.services.fortilegends;
    domain = config.neo.services.swag.domain or null;
  in {
    config.neo.services.fortilegends.skill.conf = lib.neo.mkServiceSkill {
      service = "fortilegends";
      inherit cfg domain;
      description = "FortiLegends MkDocs team blog hosting";
      tags = ["neo" "fortilegends" "mkdocs" "blog" "docs"];
      title = "Neo · FortiLegends";
      body = ''
        ## When to Use
        Hosting and ops for the Forti-Legends club blog: containers, reverse proxy,
        appdata layout, content tree, live reload. Not for writing posts (that is
        content work on the mounted volume).

        ## About the site
        Official blog of Forti-Legends: document and archive club time — friendship,
        memories, events. Index is the homepage with outlook dates and year sections
        linking into posts. Public site by default (auth off).

        ## Architecture (hosting)
        - Container: `fortilegends` (`madebydamo/fortilegends:master`)
        - Serves MkDocs (`mkdocs-simple-blog`) on **:8000**, Docker network `internal`
        - SWAG: `https://<subdomain>.<domain>` → `http://fortilegends:8000`
        - `WATCHDOG_FORCE_POLLING=true` so bind-mounted Markdown reloads reliably
        - Optional tinyauth / VPN via Neo options; defaults are public + no VPN

        ## Where content is hosted
        Image has no site content. Neo mounts appdata:

        | Role | Path |
        |------|------|
        | Host appdata | `<neo.core.volumes.appdata>/fortilegends` |
        | Container | `/docs` |
        | Config | `/docs/mkdocs.yml` |
        | Pages | `/docs/docs/**` |

        Typical tree:

        ```text
        <appdata>/fortilegends/
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
        - Missing `mkdocs.yml` or empty `docs/` → serve fails or empty site
        - Broken relative asset/post links → 404s in the browser only
        - Clearing appdata **wipes the blog** — confirm first
        - Public by default: no secrets in Markdown or assets
        - Live reload watches the docs tree; pure `mkdocs.yml` edits may need a
          container restart if the site does not pick them up
        - Do not invent or rewrite club history in ops tasks; only fix hosting/paths

        ## Ops
        ```bash
        systemctl status docker-fortilegends
        docker logs fortilegends --tail 100
        ls -la <appdata>/fortilegends
        ls -la <appdata>/fortilegends/docs
        docker exec -it fortilegends sh   # /docs is the mount
        ```

        1. Unit healthy; logs show MkDocs on `0.0.0.0:8000`
        2. Appdata has `mkdocs.yml` + `docs/index.md`
        3. Public URL loads; index links open posts; assets load
        4. Neo settings for enable / subdomain / auth / VPN → activate

        ## Credentials
        - None for the app itself
        - Edge: optional tinyauth (`services.fortilegends.auth`; default off)

        ## Verification
        - Container up; homepage loads; a linked post and an image/video from
          `assets/` resolve; new/edited files under appdata appear after reload
      '';
    };
  };
}
