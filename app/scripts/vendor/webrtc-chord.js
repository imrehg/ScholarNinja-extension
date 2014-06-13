(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        //Allow using this built library as an AMD module
        //in another project. That other project will only
        //see this AMD call, not the internal modules in
        //the closure below.
        define([], factory);
    } else {
        //Browser globals case. Just assign the
        //result to a property on the global.
        root.Chord = factory();
    }
}(this, function () {
    //almond, and your modules will be inlined here
/**
* @license almond 0.2.9 Copyright (c) 2011-2014, The Dojo Foundation All Rights Reserved.
* Available via the MIT or new BSD license.
* see: http://github.com/jrburke/almond for details
*/
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice,
        jsSuffixRegExp = /\.js$/;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
* Given a relative module name, like ./something, normalize it to
* a real name that can be mapped to a path.
* @param {String} name the relative name
* @param {String} baseName a real name that the name arg is relative
* to.
* @returns {String} normalized name
*/
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap, lastIndex,
            foundI, foundStarMap, starI, i, j, part,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that "directory" and not name of the baseName's
                //module. For instance, baseName of "one/two/three", maps to
                //"one/two/three.js", but we want the directory, "one/two" for
                //this normalization.
                baseParts = baseParts.slice(0, baseParts.length - 1);
                name = name.split('/');
                lastIndex = name.length - 1;

                // Node .js allowance:
                if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                    name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
                }

                name = baseParts.concat(name);

                //start trimDots
                for (i = 0; i < name.length; i += 1) {
                    part = name[i];
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            } else if (name.indexOf('./') === 0) {
                // No baseName, so this is ID is resolved relative
                // to baseUrl, pull off the leading dot.
                name = name.substring(2);
            }
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            return req.apply(undef, aps.call(arguments, 0).concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    /**
* Makes a name map, normalizing the name, and using a plugin
* for normalization if necessary. Grabs a ref to plugin
* too, as an optimization.
*/
    makeMap = function (name, relName) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            callbackType = typeof callback,
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (callbackType === 'undefined' || callbackType === 'function') {
            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                           hasProp(waiting, depName) ||
                           hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback ? callback.apply(defined[name], args) : undefined;

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (config.deps) {
                req(config.deps, config.callback);
            }
            if (!callback) {
                return;
            }

            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }

        return req;
    };

    /**
* Just drops the config on the floor, but returns req in case
* the config return value is used.
*/
    req.config = function (cfg) {
        return req(cfg);
    };

    /**
* Expose module registry for debugging and tooling
*/
    requirejs._defined = defined;

    define = function (name, deps, callback) {

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}());

define("lib/almond", function(){});

define('underscore',[], function() {
  return _;
});

define('cryptojs',[], function() {
  return CryptoJS;
});

define('Utils',['underscore'], function(_) {
  var Utils = {
    isNonemptyString: function(value) {
      return _.isString(value) && !_.isEmpty(value);
    },

    isValidNumber: function(number) {
      return !_.isNaN(number) && _.isNumber(number);
    },

    insert: function(list, index, item) {
      list.splice(index, 0, item);
    }
  };

  var Set = function(items, comparator) {
    var self = this;

    this._items = [];
    this._comparator = comparator;

    _.each(items, function(item) {
      self.put(item);
    });
  };

  Set.prototype = {
    put: function(item) {
      if (this.size() === 0 || !this.has(item)) {
        this._items.push(item);
      }
    },

    remove: function(item) {
      var self = this;
      this._items = _.reject(this._items, function(_item) {
        return self._comparator(_item, item);
      });
    },

    size: function() {
      return _.size(this._items);
    },

    has: function(item) {
      var self = this;
      return _.some(this._items, function(_item) {
        return self._comparator(_item, item);
      });
    },

    items: function() {
      return this._items;
    }
  };

  Utils.Set = Set;

  var Queue = function() {
    this._items = [];
  };

  Queue.prototype = {
    enqueue: function(item) {
      this._items.push(item);
    },

    dequeue: function() {
      if (_.isEmpty(this._items)) {
        return null;
      }
      return this._items.shift();
    },

    first: function() {
      if (_.isEmpty(this._items)) {
        return null;
      }
      return _.first(this._items);
    },

    last: function() {
      if (_.isEmpty(this._items)) {
        return null;
      }
      return _.last(this._items);
    },

    size: function() {
      return _.size(this._items);
    },
  };

  Utils.Queue = Queue;

  var Cache = function(capacity, cacheOutCallback) {
    this._cache = {};
    this._useHistory = [];
    this._capacity = capacity;
    this._cacheOutCallback = cacheOutCallback;
  };

  Cache.prototype = {
    get: function(key) {
      if (!_.has(this._cache, key)) {
        return null;
      }
      this._updateUseHistory(key);
      return this._cache[key];
    },

    set: function(key, item) {
      var self = this;

      this._cache[key] = item;
      this._updateUseHistory(key);
      if (_.size(this._cache) > this._capacity) {
        var keysToRemove = _.rest(this._useHistory, this._capacity);
        this._useHistory = _.first(this._useHistory, this._capacity);
        _.each(keysToRemove, function(key) {
          var item = self._cache[key];
          delete self._cache[key];
          self._cacheOutCallback(item);
        });
      }
    },

    remove: function(key) {
      if (!this.has(key)) {
        return;
      }
      this._useHistory = _.reject(this._useHistory, function(k) {
        return k === key;
      });
      delete this._cache[key];
    },

    has: function(key) {
      return _.has(this._cache, key);
    },

    keys: function() {
      return _.keys(this._cache);
    },

    _updateUseHistory: function(key) {
      this._useHistory = _.reject(this._useHistory, function(k) {
        return k === key;
      });
      this._useHistory.unshift(key);
    }
  };

  Utils.Cache = Cache;

  return Utils;
});

define('ID',['underscore', 'cryptojs', 'Utils'], function(_, CryptoJS, Utils) {
  var ID = function(bytes) {
    _.each(bytes, function(b) {
      if (_.isNaN(b) || !_.isNumber(b) || b < 0x00 || 0xff < b) {
        throw new Error("Invalid argument.");
      }
    });
    if (_.size(bytes) !== ID._BYTE_SIZE) {
      throw new Error("Invalid argument.");
    }

    this._bytes = _.last(bytes, ID._BYTE_SIZE);
  };

  ID._BYTE_SIZE = 32;

  ID.create = function(str) {
    if (!Utils.isNonemptyString(str)) {
      throw new Error("Invalid argument.");
    }

    return new ID(ID._createBytes(str));
  };

  ID._createBytes = function(str) {
    var hash = CryptoJS.SHA256(str).toString(CryptoJS.enc.Hex);
    return ID._createBytesfromHexString(hash);
  };

  ID._createBytesfromHexString = function(str) {
    if (!Utils.isNonemptyString(str)) {
      throw new Error("Invalid argument.");
    }

    return _(Math.floor(_.size(str) / 2)).times(function(i) {
      return parseInt(str.substr(i * 2, 2), 16);
    });
  };

  ID.fromHexString = function(str) {
    return new ID(ID._createBytesfromHexString(str));
  };

  ID.prototype = {
    isInInterval: function(fromId, toId) {
      if (_.isNull(fromId) || _.isNull(toId)) {
        throw new Error("Invalid arguments.");
      }

      if (fromId.equals(toId)) {
        return !this.equals(fromId);
      }

      if (fromId.compareTo(toId) < 0) {
        return (this.compareTo(fromId) > 0 && this.compareTo(toId) < 0);
      }

      var minId = new ID(_(_.size(this._bytes)).times(function() {
        return 0x00;
      }));
      var maxId = new ID(_(_.size(this._bytes)).times(function() {
        return 0xff;
      }));
      return ((!fromId.equals(maxId) && this.compareTo(fromId) > 0 && this.compareTo(maxId) <= 0) ||
              (!minId.equals(toId) && this.compareTo(minId) >= 0 && this.compareTo(toId) < 0));
    },

    addPowerOfTwo: function(powerOfTwo) {
      if (!_.isNumber(powerOfTwo)) {
        throw new Error("Invalid argument.");
      }
      if (powerOfTwo < 0 || powerOfTwo >= this.getLength()) {
        throw new Error("Power of two out of index.");
      }

      var copy = _.clone(this._bytes);
      var indexOfBytes = _.size(this._bytes) - 1 - Math.floor(powerOfTwo / 8);
      var valueToAdd = [1, 2, 4, 8, 16, 32, 64, 128][powerOfTwo % 8];
      for (var i = indexOfBytes; i >= 0; i--) {
        copy[i] += valueToAdd;
        valueToAdd = copy[i] >> 8;
        copy[i] &= 0xff;
        if (valueToAdd === 0) {
          break;
        }
      }

      return new ID(copy);
    },

    compareTo: function(id) {
      if (this.getLength() !== id.getLength()) {
        throw new Error("Invalid argument.");
      }

      var bytes = _.zip(this._bytes, id._bytes);
      for (var i = 0; i < bytes.length; i++) {
        if (bytes[i][0] < bytes[i][1]) {
          return -1;
        } else if (bytes[i][0] > bytes[i][1]) {
          return 1;
        }
      }
      return 0;
    },

    equals: function(id) {
      return this.compareTo(id) === 0;
    },

    getLength: function() {
      return _.size(this._bytes) * 8;
    },

    toHexString: function() {
      return _.map(this._bytes, function(b) {
        var str = b.toString(16);
        return b < 0x10 ? "0" + str : str;
      }).join("");
    }
  };

  return ID;
});

