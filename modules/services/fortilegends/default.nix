# Forti-Legends blog: one container on the service network, content from appdata.
{...}: {
  neoPlugin.modules.fortilegends = {
    config,
    lib,
    plugin,
    ...
  }: let
    name = plugin.name "fortilegends";
    cfg = config.neo.services.${name};
    appdata = "${config.neo.core.volumes.appdata}/${name}";
  in {
    config = lib.mkIf cfg.enabled {
      systemd.services."docker-${name}".preStart = lib.neo.mkEnsureDirs config [appdata];

      virtualisation.oci-containers.containers.${name} = {
        image = cfg.containers.${name};
        environment =
          lib.neo.linuxserverEnv config
          // {
            WATCHDOG_FORCE_POLLING = "true";
          };
        volumes = ["${appdata}:/docs"];
        networks = [(lib.neo.docker.serviceNetwork name)];
      };
    };
  };
}
