let path = require('path');
let MongoClient = require('mongodb').MongoClient;
let SolcWrapper = require('./solcWrapper');
let ContractWrapper = require('./contractWrapper');

class PowerBid {

    constructor(web3Provider, mongoUrl, filename, owner, params) {
        this.web3Provider = web3Provider;
        this.mongoDbUrl = mongoUrl;
        if (typeof params !== 'undefined' && params) {
            this.owner = owner;
            this.params = params;
            this.address = null;
            this.solc = SolcWrapper.SolcWrapper(this.mongoDbUrl, path.resolve(filename));
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
                return ContractWrapper.ContractWrapper(contract, compiled.abi);
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
                return ContractWrapper.ContractWrapper(contract, compiled.abi);
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
            let solc = SolcWrapper.SolcWrapper(this.mongoDbUrl, filename);
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
    //     "0xa87bccbc9b49178f51f33fbc2f8ae352631e670d", { auctionPeriodSeconds: 600, consumptionPeriodSeconds: 600, requiredEnergy: 100, value: 20 },
    // );

    let powerBid = creator.create(args[0], "0xB649E7926abD981E69719d42cfCA0C45A715ad32");

    powerBid.deploy()
        .then((result) => {
            console.log("Contract at:" + result.contract.options.address);
            // result.bid({ _price: 9 }, { from: "0x65fb3AC32da1E2Bd43818Ed3A2C56EFF45958121" }).then(console.log);
            return result.auction_time_left().then((result) => console.log("Auction time_left:" + result));
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
