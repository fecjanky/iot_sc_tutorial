let User = require('../model/user');

class ContractWrapper {
    static paramsToArgs(inputs, params) {
        return inputs.map((input) => params[input.name])
    }

    static sendSignedTransaction(web3api, transaction, options, user) {
        // TODO: get nonce, get gas price
        let eth_transaction = { ...options, "data": transaction.encodeABI() };
        return web3api.eth.personal.signTransaction(eth_transaction, User.password(user)).then(signedTransaction => {
            return web3api.eth.sendSignedTransaction(signedTransaction);
        });
    }

    static sendTransaction(mutable, web3api, transaction, options, user) {
        if (!mutable) {
            return transaction.call(options);
        } else {
            return ContractWrapper.sendSignedTransaction(web3api, transaction, options, user);
        }
    }

    static transactionWithEstimation(mutable, web3api, transaction, options, user) {
        return transaction.estimateGas(options)
            .then(function (estimatedGas) {
                let estimatedOptions = { ...options, ... { gas: Math.ceil(estimatedGas * 1.2) } };
                return ContractWrapper.sendTransaction(mutable, web3api, transaction, estimatedOptions, user);
            });
    }


    constructor(contract, abi, web3api) {
        this.contract = contract;
        this.web3api = web3api;
        abi.filter(elem => elem.type === "function").forEach(function (elem) {
            this[elem.name] = function (params = {}, options = {}, user = null) {
                let args = ContractWrapper.paramsToArgs(elem.inputs, params);
                let transaction = this.contract.methods[elem.name].apply(undefined, args);
                let mutable = elem.stateMutability !== "view";
                console.log(args);
                if (options["gas"] === undefined) {
                    return ContractWrapper.transactionWithEstimation(mutable, web3api, transaction, options, user);
                } else {
                    return ContractWrapper.sendTransaction(mutable, web3api, transaction, estimatedOptions, user);
                }
            }.bind(this);
        }.bind(this));
    }
}

module.exports.ContractWrapper = function (web3api) {
    return function (contract, abi) { return new ContractWrapper(contract, abi, web3api); }
};