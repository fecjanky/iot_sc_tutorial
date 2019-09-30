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
        return this.getAllSessions().then(sessions => {
            let currentSession = sessions.reduce(function (lhs, rhs) {
                return lhs.sessionId > rhs.sessionId ? lhs : rhs;
            });
            return currentSession;
        });
    }

    newSession(sessionId = null) {
        return Promise.all([MongoClient.connect(this.mongoDbUrl), sessionId == null ? this.currentSession() : Promise.resolve(new Session(sessionId))]).then(result => {
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
            conn.close();
            let sessions = result.filter(elem => !isNaN(elem.sessionId)).map(elem => Session.from(elem));
            if (sessions.length === 0) {
                return this.newSession(0).then(session => [session]);
            }
            return sessions;
        });
    }

};


module.exports.TrainingSession = function (mongoDbUrl) {
    return new TrainingSession(mongoDbUrl);
};