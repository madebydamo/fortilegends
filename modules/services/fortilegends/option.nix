# Forti-Legends blog options.
{...}: {
  neoPlugin.modules.fortilegends-option = {
    config,
    lib,
    plugin,
    ...
  }:
    with lib;
    with {inherit (lib.neo) mkOption mkEnableOption;}; let
      name = plugin.name "fortilegends";
    in {
      options.neo.services.${name} = mkOption {
        type = types.submodule {
          options =
            {
              enabled = mkEnableOption "Your club's blog with stories, photos and upcoming dates${plugin.label}" {rank = 0;};
            }
            // neo.mkReverseProxyOptions {
              subdomain = name;
              auth.enabled = false;
            }
            // neo.mkVpnOptions {
              containers = [name];
              networks = [(lib.neo.docker.serviceNetwork name)];
              ports = [8000];
            }
            // lib.neo.mkContainerDefinitions {
              ${name} = "madebydamo/fortilegends:master";
            }
            // lib.neo.mkAppdata "${config.neo.core.volumes.appdata}/${name}"
            // lib.neo.mkServiceMeta {
              category = "Media";
              icon = ./icon.png;
              tagline = "The Forti-Legends club blog${plugin.label}";
              description = ''
                The club's stories, photos and videos, with upcoming dates visitors can add to their calendar and a small handball game on the front page.
                Anyone can read it; posts are simple text files on the server.
              '';
              notes = ''
                Posts live in the app data folder (mkdocs.yml and the docs folder). Clearing app data deletes the blog.
                Theme changes (look, front-page game) come with a plugin update.
              '';
              replaces = ["WordPress" "Wix"];
              privacy = [];
              projectUrl = "https://fortilegends.ch/";
              githubUrl = "https://github.com/madebydamo/fortilegends/";
              license = {
                # The theme (a fork of mkdocs-simple-blog); MkDocs itself is BSD-2-Clause.
                spdx = "MIT";
                url = "https://github.com/madebydamo/fortilegends/blob/master/theme/LICENSE";
              };
            }
            // lib.neo.mkSkillOptions {};
        };
        default = {};
        description = "Forti-Legends blog${plugin.label}";
      };
    };
}
