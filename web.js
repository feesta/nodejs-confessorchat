var express = require("express"),
    http = require("http");

var app = express();
var server = http.createServer(app);
//var io = require("socket.io").listen(server);

var redis = require("redis");
var db = redis.createClient();

attempts_limit = 8;


var gcm = require('node-gcm');
var sender = new gcm.Sender('AIzaSyArgLI8MNgs5jovl3aIPv-uQH9jcAEyl9k');
var registrationIds = [];

// Optional
/*
var message = new gcm.Message();
message.addData('message','default message from nodejs');
message.collapseKey = 'demofoo';
message.delayWhileIdle = true;
message.timeToLive = 3;
*/

// At least one required
//registrationIds.push('regId1');
//registrationIds.push('regId2'); 


//db.flushall();

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
    console.info("req", req.query);
    res.send("hi");
    //res.send("<h1>Confessor</h1><form action='confess' method='get'><input type='text' name='user_id' placeholder='user_id'><input type='text' name='message' placeholder='confession'><button type='submit'>Confess</button></form>");
});

app.post("/register", function (req, res) {
    console.info("/register");
    /*
    var regId = req.query.regId;
    for (var i = 0; i < registrationIds.length; i++) {
        if (registrationIds[i] === regId) {
            console.info("Already registered:", regId);
            res.send("Already registered....");
            return;
        }
    }
    registrationIds.push(regId);
    console.info('register');
    //console.info(req);
    console.info(req.query);
    //res.send("success!");
    addUser(regId, res)(function(user, added) {
        if (added) 
            console.info("addUser added", user);
        else
            console.info("user not added:", user);
    });
    */
});

/*
app.get("/fakesendtojeff", function (req, res) {
    console.info("/fakesendtojeff");
    if (req.query.message) {
        var message = new gcm.Message();
        message.addData('message',req.query.message);
        message.collapseKey = 'demofoo';
        message.delayWhileIdle = true;
        message.timeToLive = 3;
        sender.send(message, registrationIds, 4, function (result) {
            console.log(message);
            console.log(registrationIds);
            console.log(result);
        });
        res.send("Message sent using GET!");
    } else {
        res.send("<h1>Send to Jeff</h1><form action='sendtojeff' method='get'><input type='text' name='message' placeholder='message goes here'><button type='submit'>Send</button></form>");
    }
});
app.post("/sendtojeff", function (req, res) {
    console.info("/sendtojeff");
    if (req.query.message) {
        var message = new gcm.Message();
        message.addData('message',req.query.message);
        message.collapseKey = 'demofoo';
        message.delayWhileIdle = true;
        message.timeToLive = 3;
        sender.send(message, registrationIds, 4, function (result) {
            console.log(message);
            console.log(registrationIds);
            console.log(result);
        });
        res.send("Message sent using POST!");
    } else {
        res.send("<h1>Send to Jeff</h1><form action='sendtojeff' method='get'><input type='text' name='message' placeholder='message goes here'><button type='submit'>Send</button></form>");
    }
});


app.get("/send", function (req, res) {
    console.log("/send");
    sender.send(message, registrationIds, 4, function (result) {
        console.log(message);
        console.log(registrationIds);
        console.log(result);
    });
    res.send("sent: <br>" + JSON.stringify(message) + "<br>" + JSON.stringify(registrationIds));
});
*/

