# Forti-Legends reverse proxy (SWAG). Public by default (auth off).
{...}: {
  neoPlugin.modules.fortilegends-swag = {
    config,
    lib,
    plugin,
    ...
  }: let
    name = plugin.name "fortilegends";
    cfg = config.neo.services.${name};
  in {
    config.neo.services.${name}.proxyConf = lib.mkDefault (lib.neo.mkSubdomainProxyConf {
      inherit config cfg;
      upstream = name;
      port = cfg.port;
    });
  };
}
