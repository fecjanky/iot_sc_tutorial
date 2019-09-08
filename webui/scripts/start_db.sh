#!/bin/sh
set -e
ROOT_DIR=$(dirname $0)
mkdir -p "$ROOT_DIR/data/db"
mongod -f "$ROOT_DIR/mongod.conf" --dbpath "$ROOT_DIR/data/db"
