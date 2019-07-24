fs = require("fs");
solc = require('solc');
path = require('path');

Web3 = require("web3");
let web3 = new Web3(Web3.providers.WebsocketProvider('ws://localhost:8546'));

class PowerBid {

    constructor(filename, owner, params, value) {
        this.filename = path.resolve(filename);
        this.owner = owner;
        this.params = params;
        this.value = value;
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

    compile() {
        return new Promise(function(resolve, reject) {
            fs.readFile(this.filename, 'utf8', (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    var input = this.getConfig(data);
                    var output = JSON.parse(solc.compile(JSON.stringify(input)))
                    resolve(output);
                }
            });

        }.bind(this));
    }

    deploy() {
        return new Promise(function(resolve, reject) {
            this.compile().then(
                function(output) {
                    console.log("compiled");

                    let contract = output.contracts["powerbid.sol"]["PowerBid"];
                    let bytecode = '0x' + contract.evm.bytecode.object;


                    var powerbid = new web3.eth.Contract(contract.abi);

                    var transaction = powerbid.deploy({
                        data: bytecode,
                        arguments: [this.params.auctionPeriodSeconds, this.params.consumptionPeriodSeconds, 100]
                    });

                    let owner = this.owner;

                    return transaction.send({
                        from: owner,
                        gas: 3000000,
                        gasPrice: '1000000000',
                        value: this.value
                    });

                }.bind(this), (error) => reject(error)).then((contract) => resolve({ obj: this, contract: contract }));
        }.bind(this));
    }
}


var myArgs = process.argv.slice(2);

let powerBid = new PowerBid(myArgs[0], "0x665de6aa5aeecc1279ecf4fbd9455dce23b42a93", { auctionPeriodSeconds: 600, consumptionPeriodSeconds: 600, requiredEnergy: 100 }, 20);

powerBid.deploy()
    .then((result) => {
        console.log("Contract created by " + result.obj.owner + " at:" + result.contract.options.address);
        return result.contract.methods.auction_time_left().call({ from: result.obj.owner }).then((result) => console.log("Auction time_left:" + result));
    }, console.log);