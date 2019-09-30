let User = require('../model/user');

class ContractWrapper {
    static paramsToArgs(inputs, params) {
        return inputs.map((input) => params[input.name])
    }

    static sendSignedTransaction(web3api, transaction, options, user) {
        let eth_transaction = { ...options, "data": transaction.encodeABI() };
        return web3api.eth.personal.signTransaction(eth_transaction, User.password(user)).then(signedTransaction => {
            return web3api.eth.sendSignedTransaction(signedTransaction.raw);
        });
    }

    static sendTransaction(mutable, web3api, transaction, options, user) {
        if (!mutable) {
            return transaction.call(options);
        } else {
            return ContractWrapper.sendSignedTransaction(web3api, transaction, options, user);
        }
    }

    static estimateGas(mutable, web3api, transaction, options) {
        return options.gas === undefined && mutable
            ? transaction.estimateGas(options).then(estimatedGas => { return { gas: Math.ceil(estimatedGas * 1.2) } })
            : Promise.resolve({ gas: options.gas === undefined ? 0 : options.gas });
    }

    static getGasPrice(mutable, web3api, options) {
        return options.gasPrice === undefined && mutable
            ? web3api.eth.getGasPrice().then(gasPrice => { return { gasPrice: gasPrice } })
            : Promise.resolve({ gasPrice: options.gasPrice === undefined ? 0 : options.gasPrice });
    }

    static getNonce(mutable, web3api, options) {
        return options.nonce === undefined && mutable
            ? web3api.eth.getTransactionCount(options.from, "pending").then(nonce => { return { nonce: nonce } })
            : Promise.resolve({ nonce: options.nonce === undefined ? 0 : options.nonce });
    }

    static enrichOptions(mutable, web3api, transaction, options) {
        return Promise.all([
            ContractWrapper.estimateGas(mutable, web3api, transaction, options),
            ContractWrapper.getGasPrice(mutable, web3api, options),
            ContractWrapper.getNonce(mutable, web3api, options)
        ])
            .then(function (args) {
                let [gas, gasPrice, nonce] = args;
                return { ...options, ...gas, ...gasPrice, ...nonce };
            });
    }

    static Constructor(web3api, compiled) {
        let ctor = compiled.abi.filter(elem => elem.type === "constructor")[0];
        return function (params = {}, options = {}, user) {
            let args = ContractWrapper.paramsToArgs(ctor.inputs, params);
            let bytecode = '0x' + compiled.evm.bytecode.object;
            let contract = new web3api.eth.Contract(compiled.abi);
            let transaction = contract.deploy({ data: bytecode, arguments: args });
            return ContractWrapper.enrichOptions(true, web3api, transaction, options).then(enrichedOpts =>
                ContractWrapper.sendTransaction(true, web3api, transaction, enrichedOpts, user)
            ).then(receipt => new ContractWrapper(new web3api.eth.Contract(compiled.abi, receipt.contractAddress), compiled.abi, web3api));
        };
    }

    constructor(contract, abi, web3api) {
        this.contract = contract;
        this.web3api = web3api;
        abi.filter(elem => elem.type === "function").forEach(function (elem) {
            this[elem.name] = function (params = {}, options = {}, user = null) {
                let args = ContractWrapper.paramsToArgs(elem.inputs, params);
                let transaction = this.contract.methods[elem.name].apply(undefined, args);
                let mutable = elem.stateMutability !== "view";
                return ContractWrapper.enrichOptions(mutable, web3api, transaction, options).then(enrichedOpts =>
                    ContractWrapper.sendTransaction(mutable, web3api, transaction, enrichedOpts, user)
                );
            }.bind(this);
        }.bind(this));
    }
}

module.exports.ContractWrapper = function (web3api) {
    return function (contract, abi) { return new ContractWrapper(contract, abi, web3api); }
};

module.exports.Constructor = function (web3api, compiled) {
    return ContractWrapper.Constructor(web3api, compiled);
}