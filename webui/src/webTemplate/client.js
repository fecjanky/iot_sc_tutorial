function getJSON(endpoint, statusLocation = null) {
    return new Promise(function (resolve, reject) {
        let xmlhttp = new XMLHttpRequest();
        xmlhttp.open("GET", endpoint, true);
        xmlhttp.onreadystatechange = function () {
            if (xmlhttp.readyState == 4) {
                if (xmlhttp.status == 200) {
                    let obj = JSON.parse(xmlhttp.responseText);
                    if (obj.result !== undefined) {
                        if (statusLocation !== null && statusLocation !== undefined) {
                            clearAllChildren(statusLocation);
                            statusLocation.appendChild(images.success.cloneNode());
                        }
                        resolve(obj.result);
                        return;
                    }
                    else if (obj.error !== undefined) { reject(obj.error) }
                    else { reject(new Error("Uknown error occured while getting response from: " + endpoint)); }
                } else {
                    reject(new Error("Failed to get response from endpoint:" + endpoint + ", http status =" + xmlhttp.status));
                }
                if (statusLocation !== null && statusLocation !== undefined) {
                    clearAllChildren(statusLocation);
                    statusLocation.appendChild(images.failure.cloneNode());
                }
            }
        }
        if (statusLocation) {
            clearAllChildren(statusLocation);
            statusLocation.appendChild(images.loading.cloneNode());
        }
        xmlhttp.send();
    });
}

function clearAllChildren(node) {
    if (node === null || node === undefined) return;
    while (node.firstChild) {
        node.removeChild(node.firstChild);
    }
}

function logout() {
    window.location = "logout/";
}

function createLogger(style) {
    let bloomFilter = function (key, value) {
        // Filtering out properties
        if (key === 'logsBloom') {
            return undefined;
        }
        return value;
    }
    return function (result) {
        let log_prefix = `${new Date().toUTCString()} > `;
        let logArea = document.getElementById("logArea");
        logArea.innerHTML += `<p><pre class="${style}" id="json">${log_prefix}${JSON.stringify(result, bloomFilter, 2)}</pre></p>`;
        logArea.scrollTop = logArea.scrollHeight;
    };
}

let logError = createLogger("errorLog");
let logSuccess = createLogger("successLog");

