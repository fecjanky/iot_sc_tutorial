class ContractWrapper {
    static paramsToArgs(inputs, params) {
        return inputs.map((input) => params[input.name])
    }

    constructor(contract, abi) {
        this.contract = contract;
        abi.filter(elem => elem.type === "function").forEach(function (elem) {
            this[elem.name] = function (params = {}, options = {}) {
                let args = ContractWrapper.paramsToArgs(elem.inputs, params);
                console.log(args);
                let transaction = this.contract.methods[elem.name].apply(undefined, args);
                if (options["gas"] === undefined) {
                    return Promise.all([
                        Promise.resolve(transaction),
                        transaction.estimateGas({ from: options["from"], value: options["value"] })
                    ])
                        .then(function (args) {
                            let [transaction, estimatedGas] = args;
                            let estimatedOptions = { ...options, ... { gas: Math.ceil(estimatedGas * 1.2) } };
                            if (elem.stateMutability === "view")
                                return transaction.call(estimatedOptions);
                            else
                                return transaction.send(estimatedOptions);
                        });
                } else {
                    if (elem.stateMutability === "view")
                        return transaction.call(options);
                    else
                        return transaction.send(options);
                }
            }.bind(this);
        }.bind(this));
    }
}

module.exports.ContractWrapper = function (contract, abi) { return new ContractWrapper(contract, abi); };