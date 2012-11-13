var express = require("express"),
    http = require("http");

var app = express();
var server = http.createServer(app);
var io = require("socket.io").listen(server);

var redis = require("redis");
var db = redis.createClient();
db.flushall();

io.configure(function () { 
    io.enable('browser client minification');
    io.enable('browser client gzip');
    io.set('log level', 1);
    //io.set("transports", ["xhr-polling"]); 
    //io.set("polling duration", 10); 
});

var port = process.env.PORT || 80;
server.listen(port);

app.get("/", function (req, res) {
    res.sendfile(__dirname + "/index.html");
});

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

function sendAll(message, user) {
    for (var socket in io.sockets.sockets) {
        if (socket != user)
            sendTo(socket, message);
    }
}
function sendTo(user, message) {
    if (io.sockets.sockets[user])
        io.sockets.sockets[user].emit("from server", message);
    else
        console.info("user (" + user + ") not connected: " + message);
}

function addUser(socket) {
    console.info("addUser", socket.id);
    db.sadd("onlineusers", socket.id);
}

function removeUser(reason, socket) {
    console.info("removeUser", reason, socket.id);
    db.srem("onlineusers", socket.id);
}

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
            console.log("received: ", data, " from ", socket.store.id, "id", confessObj.id);
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

console.log("app.js running on port 3000");
*/
