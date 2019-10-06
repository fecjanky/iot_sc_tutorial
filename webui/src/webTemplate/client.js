function getJSON(endpoint) {
    return new Promise(function (resolve, reject) {
        let xmlhttp = new XMLHttpRequest();
        xmlhttp.open("GET", endpoint, true);
        xmlhttp.onreadystatechange = function () {
            if (xmlhttp.readyState == 4) {
                if (xmlhttp.status == 200) {
                    let obj = JSON.parse(xmlhttp.responseText);
                    if (obj.result !== undefined)
                        resolve(obj.result);
                    else if (obj.error !== undefined)
                        reject(obj.error)
                    else
                        reject(new Error("Uknown error occured while getting response from: " + endpoint));
                } else {
                    reject(new Error("Failed to get response from endpoint:" + endpoint + ", http status =" + xmlhttp.status));
                }
            }
        }
        xmlhttp.send();
    });
}

function logout() {
    window.location = "logout/";
}

function logError(error) {
    let log_prefix = `${new Date().toUTCString()} > `;
    let logArea = document.getElementById("logArea");
    logArea.innerHTML += `<p>${log_prefix}${error.toString()}</p>`;
    logArea.scrollTop = logArea.scrollHeight;
}

function getJSONLogged(endpoint) {
    return getJSON(endpoint).catch(error => {
        logError(error);
        return Promise.reject(error);
    });
}

function getUserData() {
    return getJSONLogged('/scapi?__call=userData').then(res => {
        document.getElementById("user").innerHTML = `User account:${res.account}`;
        return true;
    });
}

function getDeployedContracts(keys = {}) {
    return getJSONLogged('/scapi?' + encodeToURL({ __call: "getDeployedContracts", ...getSelectedSession(), ...keys })).then(res => {
        document.getElementById('deployedContracts').innerHTML = "";
        res.map((address) => addDeployedContract('deployedContracts', address, address));
        refreshSelection();
        return true;
    });
}

function lastSession(sessions) {
    let lastSession = 0;
    let index = 0;
    for (s in sessions) {
        if (sessions[s].sessionId > lastSession) lastSession = sessions[s].sessionId;
        index++;
    }
    return { lastSession: lastSession, index: index };
}

function onSessionChanged(args) {
    clearAPI();
    getDeployedContracts(args);
}

function getAllSessions() {
    return getJSONLogged('/scapi?__call=getAllSessions').then(res => {
        let selector = document.getElementById('sessionSelector');
        selector.options.length = 0;
        selector.options.add(new Option());
        res.map(elem => selector.options.add(new Option(`Session ${elem.sessionId}`, elem.sessionId)));
        let last = lastSession(res);
        selector.options.selectedIndex = last.index;
        return true;
    });
}

function getSelectedSession() {
    let selector = document.getElementById('sessionSelector');
    let value = selector.options.selectedIndex < 0 ? "" : selector.options[selector.options.selectedIndex].value;
    return value !== "" ? { sessionId: +value } : {};
}

// TODO: factor out REST API URL encoding
// TODO: implement error/logging
// TODO: logout button
// TODO: Display user data

function getCtorAPI(args) {
    return getJSONLogged('/scapi?' + encodeToURL({ __call: "getCurrentCtorAPI", ...args })).then(addCtorAPI);
}

function addCtorAPI(ctorAPI) {
    document.getElementById('callConstructorArgs').innerHTML =
        ctorAPI.map(elem => `<input type="text" name="${elem.name}" value="" placeholder="${elem.name}">`).join('');
    return true;
}

var gDynamicDecorators = {}

var setUpDynamicDecorators = function () { };

var AddScaler = function (decorators, subject, selector) { decorators.addScaler(subject, selector) };
var AddDeScaler = function (decorators, subject, selector) { decorators.addDeScaler(subject, selector) };

function setUpDynamicDecoratorsForPowerBid() {
    let candidates = { bid_in__price: "finney" };
    Object.keys(candidates).forEach(id => addDimensionSelector(document.getElementById(id), Web3.utils.unitMap, AddScaler, candidates[id]));

    let timeBasedOutputs = ["consumptionStartTime_out_", "consumptionEndTime_out_"];
    timeBasedOutputs.forEach(elem => gDecorators.addTimeDecorator(document.getElementById(elem)));

    let descaler_candidates = { maxPrice_out_: "finney", bestPrice_out_: "finney" };

    Object.keys(descaler_candidates).forEach(id => addDimensionSelector(document.getElementById(id), Web3.utils.unitMap, AddDeScaler, descaler_candidates[id]));
}



