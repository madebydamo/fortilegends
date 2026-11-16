# The blog's OCI image, built here so a theme commit reaches the server with a
# plugin update (no hand-pushed image). It holds MkDocs with the theme from
# ./theme, nginx and the entrypoint server/fortilegends_site.py, which builds
# the content from appdata and serves the static files. The tag is the image's
# Nix hash, so a changed image gets a new tag.
{inputs, ...}: {
  perSystem = {
    pkgs,
    system,
    ...
  }: let
    n2c = inputs.nix2container.packages.${system}.nix2container;
    python = pkgs.python3;
    ps = python.pkgs;

    markdown-captions = ps.buildPythonPackage rec {
      pname = "markdown-captions";
      version = "2.1.2";
      pyproject = true;
      src = pkgs.fetchPypi {
        inherit pname version;
        hash = "sha256-HD7AtnTdQaTF8SVyQYjDKhe9Rv1SfbKfDFWgAeLXq68=";
      };
      build-system = [ps.setuptools];
      dependencies = [ps.markdown];
      pythonImportsCheck = ["markdown_captions"];
    };

    theme = ps.buildPythonPackage {
      pname = "mkdocs-simple-blog";
      version = "0.6.1";
      pyproject = true;
      src = ../../theme;
      build-system = [ps.poetry-core];
      dependencies = [ps.mkdocs ps.babel];
      pythonImportsCheck = ["mkdocs_simple_blog"];
    };

    env = python.withPackages (_: [ps.mkdocs ps.prometheus-client markdown-captions theme]);

    app = pkgs.runCommand "fortilegends-site" {} ''
      install -Dm644 ${../../server/fortilegends_site.py} $out/lib/fortilegends_site.py
      install -Dm644 ${../../server/neo_telemetry.py} $out/lib/neo_telemetry.py
    '';

    root = pkgs.runCommand "fortilegends-root" {} ''
      mkdir -p $out/tmp $out/docs
    '';

    image = n2c.buildImage {
      name = "fortilegends";
      copyToRoot = [root];
      # MkDocs, Python and nginx rarely change; keep them apart from the theme.
      layers = [(n2c.buildLayer {deps = [python pkgs.nginx pkgs.tzdata];})];
      perms = [
        {
          path = root;
          regex = "/tmp";
          mode = "1777";
        }
      ];
      config = {
        Entrypoint = ["${env}/bin/python" "-u" "${app}/lib/fortilegends_site.py"];
        WorkingDir = "/docs";
        Env = [
          "NGINX_BIN=${pkgs.nginx}/bin/nginx"
          "NGINX_MIME_TYPES=${pkgs.nginx}/conf/mime.types"
          "TZDIR=${pkgs.tzdata}/share/zoneinfo"
          "PYTHONTZPATH=${pkgs.tzdata}/share/zoneinfo"
          "PYTHONDONTWRITEBYTECODE=1"
          "HOME=/tmp"
          "SITE_VERSION=${theme.version}"
        ];
        ExposedPorts."8000/tcp" = {};
      };
    };
  in {
    packages = {
      fortilegends-env = env;
      fortilegends-image = image;
    };
  };
}
