const express = require('express')
const app = express()
let path = require("path");
const listen_addr = "0.0.0.0";
const listen_port = 3000;
let bodyParser = require('body-parser');
let mongoose = require('mongoose');
let session = require('express-session');
let MongoStore = require('connect-mongo')(session);
let fs = require("fs");

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

app.listen(listen_port, listen_addr, () => console.log(`Example app listening on http://${listen_addr}:${listen_port}!`))


