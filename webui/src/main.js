const express = require('express')
const https = require('https');
let http = require('http');
const app = express()
let path = require("path");
let bodyParser = require('body-parser');
let mongoose = require('mongoose');
let session = require('express-session');
let MongoStore = require('connect-mongo')(session);
let fs = require("fs");
let formidableMiddleware = require('express-formidable');
let argparse = require('argparse');
let ArgumentParser = argparse.ArgumentParser;


var parser = new ArgumentParser({
	version: '0.0.1',
	addHelp: true,
	description: 'Blockchain tutorial webUI',
	formatterClass: argparse.ArgumentDefaultsHelpFormatter
});
parser.addArgument(
	['-l', '--listen'],
	{
		help: 'listen port for http',
		defaultValue: 8080
	}
);
parser.addArgument(
	['-s', '--https'],
	{
		help: 'listen port for https',
		defaultValue: 8443
	}
);
parser.addArgument(
	['-b', '--bind'],
	{
		help: 'bind address',
		defaultValue: "0.0.0.0"
	}
);
var args = parser.parseArgs();
const listen_addr = args.bind;
const listen_port = args.https;
const listen_port_http = args.listen;

let key = fs.readFileSync(path.join(__dirname, '..', 'certs', 'selfsigned.key'));
let cert = fs.readFileSync(path.join(__dirname, '..', 'certs', 'selfsigned.crt'));

var options = {
	key: key,
	cert: cert
};


//connect to MongoDB
mongoose.connect('mongodb://localhost:27018/auth', { useNewUrlParser: true, useCreateIndex: true });
let db = mongoose.connection;

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

let server = https.createServer(options, app);

server.listen(listen_port, listen_addr, () => console.log(`Example app listening on https://${listen_addr}:${listen_port}!`))

// Redirect from http port 80 to https
http.createServer(function (req, res) {
	let host = req.headers['host'].split(':')[0];
	res.writeHead(301, { "Location": `https://${host}:${listen_port}${req.url}` });
	res.end();
}).listen(listen_port_http, listen_addr, () => console.log(`HTTP server for redirect listening on http://${listen_addr}:${listen_port_http}!`));


