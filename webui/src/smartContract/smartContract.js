fs = require("fs");
solc = require('solc');
path = require('path');
MongoClient = require('mongodb').MongoClient;
Web3 = require("web3");
BSON = require('bson');
let web3 = new Web3(new Web3.providers.WebsocketProvider('ws://localhost:8546'));


var url = "mongodb://localhost:27017/Solidity";

let readFile = function (fileName, encoding = 'utf8') {
    return new Promise((resolve, reject) => {
        fs.readFile(fileName, encoding, (err, data) => {
            if (err) reject(err);
            else resolve(data);
        });
    });
};


class PowerBid {

    constructor(filename, owner, params) {
        this.filename = path.resolve(filename);
        if (typeof params !== 'undefined' && params) {
            this.owner = owner;
            this.params = params;
            this.address = null;
        } else {
            this.owner = null;
            this.params = null;
            this.address = owner;
        }
    }


    find_file() {
        return MongoClient.connect(url).then(function (conn) {
            return conn.db("Solidity").collection("compiled").findOne({ filename: this.filename }).then(result => {
                conn.close();
                return result;
            });
        }.bind(this));
    }

    compile_and_cache(data) {
        let compiled = this.compile_string(data);
        MongoClient.connect(url).then(function (conn) {
            let compiledContract = compiled.contracts["powerbid.sol"]["PowerBid"];
            let compiledContractBSON = this.serialize_compiled(compiledContract);
            conn.db("Solidity").collection("compiled")
                .updateOne({ filename: this.filename },
                    { $set: { content: data, result: compiledContractBSON } },
                    { upsert: true })
                .then(result => conn.close());
        }.bind(this), console.log);
        return compiled.contracts["powerbid.sol"]["PowerBid"];
    }

    serialize_compiled(compiled) {
        return BSON.serialize(compiled).toString('base64');
    }
    deserialize_compiled(bsonData) {
        return BSON.deserialize(Buffer.from(bsonData, 'base64'));
    }

    getConfig(data) {
        let source_name = path.basename(this.filename);
        var obj = {
            language: 'Solidity',
            sources: {},
            settings: {
                outputSelection: {
                    '*': {
                        '*': ['*']
                    }
                }
            }
        };

        obj["sources"][source_name] = {
            content: data
        };

        return obj;
    }

    compile_string(str) {
        var input = this.getConfig(str);
        var output = JSON.parse(solc.compile(JSON.stringify(input)))
        return output;
    }

    compile() {
        return new Promise(function (resolve, reject) {
            readFile(this.filename).then(data => resolve(this.compile_string(data)), reject);
        }.bind(this));
    }

    compile_cached() {
        return Promise.all([this.find_file(), readFile(this.filename)]).then(function (values) {
            if (values[0] === null || values[0].content !== values[1]) {
                console.log("file has changed or not compiled yet, recompiling source...");
                return this.compile_and_cache(values[1]);
            } else {
                console.log("file has not changed, using compiled data from db...");
                return this.deserialize_compiled(values[0].result);
            }
        }.bind(this));
    }


    persist_contract(ethAddress) {
        console.log("persisting contract to db...");
        Promise.all([MongoClient.connect(url), this.find_file()]).then(function (args) {
            if (args[1] === null) {
                console.log("file must be compiled before persisting contract...");

            } else {
                let collection = args[0].db("Solidity").collection("contracts");
                collection.insertOne({ address: ethAddress, contract: args[1] }, (err, res) => {
                    if (err) console.log(err);
                    else console.log("succefully persisted contract with address:" + ethAddress);
                });
            }
            args[0].close();
        }.bind(this));
    }

    deploy_from_db() {
        return MongoClient.connect(url).then(function (conn) {
            return conn.db('Solidity').collection("contracts").findOne({ address: this.address }).then(function (result) {
                conn.close();
                let compiled = this.deserialize_compiled(result.contract.result);
                let contract = new web3.eth.Contract(compiled.abi, result.address);
                return { obj: this, contract: contract };
            }.bind(this));
        }.bind(this));
    }

    get_transaction(contract) {
        let bytecode = '0x' + contract.evm.bytecode.object;

        var powerbid = new web3.eth.Contract(contract.abi);

        var transaction = powerbid.deploy({
            data: bytecode,
            arguments: [this.params.auctionPeriodSeconds, this.params.consumptionPeriodSeconds, this.params.requiredEnergy]
        });
        return transaction;
    }

    deploy_new() {
        return this.compile_cached().then(
            function (contract) {
                console.log("compiled");
                var transaction = this.get_transaction(contract);
                console.log("deploying contract");
                return Promise.all([Promise.resolve(contract), Promise.resolve(transaction), transaction.estimateGas({ value: 1 })]);
            }.bind(this)).then(function (args) {
                let contract = args[0];
                let transaction = args[1];
                let gasValue = args[2];
                console.log("estimated gas value for deployment " + gasValue);

                console.log("sending transaction...");

                return transaction.send({
                    from: this.owner,
                    gas: Math.ceil(gasValue * 1.2),
                    value: this.params["value"]
                })
                    .once('receipt', function (receipt) {
                        console.log('Contract address is:' + receipt.contractAddress);
                        this.persist_contract(receipt.contractAddress);
                    }.bind(this))
                    .on('error', (err) => { throw err; });
            }.bind(this)).then(function (contract) {
                return { obj: this, contract: contract };
            }.bind(this));
    }

    deploy() {
        return this.params ? this.deploy_new() : this.deploy_from_db();
    }

}


function main(args) {

    // let powerBid = new PowerBid(
    //     args[0],
    //     "0x0bbcab1846baf036cf75b1250c7563ee9e8dce77", { auctionPeriodSeconds: 600, consumptionPeriodSeconds: 600, requiredEnergy: 100, value: 20 },
    // );

    let powerBid = new PowerBid(args[0], "0x5e3006f0Ce6751C54eFBf68a843dBB23465f10E8");

    powerBid.deploy()
        .then((result) => {
            console.log("Contract at:" + result.contract.options.address);
            return result.contract.methods.auction_time_left().call({ from: result.obj.owner }).then((result) => console.log("Auction time_left:" + result));
        }, console.log);
}

main(process.argv.slice(2));




/// TODO: add unit tests code
/// research: mongo mocking, web3 mocking, etc