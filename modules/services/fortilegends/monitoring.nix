# Forti-Legends dashboard and alerts (Grafana, Apps folder).
#
# Sources (docs/APP-TELEMETRY.md in Neo):
# - SWAG's access log in Loki, {job="swag", service=<name>}: one JSON line per
#   request (uri, status, bytes, user_agent, …); path/status/ip are structured
#   metadata. Readers, link previews, crawlers, video traffic, 404s.
# - Browser events (theme main.js / intro.js → /_e/<event>[/<detail>], 204 from
#   the blog's own nginx): throw/goal|board, skip, replay, sponsor_prompt|
#   sponsor_open|sponsor_decline/<host>, calendar/<yyyymmdd>, lightbox,
#   intro_static, model_fallback/ball|goal, js_error/script|load|promise.
# - The builder's metrics on :9464 (server/fortilegends_site.py): job "build",
#   fortilegends_build_ok|build_warnings|site_pages|site_bytes.
{...}: {
  neoPlugin.modules.fortilegends-monitoring = {
    config,
    lib,
    plugin,
    ...
  }: let
    name = plugin.name "fortilegends";
    cfg = config.neo.services.${name};
    label = "Forti-Legends${plugin.label}";
    sel = lib.neo.grafana.appSelector name;
    asel = lib.neo.grafana.alertSelector name;

    swag = ''{job="swag", service="${name}", host=~"$host"}'';
    # The access log line is JSON; match the user agent inside it.
    ua = re: ''`(?i)"user_agent":"[^"]*(${re})`'';
    previewRe = "whatsapp|facebookexternalhit|facebookcatalog|telegrambot|discordbot|twitterbot|slackbot|linkedinbot|skypeuripreview|signal|iframely|embedly|mastodon";
    crawlerRe = "googlebot|google-inspectiontool|bingbot|duckduckbot|yandexbot|baiduspider|applebot|gptbot|oai-searchbot|chatgpt-user|claudebot|claude-user|claude-searchbot|perplexitybot|ccbot|bytespider|amazonbot|meta-externalagent|petalbot|semrushbot|ahrefsbot";
    robotRe = "bot|crawl|spider|slurp|preview|${previewRe}|curl|wget|python|go-http|java/|headless|lighthouse|uptime|monitor";
    # HTML pages that answered (not assets, not events).
    pages = ''${swag} | status=~"200|304" | path=~`/|/.+/|/.+\.html` | path!~`/_e/.*|/assets/.*`'';
    people = "${pages} !~ ${ua robotRe}";
    # Event name and detail out of the JSON line ("uri":"/_e/<event>/<detail>").
    events = ''${swag} | path=~`/_e/.+` | regexp `"uri":"/_e/(?P<event>[a-z_]+)(?:/(?P<detail>[^"/]+))?`'';
    ev = e: ''${events} | event="${e}"'';
    total = q: "sum(count_over_time(${q} [$__range])) or vector(0)";
    # A share: no value (not an error) while the denominator is empty.
    share = a: b: "sum(count_over_time(${a} [$__range])) / sum(count_over_time(${b} [$__range]))";
    lokiStat = args:
      lib.neo.grafana.stat ({
          w = 4;
          h = 4;
          datasource = lib.neo.grafana.loki;
          decimals = 0;
          options.colorMode = "none";
        }
        // args
        // {targets = map (t: t // {queryType = "instant";}) args.targets;});
  in {
    config = lib.mkIf cfg.enabled {
      virtualisation.oci-containers.containers.${name}.environment =
        lib.mkIf config.neo.monitoring.collecting {NEO_METRICS_PORT = "9464";};

      neo.monitoring.apps.${name} = {
        metrics.main = {
          container = name;
          port = 9464;
        };

        dashboards.overview = {
          title = label;
          description = "Readers, shared links, crawlers, the front-page game, sponsor clicks and calendar adds of the club blog.";
          time = "now-7d";
          panels = with lib.neo.grafana;
            [
              (row "At a glance" null)
              (lokiStat {
                title = "Readers";
                description = "Different addresses that opened a page, without bots and link previews.";
                targets = [(lq "count(sum by (ip) (count_over_time(${people} [$__range])))")];
              })
              (lokiStat {
                title = "Page views";
                description = "Pages opened by people (bots and link previews left out).";
                targets = [(lq (total people))];
              })
              (lokiStat {
                title = "Shared in chats";
                description = "Link previews fetched by WhatsApp, Telegram, Signal, Discord and similar apps: roughly how often a link to the blog was shared.";
                targets = [(lq (total "${swag} |~ ${ua previewRe}"))];
              })
              (lokiStat {
                title = "Goals scored";
                description = "Throws in the front-page game that went into the goal.";
                targets = [(lq (total ''${ev "throw"} | detail="goal"''))];
              })
              (lokiStat {
                title = "Sponsor clicks";
                description = "Visitors who hit a sponsor board in the game and then opened the sponsor's site.";
                targets = [(lq (total (ev "sponsor_open")))];
              })
              (lokiStat {
                title = "Calendar adds";
                description = "Upcoming dates added to a calendar from the front page.";
                targets = [(lq (total (ev "calendar")))];
              })

              (row "Readers" null)
              (bars {
                title = "Page views";
                w = 12;
                datasource = loki;
                targets = [
                  (lqLegend "sum(count_over_time(${people} [$__interval]))" "people")
                  (lqLegend "sum(count_over_time(${pages} |~ ${ua robotRe} [$__interval]))" "bots and previews")
                ];
              })
              (bargauge {
                title = "Most read posts";
                w = 12;
                datasource = loki;
                targets = [(lqLegend ''topk(15, sum by (path) (count_over_time(${people} | path=~`/20[0-9]{2}/.+` [$__range])))'' "{{path}}")];
              })
              (bargauge {
                title = "Link previews by app";
                w = 12;
                description = "Chat and social apps that fetched a preview card (each one is a shared link being shown).";
                datasource = loki;
                targets = [(lqLegend ''sum by (app) (count_over_time(${swag} | regexp `(?i)"user_agent":"[^"]*?(?P<app>${previewRe})` [$__range]))'' "{{app}}")];
              })
              (bargauge {
                title = "Search engines and AI crawlers";
                w = 12;
                datasource = loki;
                targets = [(lqLegend ''sum by (bot) (count_over_time(${swag} | regexp `(?i)"user_agent":"[^"]*?(?P<bot>${crawlerRe})` [$__range]))'' "{{bot}}")];
              })
              (bars {
                title = "llms.txt, sitemap and robots.txt fetches";
                w = 12;
                description = "Files made for search engines and AI assistants (the SEO part of the theme).";
                datasource = loki;
                targets = [(lqLegend ''sum by (path) (count_over_time(${swag} | path=~`/(llms(-full)?\.txt|sitemap\.xml|robots\.txt)` [$__interval]))'' "{{path}}")];
              })
              (bargauge {
                title = "Video traffic";
                w = 12;
                unit = "bytes";
                datasource = loki;
                targets = [(lqLegend ''topk(10, sum by (path) (sum_over_time(${swag} | path=~`(?i).+\.(mp4|m4v|mov|webm)` | json bytes="bytes" | unwrap bytes [$__range])))'' "{{path}}")];
              })
              (timeseries {
                title = "Bandwidth";
                w = 12;
                unit = "bytes";
                datasource = loki;
                targets = [(lqLegend ''sum(sum_over_time(${swag} | json bytes="bytes" | unwrap bytes [$__interval]))'' "sent")];
              })
              (bargauge {
                title = "Broken links and images (404)";
                w = 12;
                description = "Missing files people's browsers asked for; bots probing random paths left out.";
                datasource = loki;
                targets = [(lqLegend ''topk(15, sum by (path) (count_over_time(${swag} | status="404" !~ ${ua robotRe} [$__range])))'' "{{path}}")];
              })

              (row "Front-page game and sponsors" null)
              (bars {
                title = "Throws, skips and replays";
                w = 12;
                datasource = loki;
                targets = [(lqLegend ''sum by (what) (count_over_time(${events} | event=~"throw|skip|replay" | label_format what="{{.event}} {{.detail}}" [$__interval]))'' "{{what}}")];
              })
              (lokiStat {
                title = "Goal share";
                w = 6;
                description = "Throws that went into the goal rather than onto a sponsor board.";
                unit = "percentunit";
                decimals = null;
                noValue = "–";
                targets = [(lq (share ''${ev "throw"} | detail="goal"'' (ev "throw")))];
              })
              (lokiStat {
                title = "Intro skipped";
                w = 6;
                description = "Visitors who scrolled past the game before throwing, out of all who skipped or threw.";
                unit = "percentunit";
                decimals = null;
                noValue = "–";
                targets = [(lq (share (ev "skip") ''${events} | event=~"skip|throw"''))];
              })
              (bargauge {
                title = "Sponsor boards";
                w = 12;
                description = "Per sponsor: board hit (prompt), site opened, or declined.";
                datasource = loki;
                targets = [(lqLegend ''sum by (what) (count_over_time(${events} | event=~"sponsor_.+" | label_format what=`{{.detail}} {{trimPrefix "sponsor_" .event}}` [$__range]))'' "{{what}}")];
              })
              (bargauge {
                title = "Calendar adds per date";
                w = 12;
                datasource = loki;
                targets = [(lqLegend ''sum by (detail) (count_over_time(${ev "calendar"} [$__range]))'' "{{detail}}")];
              })
              (bars {
                title = "Game problems";
                w = 12;
                description = "Static front page instead of the game (old browser, no WebGL, CDN blocked), built-in look-alike models, and script errors in browsers.";
                datasource = loki;
                targets = [(lqLegend ''sum by (what) (count_over_time(${events} | event=~"intro_static|model_fallback|js_error" | label_format what="{{.event}} {{.detail}}" [$__interval]))'' "{{what}}")];
              })

              (row "Site builds" null)
              (stat {
                title = "Last build";
                w = 4;
                h = 4;
                targets = [(pq "min(fortilegends_build_ok{${sel}})" "")];
                mappings = [
                  {
                    type = "value";
                    options = {
                      "0" = {
                        text = "Failed";
                        color = "red";
                        index = 0;
                      };
                      "1" = {
                        text = "OK";
                        color = "green";
                        index = 1;
                      };
                    };
                  }
                ];
              })
              (stat {
                title = "Build warnings";
                w = 4;
                h = 4;
                description = "Warnings MkDocs reported in the last build (for example a missing file).";
                targets = [(pq "max(fortilegends_build_warnings{${sel}})" "")];
                decimals = 0;
                thresholds = thresholdsGreenRed [
                  {
                    color = "orange";
                    value = 1;
                  }
                ];
              })
              (stat {
                title = "Pages";
                w = 4;
                h = 4;
                targets = [(pq "max(fortilegends_site_pages{${sel}})" "")];
                decimals = 0;
                options.colorMode = "none";
              })
              (stat {
                title = "Site size";
                w = 4;
                h = 4;
                unit = "bytes";
                targets = [(pq "max(fortilegends_site_bytes{${sel}})" "")];
                options.colorMode = "none";
              })
              (stat {
                title = "Last published";
                w = 8;
                h = 4;
                unit = "dateTimeFromNow";
                targets = [(pq "max(fortilegends_site_published_timestamp_seconds{${sel}}) * 1000" "")];
                options.colorMode = "none";
              })
              (logs {
                title = "Build problems";
                w = 24;
                h = 8;
                description = "Warnings and errors from MkDocs: broken links, missing files, a broken mkdocs.yml.";
                targets = [(lq ''{job="journal", host=~"$host", unit="docker-${name}.service"} | json lvl="level", logger="logger" | logger=~"mkdocs|site|neo_telemetry" | lvl=~"warning|error|critical"'')];
              })
            ]
            ++ lib.neo.grafana.app.jobs {service = name;}
            ++ lib.neo.grafana.app.beacon {service = name;}
            ++ lib.neo.grafana.app.web {service = name;}
            ++ lib.neo.grafana.app.errors {
              service = name;
              containers = [name];
            };
        };

        alerts =
          lib.neo.monitoring.appAlerts {
            service = name;
            inherit label;
            containers = [name];
          }
          // {
            build-failed = {
              title = "${label}: site could not be rebuilt";
              expr = "max by (host) (1 - fortilegends_build_ok{${asel}})";
              above = 0;
              for = "5m";
              summary = "The ${label} blog on {{ $labels.host }} could not be rebuilt after the last change, so readers still see the previous version. The log says what is wrong (often mkdocs.yml or a post's front matter).";
            };
            js-errors = {
              title = "${label}: front page broken in browsers";
              datasource = "loki";
              expr = ''sum by (host) (count_over_time({job="swag", service="${name}"} | path=~`/_e/js_error(/.*)?` [1h]))'';
              above = 10;
              for = "0s";
              summary = "Visitors' browsers reported {{ printf \"%.0f\" $values.B.Value }} script errors on ${label} in the last hour (for example the 3D library could not be loaded), so the front-page game may not work.";
            };
            missing-media = {
              title = "${label}: photos or videos missing";
              datasource = "loki";
              expr = ''sum by (host) (count_over_time({job="swag", service="${name}", status_class="4xx"} | status="404" | path=~`(?i).+\.(jpe?g|png|gif|webp|avif|mp4|m4v|mov|webm)` [1h]))'';
              above = 20;
              for = "0s";
              summary = "{{ printf \"%.0f\" $values.B.Value }} requests for photos or videos on ${label} found nothing in the last hour: a post probably links to a file that was renamed or removed.";
            };
          };
      };
    };
  };
}
