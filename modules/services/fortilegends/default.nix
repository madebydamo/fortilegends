# Forti-Legends blog: one container on the service network. It builds the
# content from appdata (mounted read-only) with MkDocs and serves the static
# site with nginx (server/fortilegends_site.py); the image is built by this
# flake and loaded by ${name}-image.service.
{withSystem, ...}: {
  neoPlugin.modules.fortilegends = {
    config,
    lib,
    pkgs,
    plugin,
    ...
  }: let
    name = plugin.name "fortilegends";
    cfg = config.neo.services.${name};
    appdata = "${config.neo.core.volumes.appdata}/${name}";
    image = withSystem pkgs.stdenv.hostPlatform.system ({config, ...}: config.packages.fortilegends-image);
    docker = "${config.virtualisation.docker.package}/bin/docker";
    # Every copy loads the image under its own name, so one copy's cleanup
    # never removes the image of another.
    localRef = "${name}:${image.imageTag}";
  in {
    config = lib.mkIf cfg.enabled {
      # Loads the Nix-built image into Docker ahead of the container. The tag
      # is the image hash: an unchanged image is skipped, a changed one
      # changes this unit, so a switch reruns it before restarting the blog.
      systemd.services."${name}-image" = {
        description = "Load the Forti-Legends${plugin.label} image into Docker";
        after = ["docker.service" "docker.socket"];
        requires = ["docker.service"];
        serviceConfig = {
          Type = "oneshot";
          RemainAfterExit = true;
        };
        script = ''
          if ! ${docker} image inspect ${localRef} >/dev/null 2>&1; then
            ${image.copyTo}/bin/copy-to docker-daemon:${localRef}
          fi
          # Drop this copy's superseded builds. One still used by the running
          # container is refused here and removed on the next run.
          ${docker} image ls ${name} --format '{{.Repository}}:{{.Tag}}' \
            | grep -vxF ${localRef} \
            | xargs -r ${docker} rmi 2>/dev/null || true
        '';
      };

      systemd.services."docker-${name}" = {
        requires = ["${name}-image.service"];
        after = ["${name}-image.service"];
        preStart = lib.neo.mkEnsureDirs config [appdata];
      };

      virtualisation.oci-containers.containers.${name} = {
        image = cfg.containers.${name};
        # Reads appdata as its owner; nginx and MkDocs need no privileges.
        user = "${toString config.neo.core.uid}:${toString config.neo.core.gid}";
        environment =
          lib.neo.linuxserverEnv config
          // {
            PORT = toString cfg.port;
          };
        volumes = ["${appdata}:/docs:ro"];
        networks = [(lib.neo.docker.serviceNetwork name)];
        extraOptions = [
          "--cap-drop=ALL"
          "--security-opt=no-new-privileges"
        ];
      };
    };
  };
}
