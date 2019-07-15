var express = require('express');
var router = express.Router();
var User = require('../model/user');

var Web3 = require("web3");
let web3 = new Web3(Web3.providers.WebsocketProvider('ws://localhost:8546'));

// GET route for reading data
router.get('/', function (req, res, next) {
  console.log("auth page")
  return res.sendFile(path.join(__dirname + '/webTemplate/index.html'));
});


router.post('/login', function (req, res, next) {
  if (req.body.login && req.body.password) {
    User.authenticate(req.body.login, req.body.password, function (error, user) {
      if (error || !user) {
        var err = new Error('Wrong login or password.');
        err.status = 401;
        return next(err);
      } else {
        web3.eth.personal.unlockAccount(user.ethaccount,req.body.password,600)
        req.session.userId = user._id;
        return res.redirect('/profile');
      }
    });
  } else {
    var err = new Error('All fields required.');
    err.status = 400;
    return next(err);
  }
});

//POST route for updating data
router.post('/register', function (req, res, next) {
  // confirm that user typed same password twice
  if (!(req.body.password === req.body.passwordConf)) {
    var err = new Error('Passwords do not match.');
    err.status = 400;
    res.send("passwords dont match");
    return next(err);
  }

  if (req.body.username &&
    req.body.password &&
    req.body.passwordConf) {

    web3.eth.personal.newAccount(req.body.password).then(function(addr){
        var userData = {
          username: req.body.username,
          password: req.body.password,
          ethaccount: addr
        }
        console.log("registered eth account" + addr)
        User.create(userData, function (error, user) {
        if (error) {
          return next(error);
        } else {
          req.session.userId = user._id;
          web3.eth.personal.unlockAccount(addr,req.body.password)
          return res.redirect('/profile');
        }
      });
    }).catch(function (error){
          var err = new Error('Web3Api error'+error);
          err.status = 400;
          return next(err);
    });
  } else {
    var err = new Error('All fields required.');
    err.status = 400;
    return next(err);
  }
})

// GET route after registering
router.get('/profile', function (req, res, next) {
  User.findById(req.session.userId)
    .exec(function (error, user) {
      if (error) {
        return next(error);
      } else {
        if (user === null) {
          var err = new Error('Not authorized! Go back!');
          err.status = 400;
          return next(err);
        } else {
          return res.send('<h1>Name: </h1>' + user.username + '<h2>Eth account: </h2>' + user.ethaccount + '<br><a type="button" href="/logout">Logout</a>')
        }
      }
    });
});

// GET for logout logout
router.get('/logout', function (req, res, next) {
  if (req.session) {
    User.findById(req.session.userId).exec(function(error,user){
      if (error) {
        return next(error);
      } else if (!(user === null)) {
        web3.eth.personal.lockAccount(user.ethaccount);
      }
    });
    // delete session object
    req.session.destroy(function (err) {
      if (err) {
        return next(err);
      } else {
        return res.redirect('/');
      }
    });
  }
});

module.exports = router;