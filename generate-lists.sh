#!/bin/sh
# Regenerates media/background/background.txt and media/work/work.txt
# from whatever files are actually sitting in those folders.
# Run automatically as the Cloudflare Pages build command on every deploy.
set -e

for d in media/background media/work; do
  (cd "$d" && find . -maxdepth 1 -type f ! -name "*.txt" ! -name ".*" | sed 's|^\./||' | sort > "$(basename "$d").txt.tmp" && mv "$(basename "$d").txt.tmp" "$(basename "$d").txt")
done
