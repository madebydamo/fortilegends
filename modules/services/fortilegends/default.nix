# FortiLegends MkDocs service implementation (serves on port 8000 internally).
{...}: {
  flake.modules.nixos.fortilegends = {
    config,
    lib,
    ...
  }:
    with lib; let
      cfg = config.neo.services.fortilegends;
    in {
      config = mkIf cfg.enabled {
        systemd.services.docker-fortilegends.preStart = lib.neo.mkActivationScriptForDir config {
          dirPath = "${config.neo.core.volumes.appdata}/fortilegends";
        };

        virtualisation.oci-containers.containers.fortilegends = {
          environment = {
            WATCHDOG_FORCE_POLLING = "true";
            TZ = config.neo.core.timeZone;
          };
          image = "madebydamo/fortilegends:master";
          autoStart = true;
          volumes = ["${config.neo.core.volumes.appdata}/fortilegends:/docs"];
          networks = ["internal"];
        };
      };
    };
}