define('Response',['underscore', 'Utils'], function(_, Utils) {
  var Response = function(status, method, result, requestId, timestamp) {
    if (!Utils.isNonemptyString(status) ||
        !Utils.isNonemptyString(method) ||
        !_.isObject(result) || !Utils.isNonemptyString(requestId) ||
        !_.isNumber(timestamp)) {
      throw new Error("Invalid argument.");
    }

    this.status = status;
    this.method = method;
    this.result = result;
    this.requestId = requestId;
    this.timestamp = timestamp;
  };

  Response.create = function(status, result, request) {
    return new Response(status, request.method, result, request.requestId, _.now());
  };

  Response.isResponse = function(data) {
    if (!_.isObject(data)) {
      return false;
    }
    if (!Utils.isNonemptyString(data.status)) {
      return false;
    }
    return true;
  };

  Response.fromJson = function(json) {
    if (!_.isObject(json)) {
      throw new Error("Invalid argument.");
    }
    return new Response(json.status, json.method, json.result, json.requestId, json.timestamp);
  };

  Response.prototype = {
    toJson: function() {
      return {
        status: this.status,
        method: this.method,
        result: this.result,
        requestId: this.requestId,
        timestamp: this.timestamp
      };
    },
  };

  return Response;
});

define('Request',['underscore', 'cryptojs', 'Response', 'Utils'], function(_, CryptoJS, Response, Utils) {
  var Request = function(method, params, requestId, timestamp) {
    if (!Utils.isNonemptyString(method) || !_.isObject(params) ||
        !Utils.isNonemptyString(requestId) || !_.isNumber(timestamp)) {
      throw new Error("Invalid argument.");
    }

    this.method = method;
    this.params = params;
    this.requestId = requestId;
    this.timestamp = timestamp;
  };

  Request.create = function(method, params) {
    return new Request(method, params, Request._createId(), _.now());
  };

  Request._createId = function() {
    return CryptoJS.SHA256(Math.random().toString()).toString();
  };

  Request.isRequest = function(data) {
    return !Response.isResponse(data);
  };

  Request.fromJson = function(json) {
    if (!_.isObject(json)) {
      throw new Error("Invalid argument.");
    }
    return new Request(json.method, json.params, json.requestId, json.timestamp);
  };

  Request.prototype = {
    toJson: function() {
      return {
        method: this.method,
        params: this.params,
        requestId: this.requestId,
        timestamp: this.timestamp
      };
    }
  };

  return Request;
});

define('Entry',['underscore', 'ID'], function(_, ID) {
  var Entry = function(id, value) {
    if (_.isNull(id) || _.isUndefined(value)) {
      throw new Error("Invalid argument.");
    }

    this.id = id;
    this.value = value;
  };

  Entry.fromJson = function(json) {
    if (!_.isObject(json)) {
      throw new Error("invalid argument.");
    }
    return new Entry(ID.fromHexString(json.id), json.value);
  };

  Entry.prototype = {
    equals: function(entry) {
      if (!(entry instanceof Entry)) {
        return false;
      }

      return this.id.equals(entry.id) && _.isEqual(this.value, entry.value);
    },

    toJson: function() {
      return {
        id: this.id.toHexString(),
        value: this.value
      };
    }
  };

  return Entry;
});

define('Node',['underscore', 'ID', 'Request', 'Entry', 'Utils'], function(_, ID, Request, Entry, Utils) {
  var Node = function(nodeInfo, nodeFactory, connectionFactory, requestHandler, config) {
    if (!Node.isValidNodeInfo(nodeInfo)) {
      throw new Error("Invalid arguments.");
    }

    if (!Utils.isValidNumber(config.requestTimeout) ||
        config.requestTimeout < 0) {
      config.requestTimeout = 180000;
    }

    this._peerId = nodeInfo.peerId;
    this.nodeId = ID.create(nodeInfo.peerId);
    this._nodeFactory = nodeFactory;
    this._connectionFactory = connectionFactory;
    this._requestHandler = requestHandler;
    this._config = config;
  };

  Node.isValidNodeInfo = function(nodeInfo) {
    if (!_.isObject(nodeInfo)) {
      return false;
    }
    if (!Utils.isNonemptyString(nodeInfo.peerId)) {
      return false;
    }
    return true;
  };

  Node.prototype = {
    findSuccessor: function(key, callback) {
      var self = this;

      if (!(key instanceof ID)) {
        callback(null);
        return;
      }

      this._sendRequest('FIND_SUCCESSOR', {
        key: key.toHexString()
      }, {
        success: function(result) {
          var nodeInfo = result.successorNodeInfo;
          self._nodeFactory.create(nodeInfo, callback);
        },

        error: function(error) {
          callback(null, error);
        }
      });
    },

    notifyAndCopyEntries: function(potentialPredecessor, callback) {
      var self = this;

      this._sendRequest('NOTIFY_AND_COPY', {
        potentialPredecessorNodeInfo: potentialPredecessor.toNodeInfo()
      }, {
        success: function(result) {
          if (!_.isArray(result.referencesNodeInfo) || !_.isArray(result.entries)) {
            callback(null, null);
            return;
          }

          self._nodeFactory.createAll(result.referencesNodeInfo, function(references) {
            var entries = _.chain(result.entries)
              .map(function(entry) {
                try {
                  return Entry.fromJson(entry);
                } catch (e) {
                  return null;
                }
              })
              .reject(function(entry) { return _.isNull(entry); })
              .value();

            callback(references, entries);
          });
        },

        error: function(error) {
          callback(null, null, error);
        }
      });
    },

    notify: function(potentialPredecessor, callback) {
      var self = this;

      this._sendRequest('NOTIFY', {
        potentialPredecessorNodeInfo: potentialPredecessor.toNodeInfo()
      }, {
        success: function(result) {
          if (!_.isArray(result.referencesNodeInfo)) {
            callback(null);
            return;
          }

          self._nodeFactory.createAll(result.referencesNodeInfo, function(references) {
            callback(references);
          });
        },

        error: function(error) {
          callback(null, error);
        }
      });
    },

    leavesNetwork: function(predecessor) {
      var self = this;

      if (_.isNull(predecessor)) {
        throw new Error("Invalid argument.");
      }

      this._sendRequest('LEAVES_NETWORK', {
        predecessorNodeInfo: predecessor.toNodeInfo()
      });
    },

    ping: function(callback) {
      this._sendRequest('PING', {}, {
        success: function(result) {
          callback(true);
        },

        error: function(error) {
          callback(false, error);
        }
      });
    },

    insertReplicas: function(replicas) {
      this._sendRequest('INSERT_REPLICAS', {replicas: _.invoke(replicas, 'toJson')});
    },

    removeReplicas: function(sendingNodeId, replicas) {
      this._sendRequest('REMOVE_REPLICAS', {
        sendingNodeId: sendingNodeId.toHexString(),
        replicas: _.invoke(replicas, 'toJson')
      });
    },

    insertEntry: function(entry, callback) {
      this._sendRequest('INSERT_ENTRY', {
        entry: entry.toJson()
      }, {
        success: function(result) {
          callback();
        },

        error: function(error) {
          callback(error);
        }
      });
    },

    retrieveEntries: function(id, callback) {
      var self = this;

      this._sendRequest('RETRIEVE_ENTRIES', {
        id: id.toHexString()
      }, {
        success: function(result) {
          if (!_.isArray(result.entries)) {
            callback(null, new Error("Received invalid data from " + self._peerId));
            return;
          }

          var entries = _.chain(result.entries)
            .map(function(entry) {
              try {
                return Entry.fromJson(entry);
              } catch (e) {
                return null;
              }
            })
            .reject(function(entry) { return _.isNull(entry); })
            .value();
          callback(entries);
        },

        error: function(error) {
          callback(null, error);
        }
      });
    },

    removeEntry: function(entry, callback) {
      this._sendRequest('REMOVE_ENTRY', {
        entry: entry.toJson()
      }, {
        success: function(result) {
          callback();
        },

        error: function(error) {
          callback(error);
        }
      });
    },

    _sendRequest: function(method, params, callbacks) {
      var self = this;

      this._connectionFactory.create(this._peerId, function(connection, error) {
        if (error) {
          if (!_.isUndefined(callbacks)) {
            callbacks.error(error);
          }
          return;
        }

        var request = Request.create(method, params);

        if (!_.isUndefined(callbacks)) {
          var timer = setTimeout(function() {
            var callback = self._nodeFactory.deregisterCallback(request.requestId);
            if (!_.isNull(callback)) {
              callbacks.error(new Error(method + " request to " + self._peerId + " timed out."));
            }
          }, self._config.requestTimeout);

          self._nodeFactory.registerCallback(request.requestId, _.once(function(response) {
            clearTimeout(timer);

            if (response.status !== 'SUCCESS') {
              callbacks.error(new Error(response.result.message));
              return;
            }

            callbacks.success(response.result);
          }));
        }

        try {
          connection.send(request);
        } finally {
          connection.close();
        }
      });
    },

    onRequestReceived: function(request) {
      var self = this;

      this._requestHandler.handle(request, function(response) {
        self._connectionFactory.create(self._peerId, function(connection, error) {
          if (error) {
            return;
          }

          try {
            connection.send(response);
          } finally {
            connection.close();
          }
        });
      });
    },

    onResponseReceived: function(response) {
      var callback = this._nodeFactory.deregisterCallback(response.requestId);
      if (!_.isNull(callback)) {
        callback(response);
      }
    },

    disconnect: function() {
      this._connectionFactory.removeConnection(this._peerId);
    },

    getPeerId: function() {
      return this._peerId;
    },

    toNodeInfo: function() {
      return {
        nodeId: this.nodeId.toHexString(),
        peerId: this._peerId
      };
    },

    equals: function(node) {
      if (_.isNull(node)) {
        return false;
      }
      return this.nodeId.equals(node.nodeId);
    },

    toString: function() {
      return this.nodeId.toHexString() + " (" + this._peerId + ")";
    }
  };

  return Node;
});

