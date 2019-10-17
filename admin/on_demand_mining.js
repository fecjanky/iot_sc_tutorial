var mining_threads = 3
var confirmations = 7
var txBlock = 0

// https://ethereum.stackexchange.com/questions/3151/how-to-make-miner-to-mine-only-when-there-are-pending-transactions
function onDemandMining() {
    if (eth.getBlock("pending").transactions.length > 0) {
        txBlock = eth.getBlock("pending").number
        if (eth.mining) return;
        console.log("  Transactions pending. Start mining...");
        miner.start(mining_threads);
        while (eth.getBlock("latest").number < txBlock + confirmations) {
            if (eth.getBlock("pending").transactions.length > 0) txBlock = eth.getBlock("pending").number;
            admin.sleep(1);
        }
        console.log(confirmations.toString() + " confirmations achieved; mining stopped.");
        miner.stop()
    }
    else {
        miner.stop()
    }
}

eth.filter("latest", function (err, block) { onDemandMining(); });
eth.filter("pending", function (err, block) { onDemandMining(); });

onDemandMining();
