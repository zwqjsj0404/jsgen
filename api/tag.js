var union = jsGen.lib.tools.union,
    checkID = jsGen.lib.tools.checkID,
    checkTag = jsGen.lib.tools.checkTag,
    tagCache = jsGen.cache.tag;

tagCache.getP = function(tagID, callback) {
    var that = this,
        doc = this.get(tagID);
    callback = callback || jsGen.lib.tools.callbackFn;
    if (doc) {
        return callback(null, doc);
    } else jsGen.dao.tag.getTag(jsGen.dao.tag.convertID(tagID), function(err, doc) {
        if (doc) {
            doc._id = jsGen.dao.tag.convertID(doc._id);
            that.put(doc._id, doc);
        }
        return callback(err, doc);
    });
};

var cache = {
    _initTime: 0,
    _index: []
};
cache._update = function(obj) {
    var that = this;
    if (!this[obj._id]) {
        this[obj._id] = {};
        this._index.push(obj._id);
    }
    this[obj._id]._id = obj._id;
    this[obj._id].tag = obj.tag;
    this[obj._id].articles = obj.articles;
    this[obj._id].users = obj.users;
    if (!this[obj.tag.toLowerCase()]) {
        this[obj.tag.toLowerCase()] = this[obj._id];
    }
    this._index.sort(function(a, b) {
        return that[b].articles + that[b].users - that[a].articles - that[a].users;
    });
    this._initTime = Date.now();
    return this;
};
cache._remove = function(tagID) {
    var i, that = this;
    if (this[tagID]) {
        delete this[this[tagID].tag.toLowerCase()];
        delete this[tagID];
        this._index.splice(i = this._index.indexOf(tagID), i >= 0 ? 1 : 0);
        this._index.sort(function(a, b) {
            return that[b].articles + that[b].users - that[a].articles - that[a].users;
        });
        this._initTime = Date.now();
    }
    return this;
};
(function() {
    var that = this;
    jsGen.dao.tag.getTagsIndex(function(err, doc) {
        if (err) {
            throw err;
        }
        if (doc) {
            doc._id = jsGen.dao.tag.convertID(doc._id);
            that._update(doc);
        }
    });
}).call(cache);

function convertTags(_idArray) {
    var result = [];
    if (!Array.isArray(_idArray)) _idArray = [_idArray];
    if (typeof _idArray[0] === 'number') {
        _idArray = _idArray.map(function(x) {
            return jsGen.dao.tag.convertID(x);
        });
    }
    if (typeof _idArray[0] !== 'string') {
        return result;
    }
    _idArray.forEach(function(x, i) {
        if (cache[x]) {
            result.push({
                _id: cache[x]._id,
                tag: cache[x].tag
            });
        }
    });
    return result;
};

