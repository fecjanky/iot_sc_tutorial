#!/bin/sh
set -e
WORK_DIR=$(dirname "$0")

if [ -z $MINER_THREADS ] ; then
MINER_THREADS=1
fi

# start sshd for accessing geth console
/usr/sbin/sshd

$WORK_DIR/start_geth --mine --miner.threads $MINER_THREADS &
$WORK_DIR/webui/scripts/start_db.sh &
node $WORK_DIR/webui/src/main.js --listen 80 --https 443