function getJSONLogged(endpoint, statusLocation = null) {
    return getJSON(endpoint, statusLocation)
        .then(result => {
            logSuccess(result);
            return Promise.resolve(result);
        })
        .catch(error => {
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

function getDeployedContracts(keys = {}, getFunction = getJSONLogged) {
    return getFunction('/scapi?' + encodeToURL({ __call: "getDeployedContracts", ...getSelectedSession(), ...keys })).then(res => {
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
        ctorAPI.map(elem => `<div class="button">${elem.name}</div><input type="text" name="${elem.name}" value="" placeholder="${elem.name}">`).join('');
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


class PreloadedImages {
    constructor() {
        this.loading = new Image(18, 18);
        this.success = new Image(24, 24);
        this.failure = new Image(18, 18);
        this.loading.src = "images/ajax-loader.gif";
        this.success.src = "images/icons8-tick-box-48.png";
        this.failure.src = "images/x-mark-3-48.png";
    }
}

let images = new PreloadedImages();

function onLoad(args = {}) {
    getUserData().then(r => getAllSessions()).then(r => getDeployedContracts(args)).then(r => getCtorAPI(args));
    document.getElementById("logArea").innerHTML = "";
    let contractsRefreshInterval = 11 * 1000;
    setInterval(function () { getDeployedContracts(args, getJSON) }, contractsRefreshInterval);

    addDimensionSelector(document.getElementById("input_value"), Web3.utils.unitMap, AddScaler, "finney");
    addDimensionSelector(document.getElementById("input_gasPrice"), Web3.utils.unitMap, AddScaler, "gwei");

    if (args.type === "PowerBid") {
        setUpDynamicDecorators = setUpDynamicDecoratorsForPowerBid;
        renderAPI = powerBidRenderer;
        let auction_time_left_interval = 7 * 1000;
        setInterval(function () {
            callAPIFunction("auction_time_left", true, getJSON);
        }, auction_time_left_interval);
    }
}

function encodeToURL(obj) {
    return Object.keys(obj).map(key => `${key}=${obj[key]}`).join('&');
}

function createContract_impl(args) {
    Array.from(document.getElementById('callConstructorArgs').children).forEach(elem => { if (elem.tagName === "INPUT" && elem.value !== "") args[elem.name] = elem.value; });
    let callArgs = { ...args, ...getCallOptions() };

    getJSONLogged('/scapi?' + encodeToURL(callArgs), document.getElementById("callConstructor_status")).then(address => {
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
        let newSelection = document.getElementById(selectedContract);
        if (newSelection !== null) {
            newSelection.style.backgroundColor = "green";
        }
    }
}

function selectContract(id) {
    // TODO change css style on-click instead of manually coloring
    let selection = document.getElementById(selectedContract);
    if (selection !== null) {
        selection.style.backgroundColor = "initial";
    }
    let newSelection = document.getElementById(id);
    if (selectedContract !== id && newSelection !== null) {
        newSelection.style.backgroundColor = "green";
        selectedContract = id;
        getAPI(newSelection.innerHTML);
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
    let callApiNode = document.getElementById('callAPI');
    clearAllChildren(callApiNode);
}

function callAPIFunction(id, noStatus = false, getter = getJSONLogged) {
    let api_id = id.replace("_button", "");
    if (selectedAPI !== null) {
        let apiElem = selectedAPI.find(elem => elem.name === api_id);
        if (apiElem !== undefined) {
            apiElem.callFunction(noStatus, getter);
        }
    }
}

class APIElem {
    constructor(address, abiDesrciption) {
        this.address = address;
        this.name = abiDesrciption.name;
        this.inputs = abiDesrciption.inputs;
        this.outputs = abiDesrciption.outputs;
        this.stateMutability = abiDesrciption.stateMutability;
    }

    toURLCall(args) {
        return `/scapi?__call=callContract&__name=${this.name}&__address=${this.address}` + this.inputs.map(elem => `&${elem.name}=${args[elem.name]}`);
    }
    callFunction(noStatus = false, getter = getJSONLogged) {
        getter(this.toURLCall(this.getAllInputs()), noStatus ? null : document.getElementById(`${this.name}_status`)).then(function (result) {
            // TODO:handle array return type
            this.getAllOutputs().map(output => {
                output.value = gDecorators.decorate(output.id, result);
            });
        }.bind(this));
    }
    toHTML() {
        let inputs = this.inputs.map(elem => `<div><input type="text" id="${this.name}_in_${elem.name}" value="" placeholder="${elem.name}" ></div>`).join('');
        if (inputs.length === 0) {
            inputs = "()";
        }
        let outputs = this.outputs.map(elem => `<div><input type="text" id="${this.name}_out_${elem.name}" value=""></div>`).join('');
        if (outputs.length === 0) {
            outputs = "()";
        }
        return `<div class="horizontal-layout" id="${this.name}"><div><button type="button" id="${this.name}_button" onClick="callAPIFunction(this.id)"> ${this.name}</button></div><div id="${this.name}_status" class="StatusSymbol"></div>` + inputs + "<div> => </div>" + outputs + "</div>";
    };

    placeholder() {
        return document.getElementById(this.name);
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
        PhaseControlHolder.classList.add("vertical-layout");
        PhaseControlHolder.classList.add("PhaseControl");

        let apiElems = functions.map(f => {
            let apiFunction = api.find(elem => elem.name === f && elem.type === "function");
            if (apiFunction !== undefined) {
                return new APIElem(address, apiFunction);
            }
            return undefined;
        });

        APIElemsHolder.innerHTML = apiElems.map(elem => elem.toHTML()).join('');
        selectedAPI.push(...apiElems);

        let PhaseControlTag = document.createElement("div");
        PhaseControlTag.innerHTML = phaseName;
        PhaseControlTag.className = "button";
        let PhaseControlGetter = document.createElement("button");
        PhaseControlGetter.innerHTML = "Refresh All";
        PhaseControlGetter.onclick = function () {
            apiElems.filter(elem => elem.stateMutability === "view").forEach(elem => elem.callFunction());
        }
        PhaseControlHolder.appendChild(PhaseControlTag);
        PhaseControlHolder.appendChild(PhaseControlGetter)
        //
        holder.appendChild(APIElemsHolder);
        holder.appendChild(PhaseControlHolder);
        return holder;
    };
    let callAPI = document.getElementById('callAPI');
    clearAPI();
    Object.keys(grouping).forEach(key => {
        callAPI.appendChild(renderPhase(key, grouping[key]));
    });
    setUpDynamicDecorators();
}

let renderAPI = defaultRenderer;




function fileChanged(input) {
}

function upload() {
    let statusLocation = document.getElementById('upload_status');
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
                    clearAllChildren(statusLocation);
                    statusLocation.appendChild(images.success.cloneNode());
                    getCtorAPI({ type: "FreeStyle" });
                    return;
                }
                else
                    logError(obj.error)
            } else {
                logError("Failed to get response from upload, http status =" + req.status);
            }
            clearAllChildren(statusLocation);
            statusLocation.appendChild(images.failure.cloneNode());
        }
    }
    clearAllChildren(statusLocation);
    statusLocation.appendChild(images.loading.cloneNode());
    req.send(formData);
}