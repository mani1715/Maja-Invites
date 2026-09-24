#!/bin/sh
# atomic-build.sh — zero-downtime SPA build for the production deploy.
# ------------------------------------------------------------------------------
# The problem this solves: `yarn build` (CRA/CRACO) EMPTIES its output directory
# at the start and refills it over ~3-4 minutes. When that output directory is the
# same `build/` folder Caddy serves live, the whole site 404s for the duration of
# every deploy — and if the build fails, the site stays down.
#
# This script builds into a scratch dir (build_new) so the LIVE build/ keeps being
# served the entire time, then swaps the new files in with index.html LAST — so
# there is never a moment where index.html points at chunks that aren't present.
# A FAILED build never touches build/, so the live site stays up on the old version.
#
# Old hashed chunks are left in place (harmless; index.html only references the new
# ones). Run a clean rebuild occasionally if you want to prune them.
set -e

rm -rf node_modules build_new
# --frozen-lockfile for TWO reasons, both load-bearing:
#
# 1) A plain `yarn install` REWRITES yarn.lock, which is a tracked file. On the
#    VM that left the working tree dirty, so the NEXT deploy's `git pull` aborted
#    with "Your local changes to the following files would be overwritten by
#    merge: frontend/yarn.lock" — and because redeploy.sh runs under `set -e`,
#    the whole deploy stopped at step 1 having changed nothing. The site stayed
#    up on the old build, so it looked like a successful no-op deploy. Every
#    deploy poisoned the next one.
#
# 2) Production must build the exact dependency tree that was tested, not
#    whatever resolves fresh on the day. If package.json and yarn.lock ever
#    disagree, this fails loudly here instead of silently shipping different
#    versions than were verified.
yarn install --frozen-lockfile --network-timeout 600000
BUILD_PATH=build_new yarn build

# First deploy (no live dir yet): just move it into place.
if [ ! -d build ]; then
  mv build_new build
  exit 0
fi

# 1) Merge every entry EXCEPT index.html into the live dir. Directories are merged
#    (new files added, same-named overwritten) so old hashed chunks survive and the
#    currently-served index.html keeps working throughout the copy.
for item in $(ls -A build_new | grep -v '^index.html$'); do
  if [ -d "build_new/$item" ]; then
    mkdir -p "build/$item"
    cp -a "build_new/$item/." "build/$item/"
  else
    cp -a "build_new/$item" "build/$item"
  fi
done

# 2) Flip index.html LAST — every chunk it references is already present.
cp -a build_new/index.html build/index.html

rm -rf build_new