define('peerjs',[], function() {
  return Peer;
});

define('PeerAgent',['underscore', 'peerjs', 'Utils'], function(_, Peer, Utils) {
  var PeerAgent = function(config, callbacks) {
    var self = this;

    if (!_.isObject(config.peer)) {
      config.peer = {id: undefined, options: {}};
    }
    if (!_.isObject(config.peer.options)) {
      config.peer.options = {};
    }
    if (!Utils.isValidNumber(config.connectRateLimit) ||
        config.connectRateLimit < 0) {
      config.connectRateLimit = 3000;
    }
    if (!Utils.isValidNumber(config.connectionOpenTimeout) ||
        config.connectionOpenTimeout < 0) {
      config.connectionOpenTimeout = 30000;
    }

    if (!_.isString(config.peer.id)) {
      this._peer = new Peer(config.peer.options);
    } else {
      this._peer = new Peer(config.peer.id, config.peer.options);
    }
    this._config = config;
    this._callbacks = callbacks;
    this._waitingTimer = null;
    this.connect = _.throttle(this.connect, config.connectRateLimit);

    var onPeerSetup = _.once(callbacks.onPeerSetup);

    this._peer.on('open', function(id) {
      self._peer.on('connection', function(conn) {
        callbacks.onConnection(conn.peer, conn);
      });

      self._peer.on('close', function() {
        callbacks.onPeerClosed();
      });

      onPeerSetup(id);
    });

    this._peer.on('error', function(error) {
      var match = error.message.match(/Could not connect to peer (\w+)/);
      if (match) {
        if (!self.isWaitingOpeningConnection()) {
          return;
        }

        clearTimeout(self._waitingTimer);
        self._waitingTimer = null;

        var peerId = match[1];
        callbacks.onConnectionOpened(peerId, null, error);
        return;
      }

      console.log(error);
      onPeerSetup(null, error);
    });
  };

  PeerAgent.prototype = {
    connect: function(peerId) {
      var self = this;

      var conn = this._peer.connect(peerId);
      if (!conn) {
        var error = new Error("Failed to open connection to " + peerId + ".");
        this._callbacks.onConnectionOpened(peerId, null, error);
        return;
      }

      this._waitingTimer = setTimeout(function() {
        if (!self.isWaitingOpeningConnection()) {
          return;
        }

        self._waitingTimer = null;

        var error = new Error("Opening connection to " + peerId + " timed out.");
        self._callbacks.onConnectionOpened(peerId, null, error);
      }, this._config.connectionOpenTimeout);

      conn.on('open', function() {
        if (!self.isWaitingOpeningConnection()) {
          conn.close();
          return;
        }

        clearTimeout(self._waitingTimer);
        self._waitingTimer = null;

        self._callbacks.onConnectionOpened(peerId, conn);
      });
    },

    isWaitingOpeningConnection: function() {
      return !_.isNull(this._waitingTimer);
    },

    destroy: function() {
      this._peer.destroy();
    },

    getPeerId: function() {
      return this._peer.id;
    }
  };

  return PeerAgent;
});

define('Connection',['underscore', 'Request', 'Response'], function(_, Request, Response) {
  var Connection = function(conn, callbacks) {
    var self = this;

    this._conn = conn;
    this._callbacks = callbacks;

    this._conn.on('data', function(data) {
      self._onDataReceived(data);
    });

    this._conn.on('close', function() {
      callbacks.closedByRemote(self);
    });

    this._conn.on('error', function(error) {
      console.log(error);
    });
  };

  Connection.prototype = {
    send: function(requestOrResponse, callback) {
      this._conn.send(requestOrResponse.toJson());
    },

    _onDataReceived: function(data) {
      var self = this;

      if (Response.isResponse(data)) {
        var response;
        try {
          response = Response.fromJson(data);
        } catch (e) {
          return;
        }
        this._callbacks.responseReceived(this, response);
      } else if (Request.isRequest(data)) {
        var request;
        try {
          request = Request.fromJson(data);
        } catch (e) {
          return;
        }
        this._callbacks.requestReceived(this, request);
      }
    },

    close: function() {
      this._callbacks.closedByLocal(this);
    },

    destroy: function() {
      this._conn.close();
    },

    getPeerId: function() {
      return this._conn.peer;
    },

    isAvailable: function() {
      return this._conn.open;
    }
  };

  return Connection;
});

define('ConnectionFactory',['underscore', 'PeerAgent', 'Connection', 'Utils'], function(_, PeerAgent, Connection, Utils) {
  var ConnectionFactory = function(config, nodeFactory, callback) {
    var self = this;

    var requestReceived = function(connection, request) {
      connection.close();
      nodeFactory.onRequestReceived(connection.getPeerId(), request);
    };
    var responseReceived = function(connection, response) {
      connection.close();
      nodeFactory.onResponseReceived(connection.getPeerId(), response);
    };
    var closedByRemote = function(connection) {
      self.removeConnection(connection.getPeerId());
    };
    var closedByLocal = function(connection) {
      self._connectionPool.set(connection.getPeerId(), connection);
    };
    this._peerAgent = new PeerAgent(config, {
      onPeerSetup: function(peerId, error) {
        if (error) {
          callback(null, error);
          return;
        }
        callback(self);
      },

      onConnectionOpened: function(peerId, conn, error) {
        if (error) {
          self._invokeNextCallback(peerId, null, error);
          return;
        }

        var connection = new Connection(conn, {
          requestReceived: requestReceived,
          responseReceived: responseReceived,
          closedByRemote: closedByRemote,
          closedByLocal: closedByLocal
        });

        self._invokeNextCallback(peerId, connection);
      },

      onConnection: function(peerId, conn) {
        if (self._connectionPool.has(peerId)) {
          self.removeConnection(peerId);
        }

        var connection;
        var timer = setTimeout(function() {
          connection.close();
        }, config.silentConnectionCloseTimeout);

        var clearTimerOnce = _.once(function() { clearTimeout(timer); });

        connection = new Connection(conn, {
          requestReceived: function(connection, request) {
            clearTimerOnce();
            requestReceived(connection, request);
          },
          responseReceived: function(connection, response) {
            clearTimerOnce();
            responseReceived(connection, response);
          },
          closedByRemote: closedByRemote,
          closedByLocal: closedByLocal
        });
      },

      onPeerClosed: function() {
        _.each(self._connectionPool.keys(), function(peerId) {
          self.removeConnection(peerId);
        });
      }
    });

    if (!Utils.isValidNumber(config.connectionPoolSize) ||
        config.connectionPoolSize < 0) {
      config.connectionPoolSize = 10;
    }
    if (!Utils.isValidNumber(config.connectionCloseDelay) ||
        config.connectionCloseDelay < 0) {
      config.connectionCloseDelay = 5000;
    }
    if (!Utils.isValidNumber(config.silentConnectionCloseTimeout) ||
        config.silentConnectionCloseTimeout < 0) {
      config.silentConnectionCloseTimeout = 30000;
    }
    this._connectionPool = new Utils.Cache(config.connectionPoolSize, function(connection) {
      _.delay(function() { connection.destroy(); }, config.connectionCloseDelay);
    });
    this._callbackQueue = new Utils.Queue();
  };

  ConnectionFactory.create = function(config, nodeFactory, callback) {
    var factory = new ConnectionFactory(config, nodeFactory, callback);
  };

  ConnectionFactory.prototype = {
    create: function(remotePeerId, callback) {
      var self = this;

      if (!Utils.isNonemptyString(remotePeerId)) {
        callback(null);
        return;
      }

      this._callbackQueue.enqueue({
        peerId: remotePeerId,
        callback: callback
      });

      this._createConnectionAndInvokeNextCallback();
    },

    _createConnectionAndInvokeNextCallback: function() {
      var self = this;

      var callbackInfo = this._callbackQueue.first();
      if (_.isNull(callbackInfo)) {
        return;
      }

      if (this._peerAgent.isWaitingOpeningConnection()) {
        return;
      }

      if (this._connectionPool.has(callbackInfo.peerId)) {
        var connection = this._connectionPool.get(callbackInfo.peerId);
        if (connection.isAvailable()) {
          this._invokeNextCallback(connection.getPeerId(), connection);
          return;
        }

        this.removeConnection(connection.getPeerId());
      }

      this._peerAgent.connect(callbackInfo.peerId);
    },

    _invokeNextCallback: function(peerId, connection, error) {
      var self = this;

      _.defer(function() {
        self._createConnectionAndInvokeNextCallback();
      });

      var callbackInfo = this._callbackQueue.dequeue();
      if (_.isNull(callbackInfo)) {
        console.log("Unknown situation.");
        return;
      }
      if (callbackInfo.peerId !== peerId) {
        callbackInfo.callback(null, new Error("Unknown situation."));
        return;
      }
      callbackInfo.callback(connection, error);
    },

    removeConnection: function(remotePeerId) {
      var connection = this._connectionPool.get(remotePeerId);
      if (_.isNull(connection)) {
        return;
      }
      connection.destroy();
      this._connectionPool.remove(remotePeerId);
    },

    destroy: function() {
      this._peerAgent.destroy();
    },

    getPeerId: function() {
      return this._peerAgent.getPeerId();
    }
  };

  return ConnectionFactory;
});

