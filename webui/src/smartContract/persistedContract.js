let ContractWrapper = require('./contractWrapper').ContractWrapper;
let ContractConstructor = require('./contractWrapper').Constructor;
let TrainingSession = require("./trainingSession").TrainingSession;
let SolcWrapper = require('./solcWrapper');
let MongoClient = require('mongodb').MongoClient;

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

module.exports.PersistedContract = function (web3Provider, mongoUrl, filename, key, type, owner, params, user) {
    return new PersistedContract(web3Provider, mongoUrl, filename, key, type, owner, params, user);
}