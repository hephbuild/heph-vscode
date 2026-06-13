{ pkgs, ... }:

{
  # https://devenv.sh/basics/
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_24;
    npm.enable = true;
  };

  # typescript / tsc come from package.json devDependencies via `npm install`.

  # Azure CLI (`az`).
  packages = [ pkgs.azure-cli ];

  # https://devenv.sh/scripts/
  scripts.build.exec = "npm run compile";
  scripts.watch.exec = "npm run watch";
  scripts.lint.exec = "npm run lint";
  scripts.package.exec = "npx --yes @vscode/vsce package";
  scripts.launch.exec = ''code --new-window --user-data-dir=.vscode-devenv . "$@"'';

  enterShell = ''
    echo "heph-vscode dev env"
    node --version
    npm --version
  '';
}
