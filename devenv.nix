{ pkgs, ... }:

{
  # https://devenv.sh/basics/
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_20;
    npm.enable = true;
  };

  # typescript / tsc come from package.json devDependencies via `npm install`.

  # https://devenv.sh/scripts/
  scripts.build.exec = "npm run compile";
  scripts.watch.exec = "npm run watch";
  scripts.lint.exec = "npm run lint";
  scripts.package.exec = "npx --yes @vscode/vsce package";

  enterShell = ''
    echo "heph-vscode dev env"
    node --version
    npm --version
  '';

  # Install node deps when not present.
  tasks."npm:install" = {
    exec = "npm install";
    before = [ "devenv:enterShell" ];
    status = "test -d node_modules";
  };
}
