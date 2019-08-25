let express = require('express');
let router = express.Router();
let User = require('../model/user');
let path = require('path');
let Web3 = require("web3");
let web3 = new Web3(new Web3.providers.WebsocketProvider('ws://localhost:8546'));

let SmartContractCreator = require('../smartContract/smartContract').Creator(web3, "mongodb://localhost:27017/Solidity");

function sendJSON(response, obj) {
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify(obj));
}

// GET route for reading data
router.get('/', function (req, res, next) {
  console.log("auth page")
  return res.sendFile(path.join(__dirname + '/webTemplate/index.html'));
});


router.post('/login', function (req, res, next) {
  if (req.body.login && req.body.password) {
    User.authenticate(req.body.login, req.body.password, function (error, user) {
      if (error || !user) {
        let err = new Error('Wrong login or password.');
        err.status = 401;
        return next(err);
      } else {
        web3.eth.personal.unlockAccount(user.ethaccount, req.body.password, 600)
        req.session.userId = user._id;
        return res.redirect('/profile');
      }
    });
  } else {
    let err = new Error('All fields required.');
    err.status = 400;
    return next(err);
  }
});

//POST route for updating data
router.post('/register', function (req, res, next) {
  // confirm that user typed same password twice
  if (!(req.body.password === req.body.passwordConf)) {
    let err = new Error('Passwords do not match.');
    err.status = 400;
    res.send("passwords dont match");
    return next(err);
  }

  if (req.body.username &&
    req.body.password &&
    req.body.passwordConf) {

    web3.eth.personal.newAccount(req.body.password).then(function (addr) {
      let userData = {
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
          web3.eth.personal.unlockAccount(addr, req.body.password)
          return res.redirect('/profile');
        }
      });
    }).catch(function (error) {
      let err = new Error('Web3Api error' + error);
      err.status = 400;
      return next(err);
    });
  } else {
    let err = new Error('All fields required.');
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
          let err = new Error('Not authorized! Go back!');
          err.status = 400;
          return next(err);
        } else {
          return res.sendFile(path.join(__dirname, '../webTemplate/contracts.html'));
        }
      }
    });
});

// JSON API
router.get('/scapi', function (req, res, next) {
  User.findById(req.session.userId)
    .exec(function (error, user) {
      if (error) {
        return next(error);
      } else {
        if (user === null) {
          let err = new Error('Not authorized! Go back!');
          err.status = 400;
          return next(err);
        } else if (req.query === undefined || req.query.__call === undefined) {
          console.log(req.query);
          let err = new Error('Missing parameters!');
          err.status = 400;
          return next(err);
        } else {
          console.log(req.query);
          let toCall = req.query.__call;
          delete req.query.__call;
          SmartContractCreator[toCall](user, req.query).then((result) => {
            sendJSON(res, { result: result });
          }, error => {
            console.log(error);
            sendJSON(res, { error: error.message });
          });
        }
      }
    });
});

// GET for logout logout
router.get('/logout', function (req, res, next) {
  if (req.session) {
    User.findById(req.session.userId).exec(function (error, user) {
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