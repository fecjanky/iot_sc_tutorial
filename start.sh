#/bin/sh
set -e
WORK_DIR=$(dirname "$0")

$WORK_DIR/start_geth --mine --miner.threads $MINER_THREADS &
$WORK_DIR/webui/scripts/start_db.sh &
node $WORK_DIR/webui/src/main.js
