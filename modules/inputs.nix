{lib, ...}: let
in {
  flake-file.inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
    flake-file.url = lib.mkDefault "github:vic/flake-file";
    neo.url = "github:madebydamo/neo";
    neo.inputs.nixpkgs.follows = "nixpkgs";
    # Builds the blog's OCI image (modules/packages/image.nix).
    nix2container.url = "github:nlewo/nix2container";
    nix2container.inputs.nixpkgs.follows = "nixpkgs";
  };
}