app.get("/check", function (req, res) {
    console.info("/check");
    check(req, res);
});
app.get("/fakecheck", function (req, res) {
    console.info("/fakecheck");
    check(req, res);
});
function check(req, res) {
    // add user if user doesn't exist
    
    var result = res;
    if (needsParams(["regId"], req.query, res)) return;
    
    //addUser(req.query.user_id, res);
    addUser(req.query.regId, res)(function(user, added, res) {
        if (added) 
            console.info("addUser added", user);
        else
            console.info("user not added:", user);
        
        // check for messages and send response.
        db.zrevrange("confessionqueue:" + user, "-10", "-1", function(error, data) {
            if (error) result.send(JSON.stringify({status:"error", message:"error getting queue"}));
            else {
                console.info("queue:", data.join(", "));
                if (data && data.length) {
                    db.mget(data, function(error, data) {
                        if (error) result.send(JSON.stringify({status:"error", message:"error getting queue"}));
                        else {
                            //result.send("data" + data);
                            var json_result = {status:"success", data:[]};
                            for (var i = 0; i < data.length; i++) {
                                json_result.data.push(JSON.parse(data[i]));
                            }
                            result.send(JSON.stringify(json_result));
                        }
                    });
                } else {
                    result.send(JSON.stringify({status:"success", data:[]}));
                }
            }
        });
    });
};


app.get("/confess", function (req, res) {
    console.info("/confess");
    confess(req, res);
});
app.get("/fakeconfess", function (req, res) {
    console.info("/fakeconfess");
    confess(req, res);
});
function confess(req, res) {
    // add to queue
    if (needsParams(["user_id", "message"], req.query, res)) return;
    var regId = req.query.user_id;
    var result = res;
    addUser(regId, res)(function(user, added, res) {
        if (added) 
            console.info("addUser added", user);
        else
            console.info("user not added:", user);
        
        //res.send("confess<br>" + JSON.stringify(req.query));
        //console.info("query:", req.query);
        
        // store message, date, user_id, forgivers (blank set)
        // create confess.id...
        var data = req.query;
        db.incr("<confess id>", function(err, obj) {
            var confessObj = {
                id: "confession_" + obj, 
                date: Date.now(),
                message: data.message,
                user_id: user
            };
            console.log("received:", data, " from ", confessObj.user_id, "id", confessObj.id, "confessionhash:" + confessObj.id);
            db.zadd("confession_queue", Date.now(), "confession:" + confessObj.id);
            db.zadd("confessions", Date.now(), "confession:" + confessObj.id);
            db.set("confessionhash:" + confessObj.id, JSON.stringify(confessObj));
            db.hmset("confession:" + confessObj.id,
                     "message", confessObj.message, 
                     "user_id", confessObj.user_id, 
                     "confession_id", "confession:" + confessObj.id,
                     "status", "confessed", 
                     "attempts", "0", 
                     "forgivers", "forgivers:confession:" + confessObj.id, 
                     "date", confessObj.date);
            db.sadd("forgivers:confession:" + confessObj.id, confessObj.user_id);
            result.send(JSON.stringify({status:"success"}));
    
            // this is handled by the message queue cronjob
            //getRandomUser(confessObj);
        });
    });
}


app.get("/forgive", function (req, res) {
    // update message
    // queue forgiveness
    if (needsParams(["user_id", "forgiven", "confess_id"], req.query, res)) return;
    
    res.send("forgive<br>" + JSON.stringify(req.query));
    console.info("query:", req.query);
    var confess_id = req.query.confess_id;
    
    // remove confess_id from confession_queue
    db.srem("confession_queue", "confession:" + confess_id);
    
    // set confess_id status to 'forgiven'
    db.hset("confession:" + confess_id, "status", "forgiven");
});