function setTag(tagObj, callback) {
    var tagID = null,
        setKey = null,
        callback = callback || jsGen.lib.tools.callbackFn;

    function setCache(doc) {
        cache._remove(doc._id);
        cache._update(doc);
        tagCache.put(doc._id, doc);
    };

    if (!tagObj || !tagObj._id) {
        return callback(null, null);
    }
    if (typeof tagObj._id === 'string') {
        tagID = tagObj._id;
        tagObj._id = jsGen.dao.tag.convertID(tagObj._id);
    } else {
        tagID = jsGen.dao.tag.convertID(tagObj._id);
    }

    if (!cache[tagID]) {
        return callback(null, null);
    }

    if (tagObj.tag) {
        setKey = 'tag';
    } else if (tagObj.articlesList) {
        setKey = 'articlesList';
    } else if (tagObj.usersList) {
        setKey = 'usersList';
    }

    if (setKey === 'tag') {
        if (tagObj.tag === cache[tagID].tag) {
            return callback(null, null);
        }
        if (cache[tagObj.tag.toLowerCase()] && cache[tagObj.tag.toLowerCase()]._id !== tagID) {
            toID = cache[tagObj.tag.toLowerCase()]._id;
            tagCache.getP(tagID, function(err, doc) {
                if (err) {
                    return callback(err, null);
                }
                doc.articlesList.reverse();
                doc.usersList.reverse();
                articlesListNext();

                function articlesListNext() {
                    var article = doc.articlesList.pop();
                    if (!article) {
                        return usersListNext();
                    }
                    setTag({
                        _id: toID,
                        articlesList: article
                    });
                    return articlesListNext();
                };

                function usersListNext() {
                    var user = doc.usersList.pop();
                    if (!user) {
                        return delTag();
                    }
                    setTag({
                        _id: toID,
                        usersList: user
                    });
                    return usersListNext();
                };

                function delTag() {
                    jsGen.dao.tag.delTag(tagObj._id, function() {
                        tagCache.remove(tagID);
                        cache._remove(tagID);
                        tagCache.getP(toID, function(err, doc) {
                            return callback(err, doc);
                        });
                    });
                };
            });
        } else {
            jsGen.dao.tag.setTag(tagObj, function(err, doc) {
                if (doc) {
                    doc._id = jsGen.dao.tag.convertID(doc._id);
                    setCache(doc);
                }
                return callback(err, doc);
            });
        }
    } else if (setKey === 'articlesList' || setKey === 'usersList') {
        tagCache.getP(tagID, function(err, doc) {
            if (err) {
                return callback(err, null);
            }
            var exist = doc[setKey].indexOf(Math.abs(tagObj[setKey]));
            if ((tagObj[setKey] < 0 && exist >= 0) || (tagObj[setKey] > 0 && exist < 0)) {
                jsGen.dao.tag.setTag(tagObj, function(err, doc) {
                    if (doc) {
                        doc._id = jsGen.dao.tag.convertID(doc._id);
                        setCache(doc);
                    }
                    return callback(err, doc);
                });
            } else {
                return callback(null, null);
            }
        });
    } else {
        return callback(null, null);
    }
};

function filterTags(tagArray, callback) {
    var tags = [],
        callback = callback || jsGen.lib.tools.callbackFn;

    if (!Array.isArray(tagArray)) {
        tagArray = [tagArray];
    }
    if (tagArray.length === 0) {
        return callback(null, tags);
    }
    tagArray.reverse();
    next();

    function next() {
        var tag = tagArray.pop();
        if (!tag) {
            return callback(null, tags);
        }
        if (cache[tag]) {
            tags.push(jsGen.dao.tag.convertID(cache[tag]._id));
            return next();
        } else if (cache[tag.toLowerCase()]) {
            tags.push(jsGen.dao.tag.convertID(cache[tag.toLowerCase()]._id));
            return next();
        } else {
            jsGen.dao.tag.setNewTag({
                tag: tag
            }, function(err, doc) {
                if (doc) {
                    tags.push(doc._id);
                    doc._id = jsGen.dao.tag.convertID(doc._id);
                    cache._update(doc);
                }
                return next();
            });
        }
    };
};

function getTag(req, res, dm) {
    var tag = req.path[2];
    var _id = null,
        body = {};

    if (!checkID(tag, 'T')) {
        throw jsGen.Err(jsGen.lib.msg.tagNone);
    }
    if (cache[tag]) {
        _id = jsGen.dao.tag.convertID(cache[tag]._id);
    } else if (cache[tag.toLowerCase()]) {
        _id = jsGen.dao.tag.convertID(cache[tag.toLowerCase()]._id);
    } else {
        body.err = jsGen.lib.msg.tagNone;
        return res.sendjson(body);
    }
    tagCache.getP(_id, function(err, doc) {
        jsGen.dao.db.close();
        if (err) {
            body.err = jsGen.lib.msg.dbErr;
        } else {
            body = doc;
        }
        return res.sendjson(body);
    });
};

