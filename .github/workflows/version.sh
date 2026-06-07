#!/usr/bin/env bash
set -euo pipefail

# Prints a VS Code Marketplace-valid version: MAJOR.MINOR.PATCH, each part an
# int32 (<= 2147483647). The richer descriptive string the rust repo uses
# (vX.Y.Z-build.<commits>.<build>+g<sha>) is NOT publishable here, so it is only
# emitted to stderr for logs/filenames.
#
#   version.sh nightly <build_number>   -> MAJOR.MINOR.<unix_seconds>   (preview)
#   version.sh release <tag>            -> <tag with leading v stripped>
#
# nightly: patch = unix seconds keeps every push strictly increasing and stays
# under int32 until 2038. major.minor come from package.json (bump it for v1.x).

mode="${1:?usage: version.sh <nightly <build>|release <tag>>}"

base=$(node -p "require('./package.json').version")
major=${base%%.*}
rest=${base#*.}
minor=${rest%%.*}
patch=${rest#*.}
commits=$(git rev-list --count HEAD)
sha=$(git rev-parse --short HEAD)

case "$mode" in
  nightly)
    build="${2:-0}"
    echo "descriptive: v$major.$minor.$patch-build.$commits.$build+g$sha" >&2
    echo "$major.$minor.$(date +%s)"
    ;;
  release)
    tag="${2:?release mode needs a tag}"
    echo "${tag#v}"
    ;;
  *)
    echo "unknown mode: $mode" >&2
    exit 1
    ;;
esac
