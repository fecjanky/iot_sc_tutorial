fs = require("fs");
solc = require('solc');
path = require('path');
MongoClient = require('mongodb').MongoClient;
BSON = require('bson');



let readFile = function (fileName, encoding = 'utf8') {
    return new Promise((resolve, reject) => {
        fs.readFile(fileName, encoding, (err, data) => {
            if (err) reject(err);
            else resolve(data);
        });
    });
};


class SolcWrapper {
    constructor(mongoDbUrl, fileName) {
        this.mongoDbUrl = mongoDbUrl;
        this.filename = fileName;
    }

    compile_string(str) {
        let input = this.getConfig(str);
        let output = JSON.parse(solc.compile(JSON.stringify(input)))
        return output;
    }

    compile() {
        return new Promise(function (resolve, reject) {
            readFile(this.filename).then(data => resolve(this.compile_string(data)), reject);
        }.bind(this));
    }

    compile_cached() {
        return Promise.all([this.find_file(), readFile(this.filename)]).then(function (values) {
            let [file_db, file_content] = values;
            if (file_db === null || file_db.content !== file_content) {
                console.log("file has changed or not compiled yet, recompiling source...");
                return this.compile_and_cache(file_content);
            } else {
                console.log("file has not changed, using compiled data from db...");
                return SolcWrapper.deserialize_compiled(file_db.result);
            }
        }.bind(this));
    }

    find_file() {
        return MongoClient.connect(this.mongoDbUrl).then(function (conn) {
            return conn.db("Solidity").collection("compiled").findOne({ filename: this.filename }).then(result => {
                conn.close();
                return result;
            });
        }.bind(this));
    }

    compile_and_cache(data) {
        let compiled = this.compile_string(data);
        MongoClient.connect(this.mongoDbUrl).then(function (conn) {
            let compiledContract = compiled.contracts["powerbid.sol"]["PowerBid"];
            let compiledContractBSON = SolcWrapper.serialize_compiled(compiledContract);
            conn.db("Solidity").collection("compiled")
                .updateOne({ filename: this.filename },
                    { $set: { content: data, result: compiledContractBSON } },
                    { upsert: true })
                .then(result => conn.close());
        }.bind(this), console.log);

        // TODO: factor out magic string constants
        return compiled.contracts["powerbid.sol"]["PowerBid"];
    }

    static serialize_compiled(compiled) {
        return BSON.serialize(compiled).toString('base64');
    }

    static deserialize_compiled(bsonData) {
        return BSON.deserialize(Buffer.from(bsonData, 'base64'));
    }

