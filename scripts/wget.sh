#!/bin/sh
# Simple wget wrapper using curl

QUIET=""
OUTPUT=""
URL=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    -q) QUIET="-s" ;;
    --show-progress) ;; # curl shows by default
    -N) ;;              # ignore timestamping
    -O) shift; OUTPUT="-o $1" ;;
    *) URL="$1" ;;
  esac
  shift
done

if [ -z "$URL" ]; then
  echo "ERROR: No URL provided" >&2
  exit 1
fi

exec curl --retry 5 --retry-delay 5 --retry-connrefused $QUIET -L $OUTPUT "$URL"
