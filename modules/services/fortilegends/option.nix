# FortiLegends MkDocs service options.
{...}: {
  flake.modules.nixos.fortilegends-option = {
    config,
    lib,
    ...
  }:
    with lib;
    with {inherit (lib.neo) mkOption mkEnableOption;}; {
      options.neo.services.fortilegends = mkOption {
        type = types.submodule {
          options =
            {
              enabled = mkEnableOption "FortiLegends Blog" {rank = 0;};
            }
            // neo.mkReverseProxyOptions {
              subdomain = "fortilegends";
              auth = {
                enabled = false;
              };
            }
            // neo.mkVpnOptions {
              containers = ["fortilegends"];
              networks = ["internal"];
              ports = [8000];
            }
            // lib.neo.mkServiceMeta {
              icon = "https://fortitudo.ch/wp-content/uploads/bb-plugin/cache/Handball_Q-circle-7f2fafa8ce8f1d478818b326ede99714-609e8d9a014ef.jpg";
              description = ''
                FortiLegends is the official blog of the legendary year 2000 team.
                Built with MkDocs and mkdocs-simple-blog, it serves as a living site for team legends, history and shared memories.
                Features live reload and is served over the internal network with optional reverse proxy.
                The content volume is mounted at /docs (containing mkdocs.yml and docs/).
              '';
              projectUrl = "https://fortilegends.ch/";
              githubUrl = "https://github.com/madebydamo/fortilegends/";
            };
        };
        default = {};
        description = "FortiLegends service configuration";
      };
    };
}
