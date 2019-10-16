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
        let resultText = JSON.stringify(result, bloomFilter, 2);
        resultText = resultText.replace(/\\n/g, '<br>');
        resultText = resultText.replace(/\\"/g, '"');
        logArea.innerHTML += `<p><pre class="${style}" id="json">${log_prefix}${resultText}</pre></p>`;
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

function getJSONErrorLogged(endpoint, statusLocation = null) {
    return getJSON(endpoint, statusLocation)
        .catch(error => {
            logError(error);
            return Promise.reject(error);
        });
}

function getBalance() {
    return getJSONErrorLogged('/scapi?__call=getBalance', document.getElementById("balance_status")).then(res => {
        let balanceNode = document.getElementById("balance");
        balanceNode.innerHTML = gDecorators.decorate(balanceNode.id, res);
    });
}


function getUser() {
    return document.getElementById("account").innerHTML;
}

function getUserData() {
    return getJSONErrorLogged('/scapi?__call=userData').then(res => {
        Object.keys(res).map(key => document.getElementById(key).innerHTML = res[key]);
        return true;
    });
}

function getDeployedContracts(keys = {}, getFunction = getJSONErrorLogged) {
    return getFunction('/scapi?' + encodeToURL({ __call: "getDeployedContracts", ...getSelectedSession(), ...keys })).then(res => {
        let currentDeployed = Object.fromEntries(Array.from(document.getElementById('deployedContracts').childNodes).map(elem => [elem.id, true]));
        res.map((contract) => {
            if (!currentDeployed.hasOwnProperty(contract.address)) {
                addDeployedContract('deployedContracts', contract);
            }
        });
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
    return getJSONErrorLogged('/scapi?__call=getAllSessions').then(res => {
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
    return getJSONErrorLogged('/scapi?' + encodeToURL({ __call: "getCurrentCtorAPI", ...args })).then(addCtorAPI);
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

    let timeBasedOutputs = ["consumptionStartTime_out_0", "consumptionEndTime_out_0"];
    timeBasedOutputs.forEach(elem => gDecorators.addTimeDecorator(document.getElementById(elem)));

    let descaler_candidates = { maxPrice_out_0: "finney", bestPrice_out_0: "finney", withdrawableAmount_out_0: "finney", withdrawableGain_out_0: "finney" };

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

let autoRefreshDeployedContracts = null;
let autoRefreshAuctionClose = null;
let autoRefreshAuction = null;

function setTimersImpl(args) {
    let auction_time_left_interval = 7 * 1000;
    let contractsRefreshInterval = 11 * 1000;
    let auctionRefreshInterval = 15 * 1000;
    if (!autoRefreshDeployedContracts) {
        autoRefreshDeployedContracts = setInterval(function () { getDeployedContracts(args, getJSONErrorLogged) }, contractsRefreshInterval);
    }
    if (!autoRefreshAuctionClose && args.type === "PowerBid") {
        autoRefreshAuctionClose = setInterval(function () {
            callAPIFunction("auctionTimeLeft", true, getJSONErrorLogged);
            callAPIFunction("consumptionTimeLeft", true, getJSONErrorLogged);
        }, auction_time_left_interval);
    }
    if (!autoRefreshAuction && args.type === "PowerBid") {
        autoRefreshAuction = setInterval(function () {
            monitoredBids.refresh();
        }, auctionRefreshInterval);
    }
}

function cancelTimers() {
    clearInterval(autoRefreshDeployedContracts);
    autoRefreshDeployedContracts = null;
    clearInterval(autoRefreshAuctionClose);
    autoRefreshAuctionClose = null;
    clearInterval(autoRefreshAuction);
    autoRefreshAuction = null;
}

let setTimers = null;

function autoRefreshChanged(checkbox) {
    if (checkbox.checked && setTimers) setTimers();
    else cancelTimers();
}

function onLoad(args = {}) {
    getUserData().then(r => getAllSessions()).then(r => getDeployedContracts(args)).then(r => getCtorAPI(args));
    document.getElementById("logArea").innerHTML = "";
    document.getElementById("auto-refresh").checked = true;
    addDimensionSelector(document.getElementById("input_value"), Web3.utils.unitMap, AddScaler, "finney");
    addDimensionSelector(document.getElementById("input_gasPrice"), Web3.utils.unitMap, AddScaler, "gwei");
    addDimensionSelector(document.getElementById("balance"), Web3.utils.unitMap, AddDeScaler, "ether");
    setTimers = function () { setTimersImpl(args); };
    setTimers();
    if (args.type === "PowerBid") {
        setUpDynamicDecorators = setUpDynamicDecoratorsForPowerBid;
        renderAPI = powerBidRenderer;
    }
}

function encodeToURL(obj) {
    return Object.keys(obj).map(key => `${key}=${obj[key]}`).join('&');
}

function createContract_impl(args) {
    Array.from(document.getElementById('callConstructorArgs').children).forEach(elem => { if (elem.tagName === "INPUT" && elem.value !== "") args[elem.name] = elem.value; });
    let callArgs = { ...args, ...getCallOptions() };

    return getJSONLogged('/scapi?' + encodeToURL(callArgs), document.getElementById("callConstructor_status")).then(result => {
        addDeployedContract('deployedContracts', result);
        selectContract(result.address);
        return result;
    });
}

function createContract() {
    let args = {
        __call: "createContract"
    };
    createContract_impl(args).then(result => {
        monitoredBids.add(result.address, { owner: true });
    });
}
function createFreeStyleContract() {
    let args = {
        __call: "createContract",
        __type: "FreeStyle"
    };
    createContract_impl(args);
}

function addDeployedContract(parentId, contract) {
    document.getElementById(parentId).innerHTML += `<div id=${contract.address} class="button buttonLike${contract.owner === getUser() ? " myContract" : ""}" onClick="selectContract(this.id)">${contract.address}</div>`;
}

var selectedContract = null
var selectedAPI = null

function refreshSelection() {
    if (selectedContract !== null) {
        let newSelection = document.getElementById(selectedContract);
        if (newSelection !== null) {
            newSelection.classList.add("selected");
        }
    }
}

function selectContract(id) {
    // TODO change css style on-click instead of manually coloring
    let selection = document.getElementById(selectedContract);
    if (selection !== null) {
        selection.classList.remove("selected");
    }
    let newSelection = document.getElementById(id);
    if (selectedContract !== id && newSelection !== null) {
        newSelection.classList.add("selected");
        selectedContract = id;
        getAPI(newSelection.innerHTML, getJSONErrorLogged);
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

function addDimensionSelector(subject, values, decoratorType, defaultSelection = null, autoNormalize = false) {
    if (subject == null) return;
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
                res[`__opt_${elem.name}`] = gDecorators.decorate(elem.id, elem.value);
        });
    });
    return res;
}

function getAPI(contractAddress, getter = getJSONLogged) {
    getter(`/scapi?__call=getAPI&__address=${contractAddress}`)
        .then(result => renderAPI(contractAddress, result));
}

function clearAPI() {
    let callApiNode = document.getElementById('callAPI');
    clearAllChildren(callApiNode);
}

function replaceContractStyle(contract, newStyle) {
    let c = document.getElementById(contract);
    let toRemove = Array.from(c.classList).filter(elem => elem.includes("Contract"));
    toRemove.map(r => c.classList.remove(r));
    c.classList.add(newStyle);
}

class MonitoredContracts {
    constructor() {
        this.monitored = [];
    }
    add(contract, opts = {}) {
        let contractObj = document.getElementById(contract);
        if (contractObj !== null && opts.owner !== true) {
            replaceContractStyle(contractObj.id, "monitoredContract");
        }
        this.monitored.push(contract)
    }

    refresh() {
        let deployedContracts = Object.fromEntries(Array.from(document.getElementById("deployedContracts").childNodes).filter(elem => elem.id !== undefined).map(elem => [elem.id, true]));
        let toRefresh = this.monitored.filter(elem => deployedContracts.hasOwnProperty(elem));

        Promise.all(toRefresh.map(contract => Promise.all(
            [Promise.resolve(contract), getJSONErrorLogged(`/scapi?__call=callContract&__name=auctionStatus&__address=${contract}`)])))
            .then(arrResults => {
                arrResults.map(elem => {
                    let [contract, arr] = elem;
                    let time_left = Number(arr["0"]);
                    let bestSupplier = arr["1"];
                    let owner = arr["2"];
                    let bestPrice = arr["3"];
                    if (time_left <= 0 && (owner !== getUser() && bestSupplier === getUser())) {
                        replaceContractStyle(contract, "wonContract");
                        this.monitored = this.monitored.filter(c => c !== contract);
                    } else if (time_left <= 0 && owner !== getUser() && bestSupplier !== getUser()) {
                        replaceContractStyle(contract, "lostContract");
                        this.monitored = this.monitored.filter(c => c !== contract);
                    } else if (time_left > 0 && owner !== getUser() && bestSupplier !== getUser()) {
                        replaceContractStyle(contract, "aboutToLoseContract");
                    } else if (time_left <= 0 && owner === getUser()) {
                        replaceContractStyle(contract, "myExpiredContract");
                        this.monitored = this.monitored.filter(c => c !== contract);
                    }
                });
            });
    }
}

let monitoredBids = new MonitoredContracts();

let onAPICallSuccess = {
    "bid": function (result) {
        monitoredBids.add(result.contract);
    }
}

function callAPIFunction(id, noStatus = false, getter = getJSONLogged) {
    let api_id = id.replace("_button", "");
    if (selectedAPI !== null) {
        let apiElem = selectedAPI.find(elem => elem.name === api_id);
        if (apiElem !== undefined) {
            apiElem.callFunction(noStatus, getter).then((result) => {
                let succCallback = onAPICallSuccess[api_id];
                if (succCallback !== undefined) {
                    succCallback(result);
                }
            });
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
        let urlParams = { __call: "callContract", __name: this.name, __address: this.address };
        return `/scapi?${encodeToURL({ ...urlParams, ...getCallOptions() })}` + this.inputs.map(elem => `&${elem.name}=${args[elem.name]}`);
    }
    callFunction(noStatus = false, getter = getJSONLogged) {
        let currentContract = selectedContract;
        return getter(this.toURLCall(this.getAllInputs()), noStatus ? null : document.getElementById(`${this.name}_status`)).then(function (result) {
            // TODO:handle array return type
            if (currentContract == selectedContract) {
                this.getAllOutputs().map((output, index) => {
                    output.value = gDecorators.decorate(output.id, this.outputs.length > 1 ? result[index] : result);
                });
            }
            return { contract: currentContract, result: result };
        }.bind(this));
    }
    toHTML() {
        let inputs = this.inputs.map(elem => `<div  class="centered" ><input type="text" id="${this.name}_in_${elem.name}" value="" placeholder="${elem.name}" ></div>`).join('');
        if (inputs.length === 0) {
            inputs = "<div class='centered'>()</div>";
        }
        let outputs = this.outputs.map((elem, index) => `<div class="centered" ><input type="text" id="${this.name}_out_${index}" value=""></div>`).join('');
        if (outputs.length === 0) {
            outputs = "<div class='centered'>()</div>";
        }
        return `<div class="horizontal-layout" id="${this.name}"><div  class="centered"><button type="button" id="${this.name}_button" class="apiButton${this.stateMutability !== "view" ? " apiButtonModifier" : ""}" onClick="callAPIFunction(this.id)"> ${this.name}</button></div><div id="${this.name}_status" class="StatusSymbol"></div>` + inputs + "<div class='centered'> => </div>" + outputs + "</div>";
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
        return this.outputs.map((elem, index) => document.getElementById(`${this.name}_out_${index}`));
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
        "Auction Phase": ["consumer", "maxPrice", "requiredNRG", "bestSupplier", "bestPrice", "auctionTimeLeft", "bid"],
        "Consume Phase": ["consumptionStartTime", "consumptionEndTime", "consumptionTimeLeft", "consumePower"],
        "Finish Phase": ["withdraw", "withdrawGain", "withdrawableAmount", "withdrawableGain"]
    };
    let renderPhase = function (phaseName, functions) {
        let holder = document.createElement("div");

        holder.classList.add("PhaseContainer");
        holder.classList.add("horizontal-layout");
        holder.classList.add("padded");

        let APIElemsHolder = document.createElement("div");
        APIElemsHolder.classList.add("vertical-layout");

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
        APIElemsHolder.innerHTML = apiElems.filter(elem => elem !== undefined).map(elem => elem.toHTML()).join('');
        selectedAPI.push(...apiElems);

        let PhaseControlTag = document.createElement("div");
        PhaseControlTag.innerHTML = phaseName;
        PhaseControlTag.classList.add("button");

        let PhaseControlGetter = document.createElement("button");
        PhaseControlGetter.innerHTML = "Refresh All";
        PhaseControlGetter.onclick = function () {
            apiElems.filter(elem => elem.stateMutability === "view").forEach(elem => elem.callFunction());
        }

        PhaseControlHolder.appendChild(PhaseControlTag);
        PhaseControlHolder.appendChild(PhaseControlGetter)

        holder.appendChild(PhaseControlHolder);
        holder.appendChild(APIElemsHolder);
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