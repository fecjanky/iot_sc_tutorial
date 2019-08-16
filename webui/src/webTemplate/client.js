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
        document.getElementById('deployedContracts').innerHTML = res;
    });
}