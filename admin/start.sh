#!/bin/sh
set -e
WORK_DIR=$(dirname "$0")
ROOT_DIR=$WORK_DIR/../

if [ -z $MINER_THREADS ] ; then
MINER_THREADS=1
fi

# start sshd for accessing geth console
/usr/sbin/sshd

$WORK_DIR/start_geth --mine --miner.threads $MINER_THREADS &
$ROOT_DIR/webui/scripts/start_db.sh &
node $ROOT_DIR/webui/src/main.js --listen 80 --https 443