    getConfig(data) {
        let source_name = path.basename(this.filename);
        let obj = {
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
}


class PowerBidWrapper {
    static paramsToArgs(inputs, params) {
        return inputs.map((input) => params[input.name])
    }

    constructor(contract, abi) {
        this.contract = contract;
        abi.filter(elem => elem.type === "function").forEach(function (elem) {
            this[elem.name] = function (params = {}, options = {}) {
                let args = PowerBidWrapper.paramsToArgs(elem.inputs, params);
                console.log(args);
                let transaction = this.contract.methods[elem.name].apply(undefined, args);
                if (options["gas"] === undefined) {
                    return Promise.all([
                        Promise.resolve(transaction),
                        transaction.estimateGas({ from: options["from"], value: options["value"] })
                    ])
                        .then(function (args) {
                            let [transaction, estimatedGas] = args;
                            let estimatedOptions = { ...options, ... { gas: Math.ceil(estimatedGas * 1.2) } };
                            if (elem.stateMutability === "view")
                                return transaction.call(estimatedOptions);
                            else
                                return transaction.send(estimatedOptions);
                        });
                } else {
                    if (elem.stateMutability === "view")
                        return transaction.call(options);
                    else
                        return transaction.send(options);
                }
            }.bind(this);
        }.bind(this));
    }
}

class PowerBid {

    constructor(web3Provider, mongoUrl, filename, owner, params) {
        this.web3Provider = web3Provider;
        this.mongoDbUrl = mongoUrl;
        if (typeof params !== 'undefined' && params) {
            this.owner = owner;
            this.params = params;
            this.address = null;
            this.solc = new SolcWrapper(this.mongoDbUrl, path.resolve(filename));
        } else {
            this.owner = null;
            this.params = null;
            this.address = owner;
            this.solc = null;
        }
    }

    persist_contract(ethAddress) {
        console.log("persisting contract to db...");
        Promise.all([MongoClient.connect(this.mongoDbUrl), this.solc.find_file()]).then(function (args) {
            let [mongod, file] = args;
            if (file === null) {
                console.log("file must be compiled before persisting contract...");
            } else {
                let collection = mongod.db("Solidity").collection("contracts");
                collection.insertOne({ address: ethAddress, contract: file }, (err, res) => {
                    if (err) console.log(err);
                    else console.log("succefully persisted contract with address:" + ethAddress);
                });
            }
            mongod.close();
        }.bind(this));
    }


    deploy_from_db() {
        return MongoClient.connect(this.mongoDbUrl).then(function (conn) {
            return conn.db('Solidity').collection("contracts").findOne({ address: this.address }).then(function (result) {
                conn.close();
                let compiled = SolcWrapper.deserialize_compiled(result.contract.result);
                let contract = new this.web3Provider.eth.Contract(compiled.abi, result.address);
                return new PowerBidWrapper(contract, compiled.abi);
            }.bind(this));
        }.bind(this));
    }

    get_transaction(contract) {
        let bytecode = '0x' + contract.evm.bytecode.object;

        let powerbid = new this.web3Provider.eth.Contract(contract.abi);

        let transaction = powerbid.deploy({
            data: bytecode,
            arguments: [this.params.auctionPeriodSeconds, this.params.consumptionPeriodSeconds, this.params.requiredEnergy]
        });
        return transaction;
    }

    deploy_new() {
        return this.solc.compile_cached().then(
            function (contract) {
                console.log("compiled");
                let transaction = this.get_transaction(contract);
                console.log("deploying contract");
                return Promise.all([Promise.resolve(contract), Promise.resolve(transaction), transaction.estimateGas({ value: 1 })]);
            }.bind(this)).then(function (args) {
                let [contract, transaction, gasValue] = args;
                console.log("estimated gas value for deployment " + gasValue);
                console.log("sending transaction...");

                return Promise.all([transaction.send({
                    from: this.owner,
                    gas: Math.ceil(gasValue * 1.2),
                    value: this.params["value"]
                })
                    .once('receipt', function (receipt) {
                        console.log('Contract address is:' + receipt.contractAddress);
                        this.persist_contract(receipt.contractAddress);
                    }.bind(this))
                    , Promise.resolve(contract)]);
            }.bind(this)).then(function (args) {
                let [contract, compiled] = args;
                return new PowerBidWrapper(contract, compiled.abi);
            }.bind(this));
    }

    deploy() {
        return this.params ? this.deploy_new() : this.deploy_from_db();
    }

}


class PowerBidCreator {
    constructor(web3Provider, mongoDbUrl) {
        this.web3Provider = web3Provider;
        this.mongoDbUrl = mongoDbUrl;

        this.getDeployedContracts = function (user, args) {
            return MongoClient.connect(this.mongoDbUrl).then(function (db) {
                let collection = db.db("Solidity").collection("contracts");
                return Promise.all([Promise.resolve(db), collection.find({}).toArray()]);
            }).then((args) => {
                let [db, result] = args;
                db.close();
                return [... new Set(result.map((obj) => obj["address"]))];
            });
        }.bind(this);

        this.getAPI = function (user, args) {
            return MongoClient.connect(this.mongoDbUrl).then(function (conn) {
                return conn.db('Solidity').collection("contracts").findOne({ address: args.__address }).then(function (result) {
                    conn.close();
                    let compiled = SolcWrapper.deserialize_compiled(result.contract.result);
                    return compiled.abi
                }.bind(this));
            }.bind(this));
        }.bind(this);

        this.getCurrentCtorAPI = function (user, args) {
            // TODO: factor out filename of contract
            let filename = this.getFilePath();
            let solc = new SolcWrapper(this.mongoDbUrl, filename);
            return solc.compile_cached().then(compiled => {
                let ctor = compiled.abi.filter(elem => elem.type === "constructor")[0];
                return ctor.inputs;
            });
        }.bind(this);

        this.createContract = function (user, args) {
            let powerBid = this.create(this.getFilePath(), user.ethaccount, args);
            return powerBid.deploy().then(result => result.contract.options.address);
        }.bind(this);

        this.userData = function (user, args) {
            return Promise.resolve({ account: user.ethaccount });
        };

        this.callContract = function (user, args) {
            let name = args.__name;
            let address = args.__address;
            delete args.__address;
            delete args.__name;
            let options = {
                from: user.ethaccount,
                gas: args.__opt_gas,
                value: args.__opt_value
            };
            delete args.__opt_gas;
            delete args.__opt_value;
            return this.create(null, address).deploy().then(result => result[name](args, options));
        }.bind(this);
    }

    getFilePath() {
        return path.join(__dirname, "..", "..", "..", "src", "powerbid.sol");
    }

    create(filename, owner, params) {
        return new PowerBid(this.web3Provider, this.mongoDbUrl, filename, owner, params);
    }
}


function main(args) {
    Web3 = require("web3");
    let web3 = new Web3(new Web3.providers.WebsocketProvider('ws://localhost:8546'));
    let url = "mongodb://localhost:27017/Solidity";
    let creator = new PowerBidCreator(web3, url);

    // let powerBid = creator.create(
    //     args[0],
    //     "0x0bbcab1846baf036cf75b1250c7563ee9e8dce77", { auctionPeriodSeconds: 600, consumptionPeriodSeconds: 600, requiredEnergy: 100, value: 20 },
    // );

    let powerBid = creator.create(args[0], "0x334bBf2884674B2627E0199AEDA74f7a84B75152");

    powerBid.deploy()
        .then((result) => {
            console.log("Contract at:" + result.contract.options.address);
            result.bid({ _price: 9 }, { from: "0x65fb3AC32da1E2Bd43818Ed3A2C56EFF45958121" }).then(console.log);
            // return result.auction_time_left().then((result) => console.log("Auction time_left:" + result));
            // return result.contract.methods.auction_time_left().call({}).then((result) => console.log("Auction time_left:" + result));
        }, console.log);

    // creator.getDeployedContracts().then(console.log);
}

module.exports.Creator = function (web3Provider, mongoDbUrl, contractSrc = null) {
    return new PowerBidCreator(web3Provider, mongoDbUrl);
};

if (require.main === module) {
    main(process.argv.slice(2));
}





/// TODO: add unit tests code
/// research: mongo mocking, web3 mocking, etc
