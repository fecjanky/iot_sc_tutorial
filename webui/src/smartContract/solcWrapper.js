let fs = require("fs");
let solc = require('solc');
let BSON = require('bson');
let path = require('path');
let MongoClient = require('mongodb').MongoClient;


let readFile = function (fileName, encoding = 'utf8') {
    return new Promise((resolve, reject) => {
        fs.readFile(fileName, encoding, (err, data) => {
            if (err) reject(err);
            else resolve(data);
        });
    });
};

class SolcWrapper {
    constructor(mongoDbUrl, fileName, key = null) {
        this.mongoDbUrl = mongoDbUrl;
        this.filename = fileName;
        this.key = key != null ? key : this.filename;
    }

    compile_string(str) {
        let input = this.getConfig(str);
        let output = JSON.parse(solc.compile(JSON.stringify(input)))
        if (output.errors !== undefined) {
            return Promise.reject(Error(JSON.stringify(output.errors)));
        }
        return Promise.resolve(output);
    }

    compile() {
        return readFile(this.filename).then(data => this.compile_string(data));
    }

    compile_cached() {
        return Promise.all([this.find_file(), this.filename != null ? readFile(this.filename) : Promise.resolve(null)]).then(function (values) {
            let [file_db, file_content] = values;
            if (file_db === null || (file_db.content !== file_content && file_content !== null)) {
                console.log("file has changed or not compiled yet, recompiling source...");
                return this.compile_and_cache(file_content);
            } else if (file_db !== null) {
                console.log("file has not changed, using compiled data from db...");
                return SolcWrapper.deserialize_compiled(file_db.result);
            } else {
                return Promise.reject("Missing contract");
            }
        }.bind(this));
    }

    find_file() {
        return MongoClient.connect(this.mongoDbUrl).then(function (conn) {
            return conn.db("Solidity").collection("compiled").findOne({ filename: this.key }).then(result => {
                conn.close();
                return result;
            });
        }.bind(this));
    }

    compile_and_cache(data) {
        return this.compile_string(data).then(compiled => {
            let source_name = path.basename(this.filename);
            let compiledContracts = compiled.contracts[source_name];
            let contractName = Object.keys(compiledContracts)[0];
            let compiledContract = compiled.contracts[source_name][contractName];
            MongoClient.connect(this.mongoDbUrl).then(function (conn) {
                // TODO: persist every contract from file
                console.log(`Contract name is ${contractName}`);
                let compiledContractBSON = SolcWrapper.serialize_compiled(compiledContract);
                conn.db("Solidity").collection("compiled")
                    .updateOne({ filename: this.key },
                        { $set: { content: data, result: compiledContractBSON } },
                        { upsert: true })
                    .then(result => {
                        console.log("Persisted compiled contract to db");
                        conn.close();
                    });
            }.bind(this), console.log);
            return Promise.resolve(compiledContract);
        });
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


module.exports.SolcWrapper = function (mongoDbUrl, fileName, key = null) {
    return new SolcWrapper(mongoDbUrl, fileName, key);
};
module.exports.deserialize_compiled = SolcWrapper.deserialize_compiled;
module.exports.serialize_compiled = SolcWrapper.serialize_compiled;