app.get("/processQueue", function (req, res) {
    console.info("processing the queue");
    
    // get messages that need to be sent out
    //  - confessions that haven't been forgiven
    //  - forgivenesses that haven't been sent
    
    db.zrange("confession_queue", 0, -1, function(err, obj) {
        res.send("processing the queue: " + JSON.stringify(obj));
        //console.info(obj);
        
        for (var i = 0; i < obj.length; i++) {
            var confess_id = obj[i];
            // get keys and vals to makes sure the keys and vals match up.
            db.hgetall(confess_id, function(err, confessObj) {
                //console.info(JSON.stringify(confessObj));
                var message = confessObj.message,
                    user_id_raw = confessObj.user_id,
                    confession_id = confessObj.confession_id,
                    status = confessObj.status,
                    attempts = confessObj.attempts,
                    forgivers = confessObj.forgiver,
                    date = confessObj.date;


                if (status === "forgiven") {
                    // send out forgiveness
                    // forgivenesses:
                } else if (status === "confessed") {
                    //console.info(attempts, attempts_limit, JSON.stringify(confessObj));
                    if (attempts > attempts_limit) {
                        // remove from queue
                        db.zrem("confession_queue", confession_id);
                        //console.info("too many attempts (", attempts, ") so removing:", confession_id);
                    } else {
                        // send to random user
                        db.hincrby(confession_id, "attempts", 1);
                        //sendToUser(user_id_raw, message);
                        //console.info("increasing attempts:", confession_id, attempts);
                        getRandomUser(confession_id)(
                            function(confess_id, forgiver_id) {
                                console.info("random user:", forgiver_id, confess_id);
                                db.sadd("forgivers:" + confess_id, forgiver_id);
                                db.zadd("confessionqueue:" + forgiver_id, Date.now(), confess_id.replace("confession:", "confessionhash:"));
                                sendToUser(confess_id, forgiver_id);
                            }
                        );
                    }
                } else {
                    console.info("other in queue:", confessObj);
                }
            });
        }
    });
});

app.get("/flushdb", function (req, res) {
    db.flushall();
    console.info("flushing the database");
    res.send("flushing the database");
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

function addUser(user_id, device, res) { return function (callback) {
    // check if in database
    // add other info like device and how to send info back.
    var user = "user_" + user_id;
    db.hmset(user,
        "user_id", user,
        "device", device,
        "regId", user_id,
        function(error, data) {
            db.sadd("users", user, function(error, added) {
                //console.info("sadd rows:", added);
                 
                callback(user, added);
                //if (added === 0) checkMessages(user, res);
                //else res.send("no messages for " + user);
            });
        });
}}

function checkMessages(user, res) {
    // check for messages and send JSON with messages.
    res.send("messages");
    // mark messages as received (forgivenesses and confessions)
}

function sendToUser(confesss_id, forgiver_id) {
}
function sendToAndroid(regId, text) {
    var message = new gcm.Message();
    message.addData('message',text);
    message.collapseKey = 'demofoo';
    message.delayWhileIdle = true;
    message.timeToLive = 3;
    sender.send(message, [regId], 4, function (result) {
        //console.log(message);
        //console.log(registrationIds);
        //console.log(result);
    });
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
            getRandomUser(confessObj)(
                function(confess_id, forgiver_id) {
                    console.info("random user:", forgiver_id);
                }
            );
        });
    }
}
function client_forgives(data, socket) { 
    //console.info("someone forgives", data, "by user", socket.id);
    console.info("forgive", data.confessObj.user_id);
    sendTo(data.confessObj.user_id, {message:"You have been forgiven."})
}

function getRandomUser(confess_id, tries) { return function(callback) {
    // find random user and send message asking forgiveness...
    var count = tries || 0;
    db.srandmember("users", function(err, obj) {
        var forgiver_id = obj;
        //console.info("forgiver:", obj);
        db.sismember("forgivers:" + confess_id, obj, function(err, obj) {
            if (obj === 1) {
                // user has already seen this message.
                count ++;
                //console.info("pick another user:", forgiver_id, "for", confess_id, "in", count, "tries");
                if (count < 10)
                    getRandomUser(confess_id, count)(callback);
                else console.info("too many tries so bailing!");
            } else {
                console.info("someone confesses...", forgiver_id, "for", confess_id, "in", count, "tries");
                // add forgive.user_id to confess.forgivers set.
                //db.sadd("forgivers:" + confess_id, forgiver_id);
                // send to the user
                //sendTo(forgiver_id, {confession:confessObj});
                callback(confess_id, forgiver_id);
            }
        });
    });
}}

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
console.log("app started:", new Date());
