let path = require('path');
let MongoClient = require('mongodb').MongoClient;
let SolcWrapper = require('./solcWrapper');
let ContractWrapper = require('./contractWrapper').ContractWrapper;
let ContractConstructor = require('./contractWrapper').Constructor;
let User = require('../model/user');
let TrainingSession = require("./trainingSession").TrainingSession;

// TODO: close mongo connection properly
// TODO: add unit tests using MochaJS
// TODO: Mock mongo in tests: https://github.com/nodkz/mongodb-memory-server 
// TODO: Mock web3 in tests ganache-cli

// TODO: rename to deployer
class PowerBid {

    constructor(web3Provider, mongoUrl, filename, owner, params, user) {
        this.web3Provider = web3Provider;
        this.mongoDbUrl = mongoUrl;
        if (typeof params !== 'undefined' && params) {
            this.owner = owner;
            this.params = params;
            this.address = null;
            this.solc = SolcWrapper.SolcWrapper(this.mongoDbUrl, path.resolve(filename));
            this.user = user;
        } else {
            this.owner = null;
            this.params = null;
            this.address = owner;
            this.solc = null;
        }
    }

    persist_contract(ethAddress) {
        console.log("persisting contract to db...");
        Promise.all([MongoClient.connect(this.mongoDbUrl), this.solc.find_file(), TrainingSession(this.mongoDbUrl).currentSession()]).then(function (args) {
            let [conn, file, currentSession] = args;
            if (file === null) {
                console.log("file must be compiled before persisting contract...");
            } else {
                let collection = conn.db("Solidity").collection("contracts");
                let contract = { address: ethAddress, contract: file, sessionId: currentSession.sessionId.toString(), type: "PowerBid" };
                console.log(contract);
                collection.insertOne(contract, (err, res) => {
                    if (err) console.log(err);
                    else console.log("succefully persisted contract with address:" + ethAddress);
                });
            }
            conn.close();
        }.bind(this));
    }


    deploy_from_db() {
        return MongoClient.connect(this.mongoDbUrl).then(function (conn) {
            return conn.db('Solidity').collection("contracts").findOne({ address: this.address }).then(function (result) {
                conn.close();
                let compiled = SolcWrapper.deserialize_compiled(result.contract.result);
                let contract = new this.web3Provider.eth.Contract(compiled.abi, result.address);
                return ContractWrapper(this.web3Provider)(contract, compiled.abi);
            }.bind(this));
        }.bind(this));
    }

    deploy_new() {
        return this.solc.compile_cached()
            .then(function (contract) {
                console.log("compiled");
                return ContractConstructor(this.web3Provider, contract)(this.params, { from: this.owner, value: this.params.value }, this.user);
            }.bind(this))
            .then(function (result) {
                this.persist_contract(result.contract.options.address);
                return result;
            }.bind(this));
    }

    deploy() {
        return this.params ? this.deploy_new() : this.deploy_from_db();
    }

}

// TODO: rename to PowerBidAPI
class PowerBidCreator {
    constructor(web3Provider, mongoDbUrl) {
        this.web3Provider = web3Provider;
        this.mongoDbUrl = mongoDbUrl;

        this.getDeployedContracts = function (user, args) {
            console.log(args);
            return MongoClient.connect(this.mongoDbUrl).then(function (db) {
                let collection = db.db("Solidity").collection("contracts");
                console.log(args)
                return Promise.all([Promise.resolve(db), collection.find(args).toArray()]);
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
            let powerBid = this.create(this.getFilePath(), user.ethaccount, args, user);
            return powerBid.deploy().then(result => result.contract.options.address);
        }.bind(this);

        this.userData = function (user, args) {
            return Promise.resolve({ account: user.ethaccount });
        };

        this.getAllSessions = function (user, args) {
            return TrainingSession(this.mongoDbUrl).getAllSessions();
        };

        this.newSession = function (user, args) {
            return TrainingSession(this.mongoDbUrl).newSession();
        }

        this.callContract = function (user, args) {
            let name = args.__name;
            let address = args.__address;
            delete args.__address;
            delete args.__name;
            // TODO: parse all options
            let options = {
                from: user.ethaccount,
                gas: args.__opt_gas,
                value: args.__opt_value
            };
            delete args.__opt_gas;
            delete args.__opt_value;
            return this.create(null, address).deploy().then(result => result[name](args, options, user));
        }.bind(this);
    }

    getFilePath() {
        return path.join(__dirname, "..", "..", "..", "src", "powerbid.sol");
    }

    create(filename, owner, params, user) {
        // TODO: pass on options
        return new PowerBid(this.web3Provider, this.mongoDbUrl, filename, owner, params, user);
    }
}


function main(args) {
    let Web3 = require("web3");
    let CryptoJS = require("crypto-js");
    let web3 = new Web3(new Web3.providers.WebsocketProvider('ws://localhost:8546'));
    let url = "mongodb://localhost:27018/Solidity";
    let creator = new PowerBidCreator(web3, url);
    let testUser = { password: "deadbeef", password2: CryptoJS.AES.encrypt("aa", "deadbeef").toString() }
    let trainingSession = require("./trainingSession").TrainingSession(url);

    let currSession = console.log(trainingSession.currentSession());

    trainingSession.newSession().then(newSession => {
        console.log(newSession);
    });

    return 0;




    // let powerBid = creator.create(
    //     args[0],
    //     "0x3ee413e4272cb2bcd8be37feaf870663c1960223", { auctionPeriodSeconds: 600, consumptionPeriodSeconds: 600, requiredEnergy: 100, value: 20 },
    //     testUser
    // );

    let powerBid = creator.create(args[0], "0x0A9eA7439E99d0702f6383F85C2c41bcfE21a251");

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