function onLoad(args = {}) {
    getUserData().then(r => getAllSessions()).then(r => getDeployedContracts(args)).then(r => getCtorAPI(args));
    document.getElementById("logArea").innerHTML = "";
    let contractsRefreshInterval = 5 * 1000;
    setInterval(function () { getDeployedContracts(args) }, contractsRefreshInterval);

    addDimensionSelector(document.getElementById("input_value"), Web3.utils.unitMap, AddScaler, "finney");
    addDimensionSelector(document.getElementById("input_gasPrice"), Web3.utils.unitMap, AddScaler, "gwei");

    if (args.type === "PowerBid") {
        setUpDynamicDecorators = setUpDynamicDecoratorsForPowerBid;
        renderAPI = powerBidRenderer;
    }
}

function encodeToURL(obj) {
    return Object.keys(obj).map(key => `${key}=${obj[key]}`).join('&');
}

function createContract_impl(args) {
    Array.from(document.getElementById('callConstructorArgs').children).forEach(elem => { if (elem.value !== "") args[elem.name] = elem.value; });
    let callArgs = { ...args, ...getCallOptions() };

    getJSONLogged('/scapi?' + encodeToURL(callArgs)).then(address => {
        addDeployedContract('deployedContracts', address, address);
        selectContract(address);
    });
}

function createContract() {
    let args = {
        __call: "createContract"
    };
    createContract_impl(args);
}
function createFreeStyleContract() {
    let args = {
        __call: "createContract",
        __type: "FreeStyle"
    };
    createContract_impl(args);
}

function addDeployedContract(parentId, id, content) {
    document.getElementById(parentId).innerHTML += `<div id=${id} onClick="selectContract(this.id)">${content}</div>`;
}

var selectedContract = null
var selectedAPI = null

function refreshSelection() {
    if (selectedContract !== null) {
        let newSelection = document.getElementById(selectedContract.id);
        if (newSelection !== null) {
            newSelection.style.backgroundColor = "green";
            selectedContract = newSelection;
        }
    }
}

function selectContract(id) {
    // TODO change css style on-click instead of manually coloring
    if (selectedContract !== null) {
        selectedContract.style.backgroundColor = "initial";
    }
    let newSelection = document.getElementById(id);
    if (selectedContract !== newSelection && newSelection !== null) {
        newSelection.style.backgroundColor = "green";
        selectedContract = newSelection;
        getAPI(selectedContract.innerHTML);
    } else {
        selectedContract = null;
        selectedAPI = null;
        clearAPI();
    }
}

class Decorators {
    constructor() {
        this.decorators = {}
    }
    addScaler(subject, selector) {
        this.decorators[subject.id] = function (value) {
            return (Number(value) * Number(selector.options[selector.options.selectedIndex].value)).toString();
        };
    }
    addDeScaler(subject, selector) {
        this.decorators[subject.id] = function (value) {
            return (Number(value) / Number(selector.options[selector.options.selectedIndex].value)).toString();
        };
    }

    addTimeDecorator(subject) {
        this.decorators[subject.id] = function (value) {
            let date = new Date(Number(value) * 1000);
            let str = date.toString();
            subject.size = str.length;
            return str;
        };
    }

    decorate(id, value) {
        return this.decorators[id] !== undefined ? this.decorators[id](value) : value;
    }
}

var gDecorators = new Decorators();

function addDimensionSelector(subject, values, decoratorType, defaultSelection = null) {
    let selector = document.createElement("select");
    selector.id = `${subject.id}_selector`;
    let defaultIndex = 0;
    let index = 0;
    Object.keys(values).map(function (k, v) {
        let option = document.createElement("option");
        option.text = k;
        option.value = values[k];
        selector.appendChild(option);
        if (defaultSelection === k) defaultIndex = index;
        index++;
    }.bind(this));
    selector.options.selectedIndex = defaultIndex;
    subject.parentElement.appendChild(selector);
    decoratorType(gDecorators, subject, selector);
    //gDecorators.addScaler(subject, selector);
}



function getCallOptions() {
    let res = {};
    Array.from(document.getElementById('callOptions').children).forEach(elem => {
        Array.from(elem.children).filter(elem => elem.tagName === "INPUT").forEach(elem => {
            if (elem.value !== "" && elem.value !== undefined)
                res[elem.name] = gDecorators.decorate(elem.id, elem.value);
        });
    });
    return res;
}

