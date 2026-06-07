# heph

This is the extension to support the [heph](https://github.com/hephbuild/heph) build system

## Development setup

### Devenv

    echo "trusted-users = root $(whoami)" | sudo tee -a /etc/nix/nix.custom.conf && sudo launchctl kickstart -k system/org.nixos.nix-daemon

