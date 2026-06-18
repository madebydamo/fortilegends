# FortiLegends reverse proxy configuration for SWAG (public, on internal network).
{...}: {
  flake.modules.nixos.fortilegends-swag = {
    config,
    lib,
    ...
  }: let
    cfg = config.neo.services.fortilegends;
  in {
    config.neo.services.fortilegends.proxyConf = lib.mkDefault ''
      server {
        listen 443 ssl;
        http2 on;
        server_name ${cfg.subdomain}.*;
        include /config/nginx/ssl.conf;

        client_max_body_size 0;

        location / {
          include /config/nginx/proxy.conf;
          include /config/nginx/resolver.conf;
          set $upstream_app fortilegends;
          set $upstream_port 8000;
          set $upstream_proto http;
          proxy_pass $upstream_proto://$upstream_app:$upstream_port;
          ${lib.neo.authBlock config cfg}
        }
        ${lib.neo.authLocations config cfg}
      }
    '';
  };
}
