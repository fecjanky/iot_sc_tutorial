#!/bin/sh
set -e
WORK_DIR=$(dirname "$0")
ROOT_DIR=$WORK_DIR/../

if [ -z $MINER_THREADS ] ; then
MINER_THREADS=1
fi

# start sshd for accessing geth console
/usr/sbin/sshd

mkdir -p "$ROOT_DIR/log"

GETH_LOG_FILE="$ROOT_DIR/log/geth.log"
DB_LOG_FILE="$ROOT_DIR/log/db.log"
WWW_LOG_FILE="$ROOT_DIR/log/www.log"

savelog -n -c 7 "$GETH_LOG_FILE"
savelog -n -c 7 "$DB_LOG_FILE"
savelog -n -c 7 "$WWW_LOG_FILE"

$WORK_DIR/start_geth --mine --miner.threads $MINER_THREADS 2>&1 | tee "$GETH_LOG_FILE" &
$ROOT_DIR/webui/scripts/start_db.sh 2>&1 | tee "$DB_LOG_FILE" &
node $ROOT_DIR/webui/src/main.js --listen 80 --https 443 2>&1 | tee "$WWW_LOG_FILE" &

wait
