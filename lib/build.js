var _ = require('underscore'),
  bag = require('bagofholding'),
  async = require('async'),
  Job = require('./job'),
  grab = require('./grab');

/**
 * class Build
 * @param {Object} parent: Job Instance or Build Instance
 */
function Build(parent, number, variant) {
    this.parent = parent;
    this.variant = variant;

    this.updateNumber = function(number) {

        if(number == 0) {
            number = 'lastBuild';
        }

        this.number = number;

        if(parent instanceof Job) {
            this.url = parent.url + this.number + '/';
            this.job = parent;
            this.name = parent.name + '#' + this.number;
        } else if(parent instanceof Build) {
            this.url = parent.job.url + variant + '/' + this.number + '/';
            this.job = parent.job;
            this.name = parent.name + ' ' + variant;
        } else {
            console.log('Wrong parent %s', parent);
            process.exit(1);
        }
    };

    this.updateNumber(number);

    this.jenkins = parent.jenkins;
    this.opts = this.jenkins.opts;

    console.log('Build: %s', this.url);

    this._children = null;
}

/**
 * @param {Array} keys: All keys that are required
 * @param {Function} cb: cb(err,result), result being a map with all requested values
 */ 
Build.prototype.grab = grab;

Build.prototype.load = function (cb) {

    var self = this;

    function _success(result, cb) {
        self._source = JSON.parse(result.body);

        self.updateNumber(self._source.number);
        self.url = self._source.url;

        // Result
        if(self._source.building) {
            self._result = "IN PROGRESS";
        } else {
            self._result = self._source.result;
        }

        // Build children
        self._children = [];
        if(self._source.runs) {
            self._source.runs.forEach(function(run) {
                var variant = run.url.substr( self.url.length - self.number.toString().length + 1);
                variant = variant.substr( 0, variant.indexOf('/') );

                var build = new Build(self, self.number, variant);
                self._children.push(build);
            });
        }

        cb(null, self);
    }

    function _notFound(result, cb) {
        cb(new Error('Build ' + self.name + ' does not exist'), self);
    }

    this.opts.handlers[200] = _success;
    this.opts.handlers[404] = _notFound;

    bag.http.request('get', this.url + '/api/json', this.opts, cb);
};

Build.prototype.source = function(cb) {

    var self = this;

    // Grab from obj.
    if(this._source) {
        cb(null, this._source);
        return;
    }

    // Load otherwise
    this.load(function(err, result) {
        if(!err) {
            cb(null, result._source);
        } else {
            cb(err);
        }
    });
};

Build.prototype.result = function(cb) {

    var self = this;

    // Grab from obj.
    if(this._result) {
        cb(null, this._result);
        return;
    }

    // Load otherwise
    this.load(function(err, result) {
        if(!err) {
            cb(null, result._result);
        } else {
            cb(err);
        }
    });
};

Build.prototype.children = function(cb) {

    var self = this;

    // Grab from obj.
    if(this._children) {
        cb(null, this._children);
        return;
    }

    // Load otherwise
    this.load(function(err, result) {
        if(!err) {
            cb(null, result._children);
        } else {
            cb(err);
        }
    });
};

Build.prototype.console = function(opts, cb) {

    var self = this;

    if(!cb) {
        cb = opts;
    }

    const INTERVAL = 1000;
    var url = self.url + 'logText/progressiveText';

    this.opts.queryStrings = { start: 0 }; // the first chunk

    function _success(result, cb) {

        if (result.body) {
            console.log(result.body);
        }

        // Stream while there are more data
        async.whilst(
            function () {
                return result.headers['x-more-data'] === 'true';
            },
            function (cb) {
                var params = {
                    url: url,
                    qs: { start: parseInt(result.headers['x-text-size'], 10) }
                },
                envProxy = bag.http.proxy(url);

                if (envProxy) {
                    params.proxy = envProxy;
                }

                request.get(params, function (err, _result) {
                    if (err) {
                        cb(err);
                    } else {
                        result = _result;
                        if (_result.body) {
                            console.log(_result.body);
                        }
                        setTimeout(function () {
                            cb();
                        }, (opts && opts.interval) ? opts.interval : INTERVAL);
                    }
                });
            },
            function (err) {
                cb(err);
            }
        );
    }

    function _notFound(result, cb) {
        cb(new Error('Job ' + jobName + ' does not exist'));
    }

    this.opts.handlers[200] = _success;
    this.opts.handlers[404] = _notFound;

    bag.http.request('get', url, this.opts, cb);
}

module.exports = Build;