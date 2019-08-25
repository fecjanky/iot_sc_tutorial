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



class PowerBidWrapper {
    static paramsToArgs(inputs, params) {
        return inputs.map((input) => params[input.name])
    }

    constructor(contract, abi) {
        this.contract = contract;
        abi.filter(elem => elem.type === "function").forEach(function (elem) {
            this[elem.name] = function (params = {}, options = {}) {
                // console.log(`called function:${elem.name} with params:${JSON.stringify(params)} and options:${JSON.stringify(options)}`);
                let args = PowerBidWrapper.paramsToArgs(elem.inputs, params);
                let transaction = this.contract.methods[elem.name].apply(undefined, args);
                if (options["gas"] === undefined) {
                    return Promise.all([
                        Promise.resolve(transaction),
                        transaction.estimateGas({ from: options["from"], value: options["value"] })
                    ])
                        .then(function (args) {
                            return args[0].call({ from: options["from"], value: options["value"], gas: Math.ceil(args[1] * 1.2) });
                        });
                } else {
                    return transaction.call(options);
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
            this.filename = path.resolve(filename);
        } else {
            this.owner = null;
            this.params = null;
            this.address = owner;
            this.filename = null;
        }
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
            let compiledContractBSON = PowerBid.serialize_compiled(compiledContract);
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
            if (values[0] === null || values[0].content !== values[1]) {
                console.log("file has changed or not compiled yet, recompiling source...");
                return this.compile_and_cache(values[1]);
            } else {
                console.log("file has not changed, using compiled data from db...");
                return PowerBid.deserialize_compiled(values[0].result);
            }
        }.bind(this));
    }


    persist_contract(ethAddress) {
        console.log("persisting contract to db...");
        Promise.all([MongoClient.connect(this.mongoDbUrl), this.find_file()]).then(function (args) {
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
        return MongoClient.connect(this.mongoDbUrl).then(function (conn) {
            return conn.db('Solidity').collection("contracts").findOne({ address: this.address }).then(function (result) {
                conn.close();
                let compiled = PowerBid.deserialize_compiled(result.contract.result);
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
        return this.compile_cached().then(
            function (contract) {
                console.log("compiled");
                let transaction = this.get_transaction(contract);
                console.log("deploying contract");
                return Promise.all([Promise.resolve(contract), Promise.resolve(transaction), transaction.estimateGas({ value: 1 })]);
            }.bind(this)).then(function (args) {
                let contract = args[0];
                let transaction = args[1];
                let gasValue = args[2];
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
                    .on('error', (err) => { throw err; }), Promise.resolve(contract)]);
            }.bind(this)).then(function (args) {
                return new PowerBidWrapper(args[0], args[1].abi);
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
                args[0].close();
                return args[1].map((obj) => obj["address"]);
            });
        }.bind(this);

        this.getAPI = function (user, args) {
            return MongoClient.connect(this.mongoDbUrl).then(function (conn) {
                return conn.db('Solidity').collection("contracts").findOne({ address: args.__address }).then(function (result) {
                    conn.close();
                    let compiled = PowerBid.deserialize_compiled(result.contract.result);
                    return compiled.abi
                }.bind(this));
            }.bind(this));
        }.bind(this);


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

    let powerBid = creator.create(args[0], "0xff00bA131E714C1B2f8283F4ac10bdc3f8D91426");

    powerBid.deploy()
        .then((result) => {
            console.log("Contract at:" + result.contract.options.address);
            return result.auction_time_left().then((result) => console.log("Auction time_left:" + result));
            // return result.contract.methods.auction_time_left().call({}).then((result) => console.log("Auction time_left:" + result));
        }, console.log);

    // creator.getDeployedContracts().then(console.log);
}

module.exports.Creator = function (web3Provider, mongoDbUrl) {
    return new PowerBidCreator(web3Provider, mongoDbUrl);
};

class TestClass {
    constructor(id) {
        this.id = id;
    }
    doSomething(arg1, arg2) {
        console.log(`id=${this.id} arg1=${arg1} arg2=${arg2}`);
    };
};

if (require.main === module) {
    main(process.argv.slice(2));
    //let obj = new TestClass(2);
    //TestClass.prototype["doSomething"].apply(obj, ["lol", "fuck"]);
}





/// TODO: add unit tests code
/// research: mongo mocking, web3 mocking, etc