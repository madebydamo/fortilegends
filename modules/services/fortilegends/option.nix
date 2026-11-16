# Forti-Legends blog options.
{withSystem, ...}: {
  neoPlugin.modules.fortilegends-option = {
    config,
    lib,
    pkgs,
    plugin,
    ...
  }:
    with lib;
    with {inherit (lib.neo) mkOption mkEnableOption;}; let
      name = plugin.name "fortilegends";
      image = withSystem pkgs.stdenv.hostPlatform.system ({config, ...}: config.packages.fortilegends-image);
    in {
      options.neo.services.${name} = mkOption {
        type = types.submodule {
          options =
            {
              enabled = mkEnableOption "Your club's blog with stories, photos and upcoming dates${plugin.label}" {rank = 0;};

              # Copies behind the VPN share gluetun's network namespace, so a
              # second copy needs its own port there.
              port = mkOption {
                type = types.port;
                default = 8000;
                rank = 80;
                description = "Port the blog answers on inside its container. Change it only when two copies of the blog run behind the VPN.";
                ui = lib.neo.ui.mkUi {
                  label = "Internal web port";
                  group = lib.neo.ui.groups.advanced;
                };
              };
            }
            // neo.mkReverseProxyOptions {
              subdomain = name;
              auth.enabled = false;
            }
            // neo.mkVpnOptions {
              containers = [name];
              networks = [(lib.neo.docker.serviceNetwork name)];
              ports = [config.neo.services.${name}.port];
            }
            // lib.neo.mkContainerDefinitions {
              # Built by this flake (modules/packages/image.nix) and loaded as
              # ${name}:<hash> by ${name}-image.service.
              ${name} = "${name}:${builtins.unsafeDiscardStringContext image.imageTag}";
              extraUnits = ["${name}-image"];
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
                The site is rebuilt a few seconds after a file there changes. If a change breaks the build, readers keep seeing the previous version and the log says why.
                Theme changes (look, front-page game) come with a plugin update.
              '';
              replaces = ["WordPress" "Wix"];
              privacy = [];
              projectUrl = "https://fortilegends.ch/";
              githubUrl = "https://github.com/madebydamo/fortilegends/";
              license = {
                # The repo (theme: a fork of mkdocs-simple-blog, also MIT); MkDocs itself is BSD-2-Clause.
                spdx = "MIT";
                url = "https://github.com/madebydamo/fortilegends/blob/master/LICENSE";
              };
            }
            // lib.neo.mkSkillOptions {};
        };
        default = {};
        description = "Forti-Legends blog${plugin.label}";
      };
    };
}
