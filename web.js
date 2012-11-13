var express = require("express"),
    http = require("http");

var app = express();
var server = http.createServer(app);
//var io = require("socket.io").listen(server);

var redis = require("redis");
var db = redis.createClient();
db.flushall();

/*
io.configure(function () { 
    io.enable('browser client minification');
    io.enable('browser client gzip');
    io.set('log level', 1);
    //io.set("transports", ["xhr-polling"]); 
    //io.set("polling duration", 10); 
});
*/

var port = process.env.PORT || 80;
server.listen(port);

app.get("/", function (req, res) {
    // nothing here?
    //res.sendfile(__dirname + "/index.html");
    res.send("<h1>Confessor</h1><form action='confess' method='get'><input type='text' name='user_id' placeholder='user_id'><input type='text' name='message' placeholder='confession'><button type='submit'>Confess</button></form>");
});


app.get("/check", function (req, res) {
    // add user if user doesn't exist
    console.info("query:", req.query);

    if (needsParams(["user_id"], req.query, res)) return;

    addUser(req.query.user_id, res);
   

    // check for messages

    //res.send("check<br>user: " + user_id);
});


app.get("/confess", function (req, res) {
    // add to queue
    if (needsParams(["user_id", "message"], req.query, res)) return;

    //res.send("confess<br>" + JSON.stringify(req.query));
    console.info("query:", req.query);

    // store message, date, user_id, forgivers (blank set)
    // create confess.id...
    var data = req.query;
    db.incr("<confess id>", function(err, obj) {
        var confessObj = {
            id: "confession_" + obj, 
            date: Date.now(),
            message: data.message,
            user_id: data.user_id
        };
        console.log("received:", data, " from ", confessObj.user_id, "id", confessObj.id);
        db.zadd("confessions", Date.now(), "confession:" + confessObj.id);
        db.hmset("confession:" + confessObj.id, "message", confessObj.message, "user_id", confessObj.user_id, "status", "0", "forgivers", "forgivers:" + confessObj.id, "date", confessObj.date);
        db.sadd("forgivers:" + confessObj.id, confessObj.user_id);
        res.send("confession received");

        // this is handled by the message queue cronjob
        //getRandomUser(confessObj);
    });
});


app.get("/forgive", function (req, res) {
    // update message
    // queue forgiveness
    if (needsParams(["user_id", "forgiven", "message_id"], req.query, res)) return;

    res.send("forgive<br>" + JSON.stringify(req.query));
    console.info("query:", req.query);
});




function needsParams(required, query, res) {
    // takes an array of param labels and the query object.
    // returns an array of missing parameters.
    // returns false when all query params are present.
    var passed = true,
        needs = [];
    for (var i = 0; i < required.length; i++) {
        var param = required[i];
        if (!query[param]) {
            passed = false;
            needs.push(param);
        }
    }
    if (passed) return false;
    else {
        res.send("failed. missing:" + needs.join(" or "));
        return needs;
    }
}

function addUser(user_id, res) {
    // check if in database
    // add other info like device and how to send info back.
    var user = "user_" + user_id;
    db.sadd("users", user, function(error, added) {
        console.info("sadd");
        console.info("rows added:", added);
        
        if (added === 0) checkMessages(user, res);
        else res.send("no messages for " + user);
    });
}
function checkMessages(user, res) {
    // check for messages and send JSON with messages.
    res.send("messages");
}






/*
io.sockets.on("connection", function (socket) {
    addUser(socket);
    socket.emit("from server", { message: "Connected to ConfessorChat." });
    sendAll({online: Object.keys(socket.manager.open).length});
    socket.on("client confesses", function(data) {
        client_confesses(data, socket);
    });
    socket.on("client forgives", function(data) {
        client_forgives(data, socket);
    });
    
    socket.on("disconnect", function(reason) {
        removeUser(reason, this);
        sendAll({online: Object.keys(socket.manager.open).length});
    });
});
*/

function sendAll(message, user) {
    /*
    for (var socket in io.sockets.sockets) {
        if (socket != user)
            sendTo(socket, message);
    }
    */
}
function sendTo(user, message) {
    /*
    if (io.sockets.sockets[user])
        io.sockets.sockets[user].emit("from server", message);
    else
        console.info("user (" + user + ") not connected: " + message);
    */
}

/*
function addUser(socket) {
    console.info("addUser", socket.id);
    db.sadd("onlineusers", socket.id);
}

function removeUser(reason, socket) {
    console.info("removeUser", reason, socket.id);
    db.srem("onlineusers", socket.id);
}
*/

function client_confesses(data, socket) {
    if (data.message) {
        // store message, date, user_id, forgivers (blank set)
        // create confess.id...
        db.incr("<confess id>", function(err, obj) {
            var confessObj = {
                id: "confession_" + obj, 
                date: Date.now(),
                message: data.message,
                user_id: socket.store.id
            };
            console.log("received:", data, " from ", socket.store.id, "id", confessObj.id);
            db.zadd("confessions", Date.now(), "confession:" + confessObj.id);
            db.hmset("confession:" + confessObj.id, "message", confessObj.message, "user_id", confessObj.user_id, "status", "0", "forgivers", "forgivers:" + confessObj.id, "date", confessObj.date);
            db.sadd("forgivers:" + confessObj.id, confessObj.user_id);
            getRandomUser(confessObj);
        });


    }
}

function client_forgives(data, socket) {
    //console.info("someone forgives", data, "by user", socket.id);
    console.info("forgive", data.confessObj.user_id);
    sendTo(data.confessObj.user_id, {message:"You have been forgiven."})
}

function getRandomUser(confessObj) {
        // find random user and send message asking forgiveness...
    db.srandmember("onlineusers", function(err, obj) {
        var forgiver_id = obj;
        db.sismember("forgivers:" + confessObj.id, obj, function(err, obj) {
            if (obj === 1) 
                getRandomUser(confessObj);
            else {
                console.info("someone confesses...", forgiver_id);
                // add forgive.user_id to confess.forgivers set.
                db.sadd("forgivers:" + confessObj.id, forgiver_id);

                sendTo(forgiver_id, {confession:confessObj});
            }
        });
    });
}

/*

app.use(function(req, res, next){
  var ua = req.headers['user-agent'];
  db.zadd('online', Date.now(), ua, next);
});

app.use(function(req, res, next){
  var min = 6 * 1000;
  var ago = Date.now() - min;
  db.zrevrangebyscore('online', '+inf', ago, function(err, users){
    if (err) return next(err);
    req.online = users;
    next();
  });
});

app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(logErrors);
app.use(clientErrorHandler);
app.use(errorHandler);


function logErrors(err, req, res, next) {
  console.error(err.stack);
  next(err);
}

function clientErrorHandler(err, req, res, next) {
  if (req.xhr) {
    res.send(500, { error: 'Something blew up!' });
  } else {
    next(err);
  }
}
function errorHandler(err, req, res, next) {
  res.status(500);
  res.render('error', { error: err });
}

app.get("/nodejs", function(req, res) {
  res.send("howdy!");
  //res.send(req.online.length + ' users online');
});

*/
console.log("app started.");
