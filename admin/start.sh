#!/bin/sh
set -e
WORK_DIR=$(dirname "$0")
ROOT_DIR=$WORK_DIR/../

if [ -z "$MINER_THREADS" ] ; then
MINER_THREADS=1
fi

if [ -z "$NODEJS" ] ; then
NODEJS=node
fi

if [ -z "$HTTP_PORT" ] ; then
HTTP_PORT=80
fi

if [ -z "$HTTPS_PORT" ] ; then
HTTPS_PORT=443
fi

if [ -z "$NO_SSHD" ] ; then
# start sshd for accessing geth console
/usr/sbin/sshd
fi

mkdir -p "$ROOT_DIR/log"

GETH_LOG_FILE="$ROOT_DIR/log/geth.log"
DB_LOG_FILE="$ROOT_DIR/log/db.log"
WWW_LOG_FILE="$ROOT_DIR/log/www.log"
STARTUP_LOG_FILE="$ROOT_DIR/log/start.log"

savelog -n -c 7 "$GETH_LOG_FILE"
savelog -n -c 7 "$DB_LOG_FILE"
savelog -n -c 7 "$WWW_LOG_FILE"
savelog -n -c 7 "$STARTUP_LOG_FILE"

echo "starting...."  >> "$STARTUP_LOG_FILE"
echo "MINER_THREADS=$MINER_THREADS" >> "$STARTUP_LOG_FILE"
echo "NODEJS=$NODEJS" >> "$STARTUP_LOG_FILE"
echo "HTTP_PORT=$HTTP_PORT" >> "$STARTUP_LOG_FILE"
echo "HTTPS_PORT=$HTTPS_PORT" >> "$STARTUP_LOG_FILE"
echo "NO_SSHD=$NO_SSHD" >> "$STARTUP_LOG_FILE"

$WORK_DIR/start_geth --mine --miner.threads $MINER_THREADS  2>&1 | tee "$GETH_LOG_FILE" &
$ROOT_DIR/webui/scripts/start_db.sh 2>&1 | tee "$DB_LOG_FILE" &
$NODEJS $ROOT_DIR/webui/src/main.js --listen $HTTP_PORT --https $HTTPS_PORT 2>&1 | tee "$WWW_LOG_FILE" &

wait