define('RequestHandler',['underscore', 'ID', 'Response', 'Entry', 'Utils'], function(_, ID, Response, Entry, Utils) {
  var RequestHandler = function(localNode, nodeFactory) {
    this._localNode = localNode;
    this._nodeFactory = nodeFactory;
  }

  RequestHandler.prototype = {
    handle: function(request, callback) {
      var self = this;

      switch (request.method) {
      case 'FIND_SUCCESSOR':
        if (!Utils.isNonemptyString(request.params.key)) {
          this._sendFailureResponse(request, callback);
          return;
        }

        var key = ID.fromHexString(request.params.key);
        this._localNode.findSuccessor(key, function(successor, error) {
          if (error) {
            console.log(error);
            self._sendFailureResponse(request, callback);
            return;
          }

          self._sendSuccessResponse({
            successorNodeInfo: successor.toNodeInfo()
          }, request, callback);
        });
        break;

      case 'NOTIFY_AND_COPY':
        var potentialPredecessorNodeInfo = request.params.potentialPredecessorNodeInfo;
        this._nodeFactory.create(potentialPredecessorNodeInfo, function(node, error) {
          if (error) {
            console.log(error);
            this._sendFailureResponse(request, callback);
            return;
          }

          self._localNode.notifyAndCopyEntries(node, function(references, entries) {
            if (_.isNull(references) || _.isNull(entries)) {
              self._sendFailureResponse(request, callback);
              return;
            }

            self._sendSuccessResponse({
              referencesNodeInfo: _.invoke(references, 'toNodeInfo'),
              entries: _.invoke(entries, 'toJson')
            }, request, callback);
          });
        });
        break;

      case 'NOTIFY':
        var potentialPredecessorNodeInfo = request.params.potentialPredecessorNodeInfo;
        this._nodeFactory.create(potentialPredecessorNodeInfo, function(node, error) {
          if (error) {
            console.log(error);
            self._sendFailureResponse(request, callback);
            return;
          }

          self._localNode.notify(node, function(references) {
            if (_.isNull(references)) {
              self._sendFailureResponse(request, callback);
              return;
            }

            self._sendSuccessResponse({
              referencesNodeInfo: _.invoke(references, 'toNodeInfo')
            }, request, callback);
          });
        });
        break;

      case 'PING':
        self._sendSuccessResponse({}, request, callback);
        break;

      case 'INSERT_REPLICAS':
        if (!_.isArray(request.params.replicas)) {
          return;
        }
        var replicas = _.chain(request.params.replicas)
          .map(function(replica) {
            try {
              return Entry.fromJson(replica);
            } catch (e) {
              return null;
            }
          })
          .reject(function(replica) { return _.isNull(replica); })
          .value();
        self._localNode.insertReplicas(replicas);
        break;

      case 'REMOVE_REPLICAS':
        var sendingNodeId;
        try {
            sendingNodeId = ID.fromHexString(request.params.sendingNodeId);
        } catch (e) {
          return;
        }
        if (!_.isArray(request.params.replicas)) {
          return;
        }
        var replicas = _.chain(request.params.replicas)
          .map(function(replica) {
            try {
              return Entry.fromJson(replica);
            } catch (e) {
              return null;
            }
          })
          .reject(function(replica) { return _.isNull(replica); })
          .value();
        self._localNode.removeReplicas(sendingNodeId, replicas);
        break;

      case 'INSERT_ENTRY':
        var entry;
        try {
          entry = Entry.fromJson(request.params.entry);
        } catch (e) {
          self._sendFailureResponse(request, callback);;
          return;
        }
        self._localNode.insertEntry(entry, function(inserted) {
          if (!inserted) {
            self._sendFailureResponse(request, callback);
          } else {
            self._sendSuccessResponse({}, request, callback);
          }
        });
        break;

      case 'RETRIEVE_ENTRIES':
        var id;
        try {
          id = ID.fromHexString(request.params.id);
        } catch (e) {
          self._sendFailureResponse(request, callback);
          return;
        }
        self._localNode.retrieveEntries(id, function(entries) {
          if (_.isNull(entries)) {
            self._sendFailureResponse(request, callback);
          } else {
            self._sendSuccessResponse({
              entries: _.invoke(entries, 'toJson')
            }, request, callback);
          }
        });
        break;

      case 'REMOVE_ENTRY':
        var entry;
        try {
          entry = Entry.fromJson(request.params.entry);
        } catch (e) {
          self._sendFailureResponse(request, callback);
          return;
        }
        self._localNode.removeEntry(entry, function(removed) {
          if (!removed) {
            self._sendFailureResponse(request, callback);
          } else {
            self._sendSuccessResponse({}, request, callback);
          }
        });
        break;

      case 'SHUTDOWN':
        break;

      case 'LEAVES_NETWORK':
        var predecessorNodeInfo = request.params.predecessorNodeInfo;
        this._nodeFactory.create(predecessorNodeInfo, function(predecessor, error) {
          if (error) {
            console.log(error);
            return;
          }

          self._localNode.leavesNetwork(predecessor);
        });
        break;

      default:
        this._sendFailureResponse(request, callback);
        break;
      }
    },

    _sendSuccessResponse: function(result, request, callback) {
      var self = this;

      var response;
      try {
        response = Response.create('SUCCESS', result, request);
      } catch (e){
        this._sendFailureResponse(request, callback);
        return;
      }

      callback(response);
    },

    _sendFailureResponse: function(request, callback) {
      var response;
      try {
        response = Response.create('FAILED', {}, request);
      } catch (e) {
        callback(null);
        return;
      }

      callback(response);
    }
  };

  return RequestHandler;
});

define('NodeFactory',[
  'underscore', 'Node', 'ConnectionFactory', 'RequestHandler', 'ID', 'Utils'
], function(_, Node, ConnectionFactory, RequestHandler, ID, Utils) {
  var NodeFactory = function(localNode, config) {
    var self = this;

    if (_.isNull(localNode)) {
      throw new Error("Invalid arguments.");
    }

    this._localNode = localNode;
    this._config = config;
    this._connectionFactory = null;
    this._requestHandler = new RequestHandler(localNode, this);
    this._callbacks = {};
  };

  NodeFactory.create = function(localNode, config, callback) {
    if (_.isNull(localNode)) {
      callback(null, null);
    }

    var nodeFactory = new NodeFactory(localNode, config);
    ConnectionFactory.create(config, nodeFactory, function(connectionFactory, error) {
      if (error) {
        callback(null, null, error);
        return;
      }

      nodeFactory._connectionFactory = connectionFactory;

      callback(connectionFactory.getPeerId(), nodeFactory);
    });
  };

  NodeFactory.prototype = {
    create: function(nodeInfo, callback) {
      var self = this;

      if (!Node.isValidNodeInfo(nodeInfo)) {
        callback(null, new Error("Invalid node info."));
        return;
      }

      if (this._localNode.nodeId.equals(ID.create(nodeInfo.peerId))) {
        callback(this._localNode);
        return;
      }

      var node = new Node(nodeInfo, this, this._connectionFactory, this._requestHandler, this._config);

      callback(node);
    },

    createAll: function(nodesInfo, callback) {
      var self = this;

      if (_.isEmpty(nodesInfo)) {
        callback([]);
        return;
      }
      this.create(_.first(nodesInfo), function(node, error) {
        self.createAll(_.rest(nodesInfo), function(nodes) {
          if (!error) {
            callback([node].concat(nodes));
          } else {
            console.log(error);
            callback(nodes);
          }
        });
      });
    },

    onRequestReceived: function(peerId, request) {
      this.create({peerId: peerId}, function(node, error) {
        if (error) {
          console.log(error);
          return;
        }
        node.onRequestReceived(request);
      });
    },

    onResponseReceived: function(peerId, response) {
      this.create({peerId: peerId}, function(node, error) {
        if (error) {
          console.log(error);
          return;
        }
        node.onResponseReceived(response);
      });
    },

    registerCallback: function(key, callback) {
      this._callbacks[key] = callback;
    },

    deregisterCallback: function(key) {
      if (!_.has(this._callbacks, key)) {
        return null;
      }
      var callback = this._callbacks[key];
      delete this._callbacks[key];
      return callback;
    },

    destroy: function() {
      this._connectionFactory.destroy();
    }
  };

  return NodeFactory;
});

