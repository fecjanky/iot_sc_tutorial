let MongoClient = require('mongodb').MongoClient;

class Session {
    constructor(sessionId) {
        this.sessionId = sessionId;
    }

    static from(json) {
        return Object.assign(new Session(), json);
    }

    next() {
        return new Session(this.sessionId + 1);
    }
};

class TrainingSession {

    constructor(mongoDbUrl) {
        this.mongoDbUrl = mongoDbUrl;
    }

    currentSession() {
        return MongoClient.connect(this.mongoDbUrl).then(conn => {
            let collection = conn.db("Solidity").collection("sessions");
            return Promise.all([collection.find().toArray(), Promise.resolve(conn)]);
        }).then(results => {
            let [result, conn] = results;
            console.log(result);
            if (result.length == 0) return 0;
            let currentSession = Session.from(result.filter(elem => !isNaN(elem.sessionId)).reduce(function (lhs, rhs) {
                return lhs.sessionId > rhs.sessionId ? lhs : rhs;
            }, new Session(0)));
            conn.close();
            return currentSession;
        })
    }

    newSession() {
        return Promise.all([MongoClient.connect(this.mongoDbUrl), this.currentSession()]).then(result => {
            let [conn, currSession] = result;
            let collection = conn.db("Solidity").collection("sessions");
            return Promise.all([Promise.resolve(conn), collection.insertOne(currSession.next())]);
        }).then(function (result) {
            let [conn, inserted] = result;
            conn.close();
            return this.currentSession();
        }.bind(this));
    }

    getSession(sessionId) {
        return MongoClient.connect(this.mongoDbUrl).then(conn => {
            let collection = conn.db("Solidity").collection("sessions");
            return Promise.all([collection.findOne({ sessionId: sessionId }), Promise.resolve(conn)]);
        }).then(result => {
            let session = Session.from(result);
            conn.close();
            return session;
        });
    }

    getAllSessions() {
        return MongoClient.connect(this.mongoDbUrl).then(conn => {
            let collection = conn.db("Solidity").collection("sessions");
            return Promise.all([collection.find().toArray(), conn]);
        }).then(results => {
            let [result, conn] = results;
            return result.filter(elem => !isNaN(elem.sessionId)).map(elem => Session.from(elem));
        });
    }

};


module.exports.TrainingSession = function (mongoDbUrl) {
    return new TrainingSession(mongoDbUrl);
};