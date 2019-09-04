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
        let source_name = path.basename(this.filename);
        let contract_name = "PowerBid";
        MongoClient.connect(this.mongoDbUrl).then(function (conn) {
            // TODO: factor out contract name, and persist every contract from file
            let compiledContract = compiled.contracts[source_name][contract_name];
            let compiledContractBSON = SolcWrapper.serialize_compiled(compiledContract);
            conn.db("Solidity").collection("compiled")
                .updateOne({ filename: this.filename },
                    { $set: { content: data, result: compiledContractBSON } },
                    { upsert: true })
                .then(result => conn.close());
        }.bind(this), console.log);
        return compiled.contracts[source_name][contract_name];
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


module.exports.SolcWrapper = function (mongoDbUrl, fileName) {
    return new SolcWrapper(mongoDbUrl, fileName);
};
module.exports.deserialize_compiled = SolcWrapper.deserialize_compiled;
module.exports.serialize_compiled = SolcWrapper.serialize_compiled;