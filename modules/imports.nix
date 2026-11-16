{inputs, ...}: {
  imports = [
    inputs.flake-file.flakeModules.dendritic
    inputs.neo.flakeModules.plugin
  ];
}