define('EntryList',['underscore', 'ID', 'Utils'], function(_, ID, Utils) {
  var EntryList = function() {
    this._entries = {};
  };

  EntryList.prototype = {
    addAll: function(entries) {
      var self = this;

      if (_.isNull(entries)) {
        throw new Error("Invalid argument.");
      }

      _.each(entries, function(entry) {
        self.add(entry);
      });
    },

    add: function(entry) {
      if (_.isNull(entry)) {
        throw new Error("Invalid argument.");
      }

      if (_.has(this._entries, entry.id.toHexString())) {
        this._entries[entry.id.toHexString()].put(entry);
      } else {
        this._entries[entry.id.toHexString()] = new Utils.Set([entry], function(a, b) {
          return a.equals(b);
        });
      }
    },

    remove: function(entry) {
      if (_.isNull(entry)) {
        throw new Error("Invalid argument.");
      }

      if (!_.has(this._entries, entry.id.toHexString())) {
        return;
      }

      this._entries[entry.id.toHexString()].remove(entry);
      if (this._entries[entry.id.toHexString()].size() === 0) {
        delete this._entries[entry.id.toHexString()];
      }
    },

    getEntries: function(id) {
      if (_.isNull(id)) {
        throw new Error("Invalid argument.");
      }

      if (_.isUndefined(id)) {
        return this._entries;
      }

      if (_.has(this._entries, id.toHexString())) {
        return this._entries[id.toHexString()].items();
      } else {
        return [];
      }
    },

    getEntriesInInterval: function(fromId, toId) {
      if (_.isNull(fromId) || _.isNull(toId)) {
        throw new Error("Invalid argument.");
      }

      var result = [];
      _.each(this._entries, function(entries, key) {
        if (ID.fromHexString(key).isInInterval(fromId, toId)) {
          result = result.concat(entries.items());
        }
      });

      result = result.concat(this.getEntries(toId));

      return result;
    },

    removeAll: function(entries) {
      var self = this;

      if (_.isNull(entries)) {
        throw new Error("Invalid argument.");
      }

      _.each(entries, function(entry) {
        self.remove(entry);
      });
    },

    getNumberOfStoredEntries: function() {
      return _.size(this._entries);
    },

    getStatus: function() {
      return _.chain(this._entries)
        .map(function(entries, key) {
          return [
            key,
            _.map(entries, function(entry) {
              return entry.value;
            })
          ];
        })
        .object()
        .value();
    },

    toString: function() {
      var self = this;

      return "[Entries]\n" + _.chain(this._entries)
        .keys()
        .map(function(key) { return ID.fromHexString(key); })
        .sort(function(a, b) { return a.compareTo(b); })
        .map(function(id) {
          return "[" + id.toHexString() + "]\n" +
            _.map(self.getEntries(id), function(entry) {
              return JSON.stringify(entry.value);
            }).join("\n") + "\n";
        })
        .value()
        .join("\n") + "\n";
    }
  };

  return EntryList;
});

define('FingerTable',['underscore'], function(_) {
  var FingerTable = function(localId, references) {
    if (_.isNull(localId) || _.isNull(references)) {
      throw new Error("Invalid arguments.");
    }

    this._localId = localId;
    this._references = references;
    this._remoteNodes = {};
  };

  FingerTable.prototype = {
    _setEntry: function(index, node) {
      if (!_.isNumber(index) || _.isNull(node)) {
        throw new Error("Invalid arguments.");
      }
      if (index < 0 || index >= this._localId.getLength()) {
        throw new Error("Invalid index.");
      }

      this._remoteNodes[index] = node;
    },

    _getEntry: function(index) {
      if (!_.isNumber(index)) {
        throw new Error("Invalid argument.");
      }
      if (index < 0 || index >= this._localId.getLength()) {
        throw new Error("Invalid index.");
      }

      if (!_.has(this._remoteNodes, index)) {
        return null;
      }
      return this._remoteNodes[index];
    },

    _unsetEntry: function(index) {
      if (!_.isNumber(index)) {
        throw new Error("Invalid argument.");
      }
      if (index < 0 || index >= this._localId.getLength()) {
        throw new Error("Invalid index.");
      }

      var overwrittenNode = this._getEntry(index);

      delete this._remoteNodes[index];

      if (!_.isNull(overwrittenNode)) {
        this._references.disconnectIfUnreferenced(overwrittenNode);
      }
    },

    addReference: function(node) {
      if (_.isNull(node)) {
        throw new Error("Invalid argument.");
      }

      for (var i = 0; i < this._localId.getLength(); i++) {
        var startOfInterval = this._localId.addPowerOfTwo(i);
        if (!startOfInterval.isInInterval(this._localId, node.nodeId)) {
          break;
        }

        if (_.isNull(this._getEntry(i))) {
          this._setEntry(i, node);
        } else if (node.nodeId.isInInterval(this._localId, this._getEntry(i).nodeId)) {
          var oldEntry = this._getEntry(i);
          this._setEntry(i, node);
          this._references.disconnectIfUnreferenced(oldEntry);
        }
      }
    },

    getClosestPrecedingNode: function(key) {
      if (_.isNull(key)) {
        throw new Error("Invalid argument.");
      }

      var sortedKeys = _.chain(this._remoteNodes)
        .keys()
        .map(function(key) { return parseInt(key); })
        .sortBy()
        .value();
      for (var i = _.size(sortedKeys) - 1; i >= 0; i--) {
        var k = sortedKeys[i]
        if (!_.isNull(this._getEntry(k)) &&
            this._getEntry(k).nodeId.isInInterval(this._localId, key)) {
          return this._getEntry(k);
        }
      }
      return null;
    },

    removeReference: function(node) {
      var self = this;

      if (_.isNull(node)) {
        throw new Error("Invalid argument.");
      }

      var referenceForReplacement = null;
      var sortedKeys = _.chain(this._remoteNodes)
        .keys()
        .map(function (key) { return parseInt(key); })
        .sortBy()
        .value();
      for (var i = _.size(sortedKeys) - 1; i >= 0; i--) {
        var k = sortedKeys[i];
        var n = this._getEntry(k);
        if (node.equals(n)) {
          break;
        }
        if (!_.isNull(n)) {
          referenceForReplacement = n;
        }
      }

      _.each(sortedKeys, function(key) {
        if (node.equals(self._getEntry(key))) {
          if (_.isNull(referenceForReplacement)) {
            self._unsetEntry(key);
          } else {
            self._setEntry(key, referenceForReplacement);
          }
        }
      });

      _.chain(this._references.getSuccessors())
        .reject(function(s) { return s.equals(node); })
        .each(function(s) { self.addReference(s); });
    },

    getFirstFingerTableEntries: function(count) {
      var result = [];
      var sortedKeys = _.chain(this._remoteNodes)
        .keys()
        .map(function (key) { return parseInt(key); })
        .sortBy()
        .value();
      for (var i = 0; i < _.size(sortedKeys); i++) {
        var k = sortedKeys[i];
        if (!_.isNull(this._getEntry(k))) {
          if (_.isEmpty(result) || !_.last(result).equals(this._getEntry(k))) {
            result.push(this._getEntry(k));
          }
        }
        if (_.size(result) >= count) {
          break;
        }
      }
      return result;
    },

    containsReference: function(reference) {
      if (_.isNull(reference)) {
        throw new Error("Invalid argument.");
      }

      return _.some(this._remoteNodes, function(node) {
        return node.equals(reference);
      });
    },

    getStatus: function() {
      var self = this;
      return _(this._localId.getLength()).times(function(i) {
        return _.isNull(self._getEntry(i)) ? null : self._getEntry(i).toNodeInfo();
      });
    },

    toString: function() {
      var self = this;

      return "[FingerTable]\n" + _.chain(this._remoteNodes)
        .keys()
        .map(function(key) { return parseInt(key); })
        .sortBy()
        .map(function(key, i, keys) {
          if (i === 0 || (i > 0 && !self._getEntry(keys[i]).equals(self._getEntry(keys[i - 1])))) {
            return "[" + key + "] " + self._getEntry(key).toString();
          }

          if (i === _.size(keys) - 1 ||
              (i < _.size(keys) - 1 && !self._getEntry(keys[i]).equals(self._getEntry(keys[i + 1])))) {
            return "[" + key + "]";
          }

          if ((i > 1 &&
               self._getEntry(keys[i]).equals(self._getEntry(keys[i - 1])) &&
               !self._getEntry(keys[i]).equals(self._getEntry(keys[i - 2]))) ||
              (i === 1 && self._getEntry(keys[i]).equals(self._getEntry(keys[i - 1])))) {
            return "..."
          }

          if (i > 1 &&
              self._getEntry(keys[i]).equals(self._getEntry(keys[i - 1])) &&
              self._getEntry(keys[i]).equals(self._getEntry(keys[i - 2]))) {
            return "";
          }

          throw new Error("Unknown situation.");
        })
        .reject(function(str) { return str === ""; })
        .value()
        .join("\n") + "\n";
    }
  };

  return FingerTable;
});

