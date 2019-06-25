
const express = require('express')
const app = express()
const port = 3000

var fs = require("fs");
var Web3 = require("web3");

var abi = require("./ballot.json")

let web3 = new Web3(Web3.providers.WebsocketProvider('ws://localhost:8546'));
var contractInstance;

app.get('/', (req, response) => {
	    fs.readFile('index.html',function (err, data){
		            response.writeHead(200, {'Content-Type': 'text/html','Content-Length':data.length});
		            response.write(data);
		            response.end();
		        });
})

function sendJSON(response,obj){
	response.writeHead(200, {"Content-Type": "application/json"});
	response.end(JSON.stringify(obj));
}


app.get('/accounts',(req,res) => {
	web3.eth.getAccounts().then((accounts) => sendJSON(res,accounts));
});

app.get('/setContract',(req,res) => {

	if(req.query.contractAddress != undefined && web3.utils.isAddress(req.query.contractAddress)){
		contractInstance = new web3.eth.Contract(abi,req.query.contractAddress);
		console.log(`Active contract set to ${req.query.contractAddress}`)
		sendJSON(res,{"activeContract":req.query.contractAddress})
	}else{
		contractInstance = null;
		console.log("Active contract set to None")
		sendJSON(res,{"activeContract":"None"})
	}
});


app.get('/getWinner',(req,res) =>{
	contractInstance.methods.winningProposal().call()
	.then( response => sendJSON(res,{winner:response}))
	.catch(error => console.log(error))
});

app.listen(port, () => console.log(`Example app listening on http://localhost:${port}!`))
