const express = require('express')
const app = express()
var path = require("path");
const port = 3000
var bodyParser = require('body-parser');
var mongoose = require('mongoose');
var session = require('express-session');
var MongoStore = require('connect-mongo')(session);


var fs = require("fs");

// var contractInstance;

//connect to MongoDB
mongoose.connect('mongodb://localhost/testForAuth', { useNewUrlParser: true, useCreateIndex: true });
var db = mongoose.connection;

//use sessions for tracking logins
app.use(session({
	secret: 'work hard',
	resave: true,
	saveUninitialized: false,
	store: new MongoStore({
		mongooseConnection: db
	})
}));

// parse incoming requests
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// serve static files from template
app.use(express.static(__dirname + '/webTemplate'));

// include routes
var routes = require('./routes/router');

app.use('/', routes);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
	var err = new Error('File Not Found');
	err.status = 404;
	next(err);
});

// error handler
// define as the last app.use callback
app.use(function (err, req, res, next) {
	res.status(err.status || 500);
	res.send(err.message);
});

app.listen(port, () => console.log(`Example app listening on http://localhost:${port}!`))



/*
app.get('/', (req, response) => {
	return response.sendFile(path.join(__dirname + '/../web/index.html'));
	    fs.readFile('../index.html',function (err, data){
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

*/

