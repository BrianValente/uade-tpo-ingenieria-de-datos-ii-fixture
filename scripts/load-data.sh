#!/bin/sh
set -eu

./scripts/run-mongosh.sh data/load-data.js
./scripts/run-mongosh.sh queries/05-verify.js
