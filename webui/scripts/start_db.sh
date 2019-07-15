#!/bin/sh
set -e
ROOT_DIR=$(dirname $0)
mkdir -p "$ROOT_DIR/data/db"
mongod --dbpath "$ROOT_DIR/data/db"