function getAPI(contractAddress) {
    getJSONLogged(`/scapi?__call=getAPI&__address=${contractAddress}`)
        .then(result => renderAPI(contractAddress, result));
}

function clearAPI() {
    document.getElementById('callAPI').innerHTML = "";
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
            getJSONLogged(this.toURLCall(this.getAllInputs())).then(function (result) {
                // TODO:handle array return type
                this.getAllOutputs().map(output => {
                    output.value = gDecorators.decorate(output.id, result);
                });
            }.bind(this));
        }.bind(this);

        this.toHTML = function () {
            let inputs = this.inputs.map(elem => `<div><input type="text" id="${this.name}_in_${elem.name}" value="" placeholder="${elem.name}" ></div>`).join('');
            let outputs = this.outputs.map(elem => `<div><input type="text" id="${this.name}_out_${elem.name}" value=""></div>`).join('');
            return `<div class="horizontal-layout" id="${this.name}"><div><button type="button" id="${this.name}_button" onClick="callAPIFunction(this.id)"> ${this.name}</button>:</div>` + inputs + "<div> => </div>" + outputs + "</div>";
        }.bind(this);

        this.placeholder = function () {
            return document.getElementById(this.name);
        }.bind(this);
    }
    getAllInputs() {
        let res = {};
        this.inputs.forEach(elem => { res[elem.name] = gDecorators.decorate(`${this.name}_in_${elem.name}`, document.getElementById(`${this.name}_in_${elem.name}`).value); });
        return res;
    }
    getAllOutputs() {
        return this.outputs.map(elem => document.getElementById(`${this.name}_out_${elem.name}`));
    }
}


function defaultRenderer(address, api) {
    selectedAPI = api.filter(elem => elem.type === "function").map(elem => new APIElem(address, elem));
    document.getElementById('callAPI').innerHTML = selectedAPI.map(elem => elem.toHTML()).join('');
    setUpDynamicDecorators();
}

function powerBidRenderer(address, api) {
    selectedAPI = [];
    let grouping = {
        "Auction Phase": ["consumer", "maxPrice", "requiredNRG", "bestSupplier", "bestPrice", "auction_time_left", "bid", "auctionEnd"],
        "Consume Phase": ["consumptionStartTime", "consumptionEndTime", "consumePower"],
        "Finish Phase": ["withdraw", "withdraw_gain"]
    };
    let renderPhase = function (phaseName, functions) {
        let holder = document.createElement("div");
        holder.className = "horizontal-layout";
        let APIElemsHolder = document.createElement("div");
        APIElemsHolder.className = "vertical-layout";
        let PhaseControlHolder = document.createElement("div");
        PhaseControlHolder.className = "vertical-layout";
        //
        let apiElems = functions.map(f => {
            let apiFunction = api.find(elem => elem.name === f && elem.type === "function");
            if (apiFunction !== undefined) {
                return new APIElem(address, apiFunction);
            }
            return undefined;
        });
        APIElemsHolder.innerHTML = apiElems.map(elem => elem.toHTML()).join('');
        selectedAPI.push(...apiElems);
        PhaseControlHolder.innerHTML = "Phase control goes here...";
        //
        holder.appendChild(APIElemsHolder);
        holder.appendChild(PhaseControlHolder);
        return holder;
    };
    Object.keys(grouping).forEach(key => {
        let callAPI = document.getElementById('callAPI');
        callAPI.appendChild(renderPhase(key, grouping[key]));
    });
    setUpDynamicDecorators();
}

let renderAPI = defaultRenderer;




function fileChanged(input) {
}

function upload() {
    document.getElementById('uploadSuccess').style.visibility = "hidden";
    let contract = document.getElementById("smartContractFile").files[0];
    let req = new XMLHttpRequest();
    let formData = new FormData();
    formData.append("contract", contract);
    req.open("POST", '/upload');
    req.onreadystatechange = function () {
        if (req.readyState == 4) {
            if (req.status == 200) {
                let obj = JSON.parse(req.responseText);
                if (obj.result !== undefined) {
                    document.getElementById('uploadSuccess').style.visibility = "visible";
                    getCtorAPI({ type: "FreeStyle" });
                }
                else
                    logError(obj.error)
            } else {
                logError("Failed to get response from upload, http status =" + req.status);
            }
        }
    }
    req.send(formData);
}