define('SuccessorList',['underscore', 'Utils'], function(_, Utils) {
  var SuccessorList = function(localId, entries, references, config) {
    if (_.isNull(localId) || _.isNull(entries) || _.isNull(references)) {
      throw new Error("Invalid argument.");
    }

    if (!Utils.isValidNumber(config.numberOfEntriesInSuccessorList) ||
        config.numberOfEntriesInSuccessorList < 1) {
      config.numberOfEntriesInSuccessorList = 3;
    }

    this._localId = localId;
    this._capacity = config.numberOfEntriesInSuccessorList;
    this._entries = entries;
    this._references = references;
    this._successors = [];
  };

  SuccessorList.prototype = {
    addSuccessor: function(node) {
      if (_.isNull(node)) {
        throw new Error("Invalid argument.");
      }

      if (this.containsReference(node)) {
        return;
      }

      if (_.size(this._successors) >= this._capacity &&
          node.nodeId.isInInterval(_.last(this._successors).nodeId, this._localId)) {
        return;
      }

      var inserted = false;
      for (var i = 0; i < _.size(this._successors); i++) {
        if (node.nodeId.isInInterval(this._localId, this._successors[i].nodeId)) {
          Utils.insert(this._successors, i, node);
          inserted = true;
          break;
        }
      }
      if (!inserted) {
        this._successors.push(node);
        inserted = true;
      }

      var fromId;
      var predecessor = this._references.getPredecessor();
      if (!_.isNull(predecessor)) {
        fromId = predecessor.nodeId;
      } else {
        var precedingNode = this._references.getClosestPrecedingNode(this._localId);
        if (!_.isNull(precedingNode)) {
          fromId = precedingNode.nodeId;
        } else {
          fromId = this._localId;
        }
      }
      var toId = this._localId;
      var entriesToReplicate = this._entries.getEntriesInInterval(fromId, toId);
      node.insertReplicas(entriesToReplicate);

      if (_.size(this._successors) > this._capacity) {
        var nodeToDelete = this._successors.pop();

        nodeToDelete.removeReplicas(this._localId, []);

        this._references.disconnectIfUnreferenced(nodeToDelete);
      }
    },

    getDirectSuccessor: function() {
      if (_.isEmpty(this._successors)) {
	return null;
      }
      return this._successors[0];
    },

    getClosestPrecedingNode: function(idToLookup) {
      if (_.isNull(idToLookup)) {
        throw new Error("Invalid argument.");
      }

      for (var i = _.size(this._successors) - 1; i >= 0; i--) {
        if (this._successors[i].nodeId.isInInterval(this._localId, idToLookup)) {
          return this._successors[i];
        }
      }
      return null;
    },

    getReferences: function() {
      return this._successors;
    },

    removeReference: function(node) {
      var self = this;

      if (_.isNull(node)) {
        throw new Error("Invalid argument.");
      }

      this._successors = _.reject(this._successors, function(s) {
        return s.equals(node);
      });

      var referencesOfFingerTable = this._references.getFirstFingerTableEntries(this._capacity);
      referencesOfFingerTable = _.reject(referencesOfFingerTable, function(r) {
        return r.equals(node);
      });
      _.each(referencesOfFingerTable, function(reference) {
        self.addSuccessor(reference);
      });
    },

    getSize: function() {
      return _.size(this._successors);
    },

    getCapacity: function() {
      return this._capacity;
    },

    containsReference: function(node) {
      if (_.isNull(node)) {
        throw new Error("Invalid argument.");
      }

      return !_.isUndefined(_.find(this._successors, function(n) {
        return n.equals(node);
      }));
    },

    getStatus: function() {
      return _.invoke(this._successors, 'toNodeInfo');
    },

    toString: function() {
      return "[Successors]\n" + _.map(this._successors, function(node, index) {
        return "[" + index + "] " + node.toString();
      }).join("\n") + "\n";
    }
  };

  return SuccessorList;
});

define('ReferenceList',['underscore', 'FingerTable', 'SuccessorList'], function(_, FingerTable, SuccessorList) {
  var ReferenceList = function(localId, entries, config) {
    if (_.isNull(localId) || _.isNull(entries)) {
      throw new Error("Invalid arguments.");
    }

    this._localId = localId;
    this._fingerTable = new FingerTable(localId, this);
    this._successors = new SuccessorList(localId, entries, this, config);
    this._predecessor = null;
    this._entries = entries;
  };

  ReferenceList.prototype = {
    addReference: function(reference) {
      if (_.isNull(reference)) {
        throw new Error("Invalid argument.");
      }

      if (reference.nodeId.equals(this._localId)) {
        return;
      }

      this._fingerTable.addReference(reference);
      this._successors.addSuccessor(reference);
    },

    removeReference: function(reference) {
      if (_.isNull(reference)) {
        throw new Error("Invalid argument.");
      }

      this._fingerTable.removeReference(reference);
      this._successors.removeReference(reference);

      if (reference.equals(this.getPredecessor())) {
        this._predecessor = null;
      }

      this.disconnectIfUnreferenced(reference);
    },

    getSuccessor: function() {
      return this._successors.getDirectSuccessor();
    },

    getSuccessors: function() {
      return this._successors.getReferences();
    },

    getClosestPrecedingNode: function(key) {
      if (_.isNull(key)) {
        throw new Error("Invalid argument.");
      }

      var foundNodes = [];

      var closestNodeFT = this._fingerTable.getClosestPrecedingNode(key);
      if (!_.isNull(closestNodeFT)) {
        foundNodes.push(closestNodeFT);
      }
      var closestNodeSL = this._successors.getClosestPrecedingNode(key);
      if (!_.isNull(closestNodeSL)) {
        foundNodes.push(closestNodeSL);
      }
      if (!_.isNull(this._predecessor) &&
          key.isInInterval(this._predecessor.nodeId, this._localId)) {
        foundNodes.push(this._predecessor);
      }

      foundNodes.sort(function(a, b) {
          return a.nodeId.compareTo(b.nodeId);
      });
      var keyIndex = _.chain(foundNodes)
        .map(function(node) { return node.nodeId; })
        .sortedIndex(function(id) { return id.equals(key); })
        .value();
      var index = (_.size(foundNodes) + (keyIndex - 1)) % _.size(foundNodes);
      var closestNode = foundNodes[index];
      if (_.isNull(closestNode)) {
        throw new Error("Closest node must not be null.");
      }
      return closestNode;
    },

    getPredecessor: function() {
      return this._predecessor;
    },

    addReferenceAsPredecessor: function(potentialPredecessor) {
      if (_.isNull(potentialPredecessor)) {
        throw new Error("Invalid argument.");
      }

      if (potentialPredecessor.nodeId.equals(this._localId)) {
        return;
      }

      if (_.isNull(this._predecessor) ||
          potentialPredecessor.nodeId.isInInterval(this._predecessor.nodeId, this._localId)) {
        this.setPredecessor(potentialPredecessor);
      }

      this.addReference(potentialPredecessor);
    },

    setPredecessor: function(potentialPredecessor) {
      if (_.isNull(potentialPredecessor)) {
        throw new Error("Invalid argument.");
      }

      if (potentialPredecessor.nodeId.equals(this._localId)) {
        return;
      }

      if (potentialPredecessor.equals(this._predecessor)) {
        return;
      }

      var formerPredecessor = this._predecessor;
      this._predecessor = potentialPredecessor;
      if (!_.isNull(formerPredecessor)) {
        this.disconnectIfUnreferenced(formerPredecessor);

        var size = this._successors.getSize();
        if (this._successors.getCapacity() === size) {
          var lastSuccessor = _.last(this._successors.getReferences());
          lastSuccessor.removeReplicas(this._predecessor.nodeId, []);
        }
      } else {
        var entriesToRep = this._entries.getEntriesInInterval(this._predecessor.nodeId, this._localId);
        var successors = this._successors.getReferences();
        _.each(successors, function(successor) {
          successor.insertReplicas(entriesToRep);
        });
      }
    },

    disconnectIfUnreferenced: function(removedReference) {
      if (_.isNull(removedReference)) {
        throw new Error("Invalid argument.");
      }

      if (!this.containsReference(removedReference)) {
        removedReference.disconnect();
      }
    },

    getFirstFingerTableEntries: function(count) {
      return this._fingerTable.getFirstFingerTableEntries(count);
    },

    containsReference: function(reference) {
      if (_.isNull(reference)) {
        throw new Error("Invalid argurment.");
      }

      return (this._fingerTable.containsReference(reference) ||
              this._successors.containsReference(reference) ||
              reference.equals(this._predecessor));
    },

    getStatuses: function() {
      return {
        successors: this._successors.getStatus(),
        fingerTable: this._fingerTable.getStatus(),
        predecessor: _.isNull(this.getPredecessor()) ? null : this.getPredecessor().toNodeInfo()
      };
    },

    toString: function() {
      return [
        this._successors.toString(),
        "[Predecessor]\n" + (_.isNull(this.getPredecessor()) ? "" : this.getPredecessor().toString()) + "\n",
        this._fingerTable.toString()
      ].join("\n") + "\n";
    }
  };

  return ReferenceList;
});

