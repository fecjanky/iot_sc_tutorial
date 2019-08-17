function getJSON(endpoint) {
    return new Promise(function (resolve, reject) {
        xmlhttp = new XMLHttpRequest();
        xmlhttp.open("GET", endpoint, true);
        xmlhttp.onreadystatechange = function () {
            if (xmlhttp.readyState == 4) {
                if (xmlhttp.status == 200) {
                    let obj = JSON.parse(xmlhttp.responseText);
                    resolve(obj);
                } else {
                    reject(new Error("Failed to get response from endpoint:" + endpoint + ", http status =" + xmlhttp.status));
                }
            }
        }
        xmlhttp.send();
    });
}


function getDeployedContracts() {
    getJSON('/scapi?call=getDeployedContracts').then(res => {
        res.map((address) => addDiv('deployedContracts', address, address));
    });
}

function addDiv(parentId, id, content) {
    document.getElementById(parentId).innerHTML += `<div id=${id} onClick="selectContract(this.id)">${content}</div>`;
}

var selectedContract = null
var selectedAPI = null

function selectContract(id) {
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
    getJSON(`/scapi?call=getAPI&address=${contractAddress}`)
        // .then(result => document.getElementById('contractAPI').innerHTML = JSON.stringify(result, null, 2));
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
            return `/scapi?call=callContract&name=${this.name}&address=${this.address}` + this.inputs.map(elem => `&${elem.name}=${args.elem.name}`);
        }.bind(this);

        this.callFunction = function (element) {
            // TODO: get args from elemenents
            getJSON(this.toURLCall({})).then(console.log);
            //return getJSON(this.toURLCall(args));
            //TODO: display results on return
        }.bind(this);

        this.toHTML = function () {
            let inputs = this.inputs.map(elem => `<div><input type="text" name="${elem.name}" value=""></div>`).join('');
            let outputs = this.outputs.map(elem => `<div><input type="text" name="${elem.name}" value=""></div>`).join('');
            return `<div class="api-elem" id="${this.name}"><div><button type="button" id="${this.name}_button" onClick="callAPIFunction(this.id)"> ${this.name}</button>:</div>` + inputs + "<div> => </div>" + outputs + "</div>";
        }.bind(this);
    }
}

function renderAPI(address, api) {
    selectedAPI = api.filter(elem => elem.type === "function").map(elem => new APIElem(address, elem));
    document.getElementById('contractAPI').innerHTML = selectedAPI.map(elem => elem.toHTML()).join('');
}