# The plugin's NixOS modules are neoPlugin.modules.* (modules/services/);
# inputs.neo.flakeModules.plugin exports them as neoPlugin.module and
# nixosModules.default.
{...}: {
  systems = ["x86_64-linux"];
  perSystem = {pkgs, ...}: {
    formatter = pkgs.alejandra;
  };
}
