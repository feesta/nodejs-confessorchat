var express = require("express"),
    http = require("http"),
    app = express(),
    server = http.createServer(app),

    redis = require("redis"),
    db = redis.createClient(),

    gcm = require('node-gcm'),
    sender = new gcm.Sender('AIzaSyArgLI8MNgs5jovl3aIPv-uQH9jcAEyl9k'),

    attempts_limit = 8,
    //        0             1            2           3
    STATE = ["confession", "confessed", "forgiven", "forgave"],

    port = process.env.PORT || 80;

server.listen(port);

app.get("/", function (req, res) {
    // nothing here?
    //res.sendfile(__dirname + "/index.html");
    console.info("'/': req", req.query);
    res.send("confessorapp");
});

app.get("/check", function (req, res) {
    console.info("/check");
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
        check(result, user);
    });
});

function check(result, user) {
    db.zrevrange("messagequeue:" + user, "-10", "-1", "WITHSCORES", function(error, data) {
        if (error) result.send(JSON.stringify({status:"error", message:"error getting queue"}));
        else {
            console.info("message queue:", data.join(", "));
            if (data && data.length) {
                var dataList = [],
                    valueList = [];
                for (var i = 0; i < data.length; i = i + 2) {
                    dataList.push(data[i]);
                    valueList.push(data[i+1]);
                }
                db.mget(dataList, function(error, data) {
                    if (error) result.send(JSON.stringify({status:"error", message:"error getting queue"}));
                    else {
                        //result.send("data" + data);
                        var json_result = {status:"success", data:[]};
                        for (var i = 0; i < data.length; i++) {
                            var item = JSON.parse(data[i]);
                            item['state'] = STATE[valueList[i].slice(-1)];
                            json_result.data.push(item);
                        }
                        result.send(JSON.stringify(json_result));
                    }
                });
            } else {
                result.send(JSON.stringify({status:"success", data:[]}));
            }
        }
    });
}

app.get("/confess", function (req, res) {
    console.info("/confess");
    // add to queue
    if (needsParams(["user_id", "message"], req.query, res)) return;
    var regId = req.query.user_id;
    var result = res;
    addUser(regId, res)(function(user, added, res) {
        if (added) 
            console.info("addUser added", user);
        else
            console.info("user not added:", user);
        
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
            db.set("confessionhash:" + confessObj.id, JSON.stringify({
                    id:confessObj.id,
                    message:confessObj.message,
                    //user_id:confessObj.user_id,
                    date:confessObj.date}));
            db.hmset("confession:" + confessObj.id,
                     "message", confessObj.message, 
                     "user_id", confessObj.user_id, 
                     "confession_id", "confession:" + confessObj.id,
                     "status", "confessed", 
                     "attempts", "0", 
                     "forgivers", "forgivers:confession:" + confessObj.id, 
                     "date", confessObj.date);
            db.sadd("forgivers:confession:" + confessObj.id, confessObj.user_id);
            db.zadd("messagequeue:" + user, Date.now() + "0", "confessionhash:" + confessObj.id, function(err, data) {
                check(result, user);
            });
            //result.send(JSON.stringify({status:"success"}));
        });
    });
});


app.get("/removeMessage", function (req, res) {
    // update message
    // queue forgiveness
    if (needsParams(["user_id", "confess_id"], req.query, res)) return;
    var regId = req.query.user_id;
    var confess_id = req.query.confess_id;
    var result = res;
    
    console.info("query:", req.query);
    // remove from forgivers messagequeue
    console.info("removing:", "messagequeue:user_" + regId, "confessionhash:" + confess_id);
    db.zrem("messagequeue:user_" + regId, "confessionhash:" + confess_id);
    check(result, "user_" + regId);
});
app.get("/forgive", function (req, res) {
    // update message
    // queue forgiveness
    if (needsParams(["user_id", "forgiven", "confess_id"], req.query, res)) return;
    var regId = req.query.user_id;
    var confess_id = req.query.confess_id;
    var forgiven = req.query.forgiven;
    var result = res;
    
    //res.send("{status:'success'}");
    console.info("query:", req.query);
    
    if (forgiven == "true") {
        // remove confess_id from confession_queue
        db.zrem("confession_queue", "confession:" + confess_id);
        // TODO: Setting a new score reorders the forgiven message. use the old score but with a new status digit.
        db.zadd("messagequeue:user_" + regId, Date.now() + "3", "confessionhash:" + confess_id);
        // set confess_id status to 'forgiven'
        db.hset("confession:" + confess_id, "status", "forgiven");
        // add to confessors messagequeue
        db.hget("confession:" + confess_id, "user_id", function(err, data) {
            console.info("add ", confess_id, "to user:", data);
            db.zadd("messagequeue:" + data, Date.now() + "2", "confessionhash:" + confess_id);
            // send forgiveness message to device...
            db.hget("user:" + data, "regId", function(err, data) {
                sendToAndroid(data, "You have been forgiven");
            });
        });
        check(result, "user_" + regId);
    } else {
        // remove from forgivers messagequeue
        console.info("removing:", "messagequeue:user_" + regId, "confessionhash:" + confess_id);
        db.zrem("messagequeue:user_" + regId, "confessionhash:" + confess_id);
    }
    
    
    // add message to confessing user's queue.
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
                    //user_id_raw = confessObj.user_id,
                    confession_id = confessObj.confession_id,
                    status = confessObj.status,
                    attempts = confessObj.attempts,
                    forgivers = confessObj.forgiver,
                    date = confessObj.date;


                if (status === "forgiven") {
                    // send out forgiveness
                    // forgivenesses:
                } else if (status === "confessed") {
                    if (attempts > attempts_limit) {
                        // remove from queue
                        db.zrem("confession_queue", confession_id);
                    } else {
                        // send to random user
                        db.hincrby(confession_id, "attempts", 1);
                        getRandomUser(confession_id)(
                            function(confess_id, forgiver_id) {
                                console.info("random user:", forgiver_id, confess_id);
                                db.sadd("forgivers:" + confess_id, forgiver_id);
                                db.zadd("messagequeue:" + forgiver_id, Date.now() + "1", confess_id.replace("confession:", "confessionhash:"));
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
        res.send(JSON.stringify({status:"error", message:"error - missing variable"}));
        return needs;
    }
}

function addUser(regId, device, res) { return function (callback) {
    // check if in database
    // add other info like device and how to send info back.
    var user = "user_" + regId;
    db.hmset("user:" + user,
        "user_id", user,
        "device", device,
        "regId", regId,
        function(error, data) {
            db.sadd("users", user, function(error, added) {
                callback(user, added);
            });
        });
}}

function sendToUser(confesss_id, forgiver_id) {
    // send to user.
}
function sendToAndroid(regId, text) {
    var message = new gcm.Message();
    message.addData('message',text);
    message.collapseKey = 'demofoo';
    message.delayWhileIdle = true;
    message.timeToLive = 3;
    sender.send(message, [regId], 4, function (result) {
    });
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
                callback(confess_id, forgiver_id);
            }
        });
    });
}}



console.log("app started:", new Date());