define('StabilizeTask',['underscore', 'Utils'], function(_, Utils) {
  var StabilizeTask = function(localNode, references, entries) {
    this._localNode = localNode;
    this._references = references;
    this._entries = entries;
    this._timer = null;
  };

  StabilizeTask.create = function(localNode, references, entries, config) {
    if (!Utils.isValidNumber(config.stabilizeTaskInterval) ||
        config.stabilizeTaskInterval < 0) {
      config.stabilizeTaskInterval = 30000;
    }

    var task = new StabilizeTask(localNode, references, entries);
    var timer = setInterval(function() {
      task.run();
    }, config.stabilizeTaskInterval);
    task._timer = timer;
    return task;
  };

  StabilizeTask.prototype = {
    run: function() {
      var self = this;

      var successors = this._references.getSuccessors();
      if (_.isEmpty(successors)) {
        return;
      }
      var successor = _.first(successors);

      successor.notify(this._localNode, function(references, error) {
        if (error) {
          console.log(error);
          self._references.removeReference(successor);
          return;
        }

        var RemoveUnreferencedSuccessorsAndAddReferences = function(references) {
          _.chain(successors)
            .reject(function(s) {
              return (s.equals(successor) ||
                      (!_.isNull(self._references.getPredecessor()) &&
                       s.equals(self._references.getPredecessor())) ||
                      _.some(references, function(r) { return r.equals(s); }));
            })
            .each(function(s) {
              self._references.removeReference(s);
            });

          _.each(references, function(ref) {
            self._references.addReference(ref);
          });

          var currentSuccessor = self._references.getSuccessor();
          if (!currentSuccessor.equals(successor)) {
            currentSuccessor.ping(function(isAlive, error) {
              if (error) {
                console.log(error);
                self._references.removeReference(currentSuccessor);
              }
            });
          }
        };

        if (_.size(references) > 0 && !_.isNull(references[0])) {
          if (!self._localNode.equals(references[0])) {
            successor.notifyAndCopyEntries(self._localNode, function(references, entries, error) {
              if (error) {
                console.log(error);
                return;
              }

              self._entries.addAll(entries);

              RemoveUnreferencedSuccessorsAndAddReferences(references);
            });
          }
        }

        RemoveUnreferencedSuccessorsAndAddReferences(references);
      });
    },

    shutdown: function() {
      if (!_.isNull(this._timer)) {
        clearInterval(this._timer);
      }
    }
  };

  return StabilizeTask;
});

define('FixFingerTask',['underscore', 'Utils'], function(_, Utils) {
  var FixFingerTask = function(localNode, references) {
    this._localNode = localNode;
    this._references = references;
    this._timer = null;
  };

  FixFingerTask.create = function(localNode, references, config) {
    if (!Utils.isValidNumber(config.fixFingerTaskInterval) ||
        config.fixFingerTaskInterval < 0) {
      config.fixFingerTaskInterval = 30000;
    }

    var task = new FixFingerTask(localNode, references);
    var timer = setInterval(function() {
      task.run();
    }, config.fixFingerTaskInterval);
    task._timer = timer;
    return task;
  };

  FixFingerTask.prototype = {
    run: function() {
      var self = this;

      var nextFingerToFix = _.random(this._localNode.nodeId.getLength() - 1);
      var lookForID = this._localNode.nodeId.addPowerOfTwo(nextFingerToFix);
      this._localNode.findSuccessor(lookForID, function(successor, error) {
        if (error) {
          console.log(error);
        }

        if (!_.isNull(successor) &&
            !self._references.containsReference(successor)) {
          self._references.addReference(successor);
        }
      });
    },

    shutdown: function() {
      if (!_.isNull(this._timer)) {
        clearInterval(this._timer);
      }
    }
  };

  return FixFingerTask;
});

define('CheckPredecessorTask',['underscore', 'Utils'], function(_, Utils) {
  var CheckPredecessorTask = function(references) {
    this._references = references;
    this._timer = null;
  };

  CheckPredecessorTask.create = function(references, config) {
    if (!Utils.isValidNumber(config.checkPredecessorTaskInterval) ||
        config.checkPredecessorTaskInterval < 0) {
      config.checkPredecessorTaskInterval = 30000;
    }

    var task = new CheckPredecessorTask(references);
    var timer = setInterval(function() {
      task.run();
    }, config.checkPredecessorTaskInterval);
    task._timer = timer;
    return task;
  };

  CheckPredecessorTask.prototype = {
    run: function() {
      var self = this;

      var predecessor = this._references.getPredecessor();
      if (_.isNull(predecessor)) {
        return;
      }

      predecessor.ping(function(isAlive, error) {
        if (error) {
          console.log(error);
          self._references.removeReference(predecessor);
        }
      });
    },

    shutdown: function() {
      if (!_.isNull(this._timer)) {
        clearInterval(this._timer);
      }
    }
  };

  return CheckPredecessorTask;
});

