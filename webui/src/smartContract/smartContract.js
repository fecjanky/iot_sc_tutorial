fs = require("fs");
solc = require('solc');
path = require('path');
mongodb = require('mongodb');
Web3 = require("web3");
BSON = require('bson');
let web3 = new Web3(new Web3.providers.WebsocketProvider('ws://localhost:8546'));


var MongoClient = mongodb.MongoClient;
var url = "mongodb://localhost:27017/";

let readFile = function(fileName, encoding = 'utf8') {
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
        return new Promise(function(resolve, reject) {
            this.db_operation().then(function(collection) {
                collection.findOne({ filename: this.filename }, function(err, result) {
                    if (err) reject(err);
                    else resolve(result);
                });
            }.bind(this), reject);
        }.bind(this));
    }

    compile_and_cache(data) {
        let compiled = this.compile_string(data);
        this.db_operation().then((collection) => {
            let compiledContract = compiled.contracts["powerbid.sol"]["PowerBid"];
            let compiledContractBSON = this.serialize_compiled(compiledContract);

            collection.updateOne({ filename: this.filename }, { $set: { content: data, result: compiledContractBSON } }, (err, res) => {
                if (err) console.log(err);
                else {
                    console.log("succefully persisted compiled contract...");
                }
            });
        }, console.log);
        return compiled.contracts["powerbid.sol"]["PowerBid"];
    }

    serialize_compiled(compiled) {
        return BSON.serialize(compiled).toString('base64');
    }
    deserialize_compiled(bsonData) {
        return BSON.deserialize(Buffer.from(bsonData, 'base64'));
    }

    db_operation(collection = "compiled") {
        return new Promise(function(resolve, reject) {
            MongoClient.connect(url, function(err, db) {
                if (err) reject(err);
                else {
                    var dbo = db.db("Solidity");
                    resolve(dbo.collection(collection));
                    // TODO: solve db closure
                }
            });
        }.bind(this));
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
        return new Promise(function(resolve, reject) {
            readFile(this.filename).then(data => resolve(this.compile_string(data)), reject);
        }.bind(this));
    }

    compile_cached() {
        return Promise.all([this.find_file(), readFile(this.filename)]).then(function(values) {
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
        Promise.all([this.db_operation("contracts"), this.find_file()]).then(function(args) {
            if (args[1] === null) {
                console.log("file must be compiled before persisting contract...");
            } else {
                args[0].insertOne({ address: ethAddress, contract: args[1] }, (err, res) => {
                    if (err) console.log(err);
                    else console.log("succefully persisted contract with address:" + ethAddress);
                });
            }
        }.bind(this));
    }

    deploy_from_db() {
        return new Promise(function(resolve, reject) {
            this.db_operation("contracts").then(function(collection) {
                collection.findOne({ address: this.address }, (err, res) => {
                    if (err) { reject(err); } else {
                        let compiled = this.deserialize_compiled(res.contract.result);
                        let contract = new web3.eth.Contract(compiled.abi, res.address);
                        resolve({ obj: this, contract: contract });
                    }
                });
            }.bind(this), reject);
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
        return new Promise(function(resolve, reject) {
            this.compile_cached().then(
                function(contract) {
                    console.log("compiled");

                    var transaction = this.get_transaction(contract);

                    console.log("deploying contract");

                    let owner = this.owner;

                    console.log("sending transaction");

                    transaction.estimateGas({ value: 1 }).then(function(gasValue) {
                        console.log("estimated gas value for deployment " + gasValue);
                        transaction.send({
                                from: owner,
                                gas: Math.ceil(gasValue * 1.2),
                                value: this.params["value"]
                            })
                            .on('receipt', function(receipt) {
                                console.log('Contract address is:' + receipt.contractAddress);
                                this.persist_contract(receipt.contractAddress);
                                var localContract = new web3.eth.Contract(contract.abi, receipt.contractAddress);
                                resolve({ obj: this, contract: localContract });
                            }.bind(this))
                            .on('error', reject);
                    }.bind(this));
                }.bind(this), reject);
        }.bind(this));
    }

    deploy() {
        return this.params ? this.deploy_new() : this.deploy_from_db();
    }

}


function main(args) {

    // let powerBid = new PowerBid(
    //     args[0],
    //     "0x665de6aa5aeecc1279ecf4fbd9455dce23b42a93", { auctionPeriodSeconds: 600, consumptionPeriodSeconds: 600, requiredEnergy: 100, value: 20 },
    // );

    let powerBid = new PowerBid(args[0], "0xb8f55325904A1Cbb5a4fD9FbE17ce98A5838391a");

    powerBid.deploy()
        .then((result) => {
            console.log("Contract at:" + result.contract.options.address);
            return result.contract.methods.auction_time_left().call({ from: result.obj.owner }).then((result) => console.log("Auction time_left:" + result));
        }, console.log);
}

main(process.argv.slice(2));


/// TODO: add unit tests code
/// research: mongo mocking, web3 mocking, etc