function getTags(req, res, dm) {
    var idArray = [],
        body = {};
    if (req.apibody && req.apibody.idArray && req.apibody.idArray.length >= 1) {
        for (var i = req.apibody.idArray.length - 1; i >= 0; i--) {
            if (cache[req.apibody.idArray[i]]) {
                idArray.push(req.apibody.idArray[i]);
            }
        };
    } else {
        body.idArray = cache._index;
        idArray = body.idArray;
    }
    body.data = idArray.slice(0, 50).map(function(tag) {
        return cache[tag];
    });
    return res.sendjson(cache);
};

function editTags(req, res, dm) {
    var body = {};
    body.data = [];
    if (req.session.role === 'admin') {
        if (Array.isArray(req.apibody)) {
            req.apibody.forEach(function(tag, i, array) {
                setTag(tag, function(err, doc) {
                    if (err) {
                        body.err = err;
                    }
                    if (doc) {
                        body.data.push(doc);
                    }
                    if (body.err || i >= array.length - 1) {
                        jsGen.dao.db.close();
                        return res.sendjson(body);
                    }
                });
            });
        }
    } else {
        body.err = jsGen.lib.msg.userRoleErr;
        return res.sendjson(body);
    }
};

function delTag(req, res, dm) {
    var tag = req.path[2];
    var _id = null,
        body = {};

    if (req.session.role === 'admin') {
        if (cache[tag]) {
            _id = jsGen.dao.tag.convertID(cache[tag]._id);
        } else if (cache[tag.toLowerCase()]) {
            _id = jsGen.dao.tag.convertID(cache[tag.toLowerCase()]._id);
        } else {
            body.err = jsGen.lib.msg.tagNone;
            return res.sendjson(body);
        }
        jsGen.dao.tag.delTag(_id, function(err, doc) {
            jsGen.dao.db.close();
            if (err) {
                body.err = jsGen.lib.msg.dbErr;
            } else {
                body = doc;
            }
            return res.sendjson(body);
        });
    } else {
        body.err = jsGen.lib.msg.userRoleErr;
        return res.sendjson(body);
    }
};

function delTags(req, res, dm) {
    var body = {};

    if (req.session.role === 'admin') {
        if (Array.isArray(req.apibody)) {
            req.apibody.forEach(function(tag, i) {
                var _id = null;
                if (cache[tag]) {
                    _id = jsGen.dao.tag.convertID(cache[tag]._id);
                } else if (cache[tag.toLowerCase()]) {
                    _id = jsGen.dao.tag.convertID(cache[tag.toLowerCase()]._id);
                } else {
                    body.err = jsGen.lib.msg.tagNone;
                    return res.sendjson(body);
                }
                jsGen.dao.tag.delTag(_id, function(err, doc) {
                    body.data = i + 1;
                    if (i = req.apibody.length - 1) {
                        jsGen.dao.db.close();
                        return res.sendjson(body);
                    }
                    if (err) {
                        jsGen.dao.db.close();
                        body.err = jsGen.lib.msg.dbErr;
                        return res.sendjson(body);
                    }
                });
            });
        }
    } else {
        body.err = jsGen.lib.msg.userRoleErr;
        return res.sendjson(body);
    }
};

function getFn(req, res, dm) {
    switch (req.path[2]) {
        case undefined:
        case 'index':
            return getTags(req, res, dm);
        default:
            return getTag(req, res, dm);
    }
};

function postFn(req, res, dm) {
    switch (req.path[2]) {
        case undefined:
        case 'index':
            return getTags(req, res, dm);
        case 'admin':
            return editTags(req, res, dm);
        default:
            return res.r404();
    }
};

function deleteFn(req, res, dm) {
    switch (req.path[2]) {
        case undefined:
        case 'index':
        case 'admin':
            return delTags(req, res, dm);
        default:
            return delTag(req, res, dm);
    }
};

module.exports = {
    GET: getFn,
    POST: postFn,
    DELETE: deleteFn,
    filterTags: filterTags,
    setTag: setTag,
    cache: cache,
    convertTags: convertTags
};
