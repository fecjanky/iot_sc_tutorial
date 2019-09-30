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
class PersistedContract {

    constructor(web3Provider, mongoUrl, filename, key, type, owner, params, user) {
        this.web3Provider = web3Provider;
        this.mongoDbUrl = mongoUrl;
        this.type = type;
        if (typeof params !== 'undefined' && params) {
            this.owner = owner;
            this.params = params;
            this.address = null;
            this.solc = SolcWrapper.SolcWrapper(this.mongoDbUrl, filename != null ? path.resolve(filename) : null, key);
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
                let contract = { address: ethAddress, contract: file, sessionId: currentSession.sessionId.toString(), type: this.type };
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
class SCAPI {
    constructor(web3Provider, mongoDbUrl) {
        this.web3Provider = web3Provider;
        this.mongoDbUrl = mongoDbUrl;
    }

    static getDefaultType(args) {
        return args.type !== undefined ? args.type : "PowerBid";
    }

    getDeployedContracts(user, args) {
        console.log(args);
        return MongoClient.connect(this.mongoDbUrl).then(function (db) {
            let collection = db.db("Solidity").collection("contracts");
            return Promise.all([Promise.resolve(db), collection.find(args).toArray()]);
        }).then((promiseResult) => {
            let [db, result] = promiseResult;
            db.close();
            return [... new Set(result.filter(elem => {
                return elem.type === SCAPI.getDefaultType(args);
            }).map((obj) => obj["address"]))];
        });
    }

    getAPI(user, args) {
        return MongoClient.connect(this.mongoDbUrl).then(function (conn) {
            return conn.db('Solidity').collection("contracts").findOne({ address: args.__address }).then(function (result) {
                conn.close();
                let compiled = SolcWrapper.deserialize_compiled(result.contract.result);
                return compiled.abi
            }.bind(this));
        }.bind(this));
    }

    getCurrentCtorAPI(user, args) {
        let type = SCAPI.getDefaultType(args);
        let solc = SolcWrapper.SolcWrapper(this.mongoDbUrl, this.getFilePath(type), this.getKey(user, type));
        return solc.compile_cached().then(compiled => {
            let ctor = compiled.abi.filter(elem => elem.type === "constructor")[0];
            return ctor.inputs;
        });
    }

    createContract(user, args) {
        args = SCAPI.getTypeForCreate(args);
        let smartContract = this.create(this.getFilePath(args.type), this.getKey(user, args.type), args.type, user.ethaccount, args.args, user);
        return smartContract.deploy().then(result => result.contract.options.address);
    }

    userData(user, args) {
        return Promise.resolve({ account: user.ethaccount });
    };

    getAllSessions(user, args) {
        return TrainingSession(this.mongoDbUrl).getAllSessions();
    };


    newSession(user, args) {
        return TrainingSession(this.mongoDbUrl).newSession();
    };

    handleUpload(user, files) {
        let solc = SolcWrapper.SolcWrapper(this.mongoDbUrl, files.contract.path, `${user.username}.contract`);
        return solc.compile_cached().then(compiled => {
            console.log("Uploaded contract is valid");
            return "compiled";
        });
    }

    callContract(user, args) {
        let name = args.__name;
        let address = args.__address;
        delete args.__address;
        delete args.__name;
        // TODO: parse all options
        let opts = SCAPI.getCallOptions(user, args);
        return this.create(null, null, null, address).deploy().then(result => result[name](opts.args, opts.options, user));
    }

    static getCallOptions(user, args) {
        let options = {
            from: user.ethaccount,
            gas: args.__opt_gas,
            value: args.__opt_value
        };
        delete args.__opt_gas;
        delete args.__opt_value;
        return { options: options, args: args };
    }

    static getTypeForCreate(args) {
        let type = args.__type !== undefined ? args.__type : "PowerBid";
        delete args.__type;
        return { type: type, args: args };
    }

    getFilePath(type) {
        return type !== "FreeStyle" ? path.join(__dirname, "..", "..", "..", "src", "powerbid.sol") : null;
    }

    getKey(user, type) {
        return type === "FreeStyle" ? `${user.username}.contract` : null;
    }

    create(filename, key, type, owner, params, user) {
        // TODO: pass on options
        return new PersistedContract(this.web3Provider, this.mongoDbUrl, filename, key, type, owner, params, user);
    }
}


function main(args) {
    let Web3 = require("web3");
    let CryptoJS = require("crypto-js");
    let web3 = new Web3(new Web3.providers.WebsocketProvider('ws://localhost:8546'));
    let url = "mongodb://localhost:27018/Solidity";
    let creator = new SCAPI(web3, url);
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
    return new SCAPI(web3Provider, mongoDbUrl);
};

if (require.main === module) {
    main(process.argv.slice(2));
}





