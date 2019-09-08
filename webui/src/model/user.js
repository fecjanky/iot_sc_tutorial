let mongoose = require('mongoose');
let bcrypt = require('bcrypt');
let CryptoJS = require("crypto-js");

let UserSchema = new mongoose.Schema({
  username: {
    type: String,
    unique: true,
    required: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
  },
  password2: {
    type: String
  },
  ethaccount: String
});

//authenticate input against database
UserSchema.statics.authenticate = function (username, password, callback) {
  User.findOne({ username: username })
    .exec(function (err, user) {
      if (err) {
        return callback(err)
      } else if (!user) {
        var err = new Error('User not found.');
        err.status = 401;
        return callback(err);
      }
      bcrypt.compare(password, user.password, function (err, result) {
        if (result === true) {
          return callback(null, user);
        } else {
          return callback();
        }
      })
    });
}

//hashing a password before saving it to the database
UserSchema.pre('save', function (next) {
  var user = this;
  bcrypt.hash(user.password, 10, function (err, hash) {
    if (err) {
      return next(err);
    }
    user.password2 = CryptoJS.AES.encrypt(user.password.toString(), hash);
    user.password = hash;
    next();
  });
});


var User = mongoose.model('User', UserSchema);
module.exports.User = User;

// TODO: investigate how to increase security of stroring the password
// TODO: add access control and encryption to MongoDB
module.exports.password = function (user) {
  return CryptoJS.AES.decrypt(user.password2, user.password).toString(CryptoJS.enc.Utf8);
};