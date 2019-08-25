function getJSON(endpoint) {
    return new Promise(function (resolve, reject) {
        xmlhttp = new XMLHttpRequest();
        xmlhttp.open("GET", endpoint, true);
        xmlhttp.onreadystatechange = function () {
            if (xmlhttp.readyState == 4) {
                if (xmlhttp.status == 200) {
                    let obj = JSON.parse(xmlhttp.responseText);
                    if (obj.result !== undefined)
                        resolve(obj.result);
                    else
                        reject(obj.error)
                } else {
                    reject(new Error("Failed to get response from endpoint:" + endpoint + ", http status =" + xmlhttp.status));
                }
            }
        }
        xmlhttp.send();
    });
}


function getDeployedContracts() {
    getJSON('/scapi?__call=getDeployedContracts').then(res => {
        res.map((address) => addDeployedContract('deployedContracts', address, address));
    });
}

// TODO: factor out REST API URL encoding

// TODO: implement error/logging

function getCtorAPI() {
    // TODO: implement
}

function createContract() {
    // TODO: implement
}


function addDeployedContract(parentId, id, content) {
    document.getElementById(parentId).innerHTML += `<div id=${id} onClick="selectContract(this.id)">${content}</div>`;
}

var selectedContract = null
var selectedAPI = null

function selectContract(id) {
    // TODO change css style on-click instead of manually coloring
    if (selectedContract !== null) {
        selectedContract.style.backgroundColor = "initial";
    }
    let newSelection = document.getElementById(id);
    if (selectedContract !== newSelection) {
        newSelection.style.backgroundColor = "green";
        selectedContract = newSelection;
        getAPI(selectedContract.innerHTML);
    } else {
        selectedContract = null;
        selectedAPI = null;
    }
}

function getAPI(contractAddress) {
    getJSON(`/scapi?__call=getAPI&__address=${contractAddress}`)
        .then(result => renderAPI(contractAddress, result));
}

function callAPIFunction(id) {
    let api_id = id.replace("_button", "");
    selectedAPI.filter(elem => elem.name === api_id)[0].callFunction(document.getElementById(api_id));
}

class APIElem {
    constructor(address, abiDesrciption) {
        this.address = address;
        this.name = abiDesrciption.name;
        this.inputs = abiDesrciption.inputs;
        this.outputs = abiDesrciption.outputs;

        this.toURLCall = function (args) {
            console.log(args);
            return `/scapi?__call=callContract&__name=${this.name}&__address=${this.address}` + this.inputs.map(elem => `&${elem.name}=${args[elem.name]}`);
        }.bind(this);

        this.callFunction = function (element) {
            getJSON(this.toURLCall(this.getAllInputs())).then(function (result) {
                // TODO:handle array return type
                this.getAllOutputs().map(output => output.value = result);
            }.bind(this));
        }.bind(this);

        this.toHTML = function () {
            let inputs = this.inputs.map(elem => `<div><input type="text" id="${this.name}_in_${elem.name}" value="" placeholder="${elem.name}" ></div>`).join('');
            let outputs = this.outputs.map(elem => `<div><input type="text" id="${this.name}_out_${elem.name}" value=""></div>`).join('');
            return `<div class="api-elem" id="${this.name}"><div><button type="button" id="${this.name}_button" onClick="callAPIFunction(this.id)"> ${this.name}</button>:</div>` + inputs + "<div> => </div>" + outputs + "</div>";
        }.bind(this);

        this.placeholder = function () {
            return document.getElementById(this.name);
        }.bind(this);
    }
    getAllInputs() {
        let res = {};
        this.inputs.forEach(elem => { res[elem.name] = document.getElementById(`${this.name}_in_${elem.name}`).value });
        return res;
    }
    getAllOutputs() {
        return this.outputs.map(elem => document.getElementById(`${this.name}_out_${elem.name}`));
    }
}

function renderAPI(address, api) {
    selectedAPI = api.filter(elem => elem.type === "function").map(elem => new APIElem(address, elem));
    document.getElementById('callAPI').innerHTML = selectedAPI.map(elem => elem.toHTML()).join('');
}