define('LocalNode',[
  'underscore', 'NodeFactory', 'EntryList', 'Entry', 'ReferenceList', 'ID', 'StabilizeTask',
  'FixFingerTask', 'CheckPredecessorTask', 'Utils'
], function(
  _, NodeFactory, EntryList, Entry, ReferenceList, ID, StabilizeTask, FixFingerTask, CheckPredecessorTask, Utils
) {
  var LocalNode = function(chord, config) {
    this._chord = chord;
    this._config = config;
    this.nodeId = null;
    this._peerId = null;
    this._nodeFactory = null;
    this._tasks = {};
    this._entries = null;
    this._references = null;
  };

  LocalNode.create = function(chord, config, callback) {
    var localNode = new LocalNode(chord, config);
    NodeFactory.create(localNode, config, function(peerId, factory, error) {
      if (error) {
        callback(null, error);
        return;
      }

      localNode.setup(peerId, factory);

      callback(localNode);
    });
  };

  LocalNode.prototype = {
    setup: function(peerId, nodeFactory) {
      this._peerId = peerId;
      this.nodeId = ID.create(peerId);
      this._nodeFactory = nodeFactory;
      this._entries = new EntryList();
      this._references = new ReferenceList(this.nodeId, this._entries, this._config);
    },

    _createTasks: function() {
      this._tasks = {
        stabilizeTask: StabilizeTask.create(this, this._references, this._entries, this._config),
        fixFingerTask: FixFingerTask.create(this, this._references, this._config),
        checkPredecessorTask: CheckPredecessorTask.create(this._references, this._config)
      };
    },

    _shutdownTasks: function() {
      _.invoke(this._tasks, 'shutdown');
    },

    create: function(callback) {
      this._createTasks();

      callback(this._peerId);
    },

    join: function(bootstrapId, callback) {
      var self = this;

      this._nodeFactory.create({peerId: bootstrapId}, function(bootstrapNode, error) {
        if (error) {
          callback(null, error);
          return;
        }

        self._references.addReference(bootstrapNode);

        bootstrapNode.findSuccessor(self.nodeId, function(successor, error) {
          if (error) {
            self._references.removeReference(bootstrapNode);
            callback(null, error);
            return;
          }

          self._references.addReference(successor);

          var _notifyAndCopyEntries = function(node, callback) {
            node.notifyAndCopyEntries(self, function(refs, entries, error) {
              if (error) {
                callback(null, null, error);
                return;
              }

              if (_.size(refs) === 1) {
                self._references.addReferenceAsPredecessor(successor);
                callback(refs, entries);
                return;
              }

              if (self.nodeId.isInInterval(refs[0].nodeId, successor.nodeId)) {
                self._references.addReferenceAsPredecessor(refs[0]);
                callback(refs, entries);
                return;
              }

              self._references.addReference(refs[0]);
              _notifyAndCopyEntries(refs[0], callback);
            });
          };
          _notifyAndCopyEntries(successor, function(refs, entries, error) {
            if (error) {
              console.log(error);
              self._createTasks();
              callback(self._peerId);
              return;
            }

            _.each(refs, function(ref) {
              if (!_.isNull(ref) && !ref.equals(self) &&
                  !self._references.containsReference(ref)) {
                self._references.addReference(ref);
              }
            });

            self._entries.addAll(entries);

            _.defer(function() {
              self._chord.onentriesinserted(_.invoke(entries, 'toJson'));
            });

            self._createTasks();

            callback(self._peerId);
          });
        });
      });
    },

    leave: function(callback) {
      var self = this;

      this._shutdownTasks();

      var successor = this._references.getSuccessor();
      if (!_.isNull(successor) && !_.isNull(this._references.getPredecessor())) {
        successor.leavesNetwork(this._references.getPredecessor());
      }

      this._nodeFactory.destroy();

      callback();
    },

    insert: function(key, value, callback) {
      var id = ID.create(key);
      var entry;
      try {
        entry = new Entry(id, value);
      } catch (e) {
        callback(e);
        return;
      }
      this.findSuccessor(id, function(successor, error) {
        if (error) {
          callback(error);
          return;
        }

        successor.insertEntry(entry, callback);
      });
    },

    retrieve: function(key, callback) {
      var id = ID.create(key);
      this.findSuccessor(id, function(successor, error) {
        if (error) {
          callback(null, error);
          return;
        }

        successor.retrieveEntries(id, function(entries, error) {
          if (error) {
            callback(null, error);
            return;
          }

          callback(_.map(entries, function(entry) { return entry.value; }));
        });
      });
    },

    remove: function(key, value, callback) {
      var id = ID.create(key);
      var entry;
      try {
        entry = new Entry(id, value);
      } catch (e) {
        callback(e);
        return;
      }
      this.findSuccessor(id, function(successor, error) {
        if (error) {
          callback(error);
          return;
        }

        successor.removeEntry(entry, callback);
      });
    },

    findSuccessor: function(key, callback) {
      var self = this;

      if (_.isNull(key)) {
        callback(null, new Error("Invalid argument."));
      }

      var successor = this._references.getSuccessor();
      if (_.isNull(successor)) {
        callback(this);
        return;
      }

      if (key.isInInterval(this.nodeId, successor.nodeId) ||
          key.equals(successor.nodeId)) {
        callback(successor);
        return;
      }

      var closestPrecedingNode = this._references.getClosestPrecedingNode(key);
      closestPrecedingNode.findSuccessor(key, function(successor, error) {
        if (error) {
          console.log(error);
          self._references.removeReference(closestPrecedingNode);
          self.findSuccessor(key, callback);
          return;
        }

        callback(successor);
      });
    },

    notifyAndCopyEntries: function(potentialPredecessor, callback) {
      var self = this;

      var references = this.notify(potentialPredecessor, function(references) {
        var entries = self._entries.getEntriesInInterval(self.nodeId, potentialPredecessor.nodeId);

        callback(references, entries);
      });
    },

    notify: function(potentialPredecessor, callback) {
      var references = [];
      if (!_.isNull(this._references.getPredecessor())) {
        references.push(this._references.getPredecessor());
      } else {
        references.push(potentialPredecessor);
      }
      references = references.concat(this._references.getSuccessors());

      this._references.addReferenceAsPredecessor(potentialPredecessor);

      callback(references);
    },

    leavesNetwork: function(predecessor) {
      this._references.removeReference(this._references.getPredecessor());
      this._references.addReferenceAsPredecessor(predecessor);
    },

    insertReplicas: function(replicas) {
      var self = this;

      this._entries.addAll(replicas);

      _.defer(function() {
        self._chord.onentriesinserted(_.invoke(replicas, 'toJson'));
      });
    },

    removeReplicas: function(sendingNodeId, replicas) {
      var self = this;

      if (_.size(replicas) !== 0) {
        this._entries.removeAll(replicas);

        _.defer(function() {
          self._chord.onentriesremoved(_.invoke(replicas, 'toJson'));
        });

        return;
      }

      var allReplicasToRemove = this._entries.getEntriesInInterval(this.nodeId, sendingNodeId);
      this._entries.removeAll(allReplicasToRemove);

      _.defer(function() {
        self._chord.onentriesremoved(_.invoke(allReplicasToRemove, 'toJson'));
      });
    },

    insertEntry: function(entry, callback) {
      var self = this;

      if (!_.isNull(this._references.getPredecessor()) &&
          !entry.id.isInInterval(this._references.getPredecessor().nodeId, this.nodeId)) {
        this._references.getPredecessor().insertEntry(entry, callback); 
        return;
      }

      this._entries.add(entry);

      _.defer(function() {
        self._chord.onentriesinserted([entry.toJson()]);
      });

      _.each(this._references.getSuccessors(), function(successor) {
        successor.insertReplicas([entry]);
      });

      callback(true);
    },

    retrieveEntries: function(id, callback) {
      if (!_.isNull(this._references.getPredecessor()) &&
          !id.isInInterval(this._references.getPredecessor().nodeId, this.nodeId)) {
        this._references.getPredecessor().retrieveEntries(id, callback);
        return;
      }

      callback(this._entries.getEntries(id));
    },

    removeEntry: function(entry, callback) {
      var self = this;

      if (!_.isNull(this._references.getPredecessor()) &&
          !entry.id.isInInterval(this._references.getPredecessor().nodeId, this.nodeId)) {
        this._references.getPredecessor().removeEntry(entry, callback);
        return;
      }

      this._entries.remove(entry);

      _.defer(function() {
        self._chord.onentriesremoved([entry.toJson()]);
      });

      _.each(this._references.getSuccessors(), function(successor) {
        successor.removeReplicas(self.nodeId, [entry]);
      });

      callback(true);
    },

    getStatuses: function() {
      var ret = this._references.getStatuses();
      ret['entries'] = this._entries.getStatus();
      return ret;
    },

    getPeerId: function() {
      return this._peerId;
    },

    toNodeInfo: function() {
      return {
        nodeId: this.nodeId.toHexString(),
        peerId: this._peerId
      };
    },

    equals: function(node) {
      if (_.isNull(node)) {
        return false;
      }
      return this.nodeId.equals(node.nodeId);
    },

    toString: function() {
      return this.nodeId.toHexString() + " (" + this._peerId + ")";
    },

    toDisplayString: function() {
      return [
        this._references.toString(),
        this._entries.toString()
      ].join("\n") + "\n";
    }
  };

  return LocalNode;
});

define('Chord',['underscore', 'LocalNode', 'Utils'], function(_, LocalNode, Utils) {
  var Chord = function(config) {
    if (!_.isObject(config)) {
      throw new Error("Invalid argument.");
    }

    this._config = config;
    this._localNode = null;
    this.onentriesinserted = function(entries) { ; };
    this.onentriesremoved = function(entries) { ; };
  };

  Chord.prototype = {
    create: function(callback) {
      var self = this;

      if (!_.isNull(this._localNode)) {
        throw new Error("Local node is already created.");
      }
      if (_.isUndefined(callback)) {
        callback = function() { ; };
      }

      LocalNode.create(this, this._config, function(localNode, error) {
        if (error) {
          callback(null, error);
          return;
        }

        self._localNode = localNode;
        self._localNode.create(function(peerId, error) {
          if (error) {
            self.leave();
            self._localNode = null;
          }

          callback(peerId, error);
        });
      });
    },

    join: function(bootstrapId, callback) {
      var self = this;

      if (!Utils.isNonemptyString(bootstrapId)) {
        throw new Error("Invalid argument.");
      }
      if (!_.isNull(this._localNode)) {
        throw new Error("Local node is already created.");
      }
      if (_.isUndefined(callback)) {
        callback = function() { ; };
      }

      LocalNode.create(this, this._config, function(localNode, error) {
        if (error) {
          callback(null, error);
          return;
        }

        self._localNode = localNode;
        self._localNode.join(bootstrapId, function(peerId, error) {
          if (error) {
            self.leave();
            self._localNode = null;
          }

          callback(peerId, error);
        });
      });
    },

    leave: function() {
      var self = this;

      if (_.isNull(this._localNode)) {
        return;
      }

      this._localNode.leave(function() {
        self._localNode = null;
      });
    },

    insert: function(key, value, callback) {
      if (_.isUndefined(callback)) {
        callback = function() { ; };
      }
      if (!Utils.isNonemptyString(key) || _.isUndefined(value)) {
        callback(new Error("Invalid arguments."));
        return;
      }

      this._localNode.insert(key, value, callback);
    },

    retrieve: function(key, callback) {
      if (_.isUndefined(callback)) {
        callback = function() { ; };
      }
      if (!Utils.isNonemptyString(key)) {
        callback(new Error("Invalid argument."));
        return;
      }

      this._localNode.retrieve(key, callback);
    },

    remove: function(key, value, callback) {
      if (_.isUndefined(callback)) {
        callback = function() { ; };
      }
      if (!Utils.isNonemptyString(key) || _.isUndefined(value)) {
        callback(new Error("Invalid arguments."));
        return;
      }

      this._localNode.remove(key, value, callback);
    },

    getStatuses: function() {
      return this._localNode.getStatuses();
    },

    getPeerId: function() {
      if (_.isNull(this._localNode)) {
        return null;
      }

      return this._localNode.getPeerId();
    },

    getNodeId: function() {
      if (_.isNull(this._localNode)) {
        return null;
      }

      return this._localNode.nodeId.toHexString();
    },

    toString: function() {
      if (_.isNull(this._localNode)) {
        return "";
      }

      return this._localNode.toDisplayString();
    }
  };

  return Chord;
});


    //The modules for your project will be inlined above
    //this snippet. Ask almond to synchronously require the
    //module value for 'main' here and return it as the
    //value to use for the public API for the built file.
    return require('Chord');
}));