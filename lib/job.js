var _ = require('underscore'),
  bag = require('bagofholding'),
  grab = require('./grab');

/**
 * class Job
 * @param {Object} jenkinsObj: Jenkins Instance
 * @param {String} job: Job Name
 * @param {Object} job: Job JSON Data from dashboard API
 */
function Job(jenkinsObj, job) {

    this.jenkins = jenkinsObj;

    /* JSON Raw Data */
    this.dashboardSource = null;
    this.jobSource = null;

    if(!job) {
        console.log("Job undefined");
        process.exit(1);
    } else if(typeof(job) == 'object') {
        this.dashboardSource = job;
        this.name = job.name;
        this.url = job.url;
    } else {
        this.name = job;
        this.url = this.jenkins.url + '/job/' + this.name + '/';
    }

    console.log('Job: %s', this.url);

    this.opts = this.jenkins.opts;
}

Job.prototype._statusFromColor = function _statusFromColor(color) {

    const STATUS = {  
        blue: 'OK',
        green: 'OK',
        grey: 'ABORTED',
        red: 'FAIL',
        yellow: 'WARN'
    };

    // Jenkins color value can contain either a color, color_anime, or status in job.color field,
    // hence to get color/status value out of the mix we need to remove the postfix _anime,
    // _anime postfix only exists on a job currently being built
    color = color.replace(/_anime/, '');

    return (STATUS[color]) || color.toUpperCase();
}

Job.prototype.load = function (cb) {

    var self = this;

    function _success(result, cb) {
        self.jobSource = JSON.parse(result.body);

        // Process result
        self._status = self._statusFromColor(self.jobSource.color);

        cb(null, self);
    }

    function _notFound(result, cb) {
        cb(new Error('Job ' + self.name + ' does not exist'), self);
    }

    this.opts.handlers[200] = _success;
    this.opts.handlers[404] = _notFound;

    bag.http.request('get', this.url + '/api/json', this.opts, cb);
}

/**
 * @param {Array} keys: All keys that are required
 * @param {Function} cb: cb(err,result), result being a map with all requested values
 */ 
Job.prototype.grab = grab;

Job.prototype.status = function(cb) {

    var self = this;

    // Grab status from dashboard obj.
    if(this.dashboardSource) {
        self._status = this._statusFromColor(self.dashboardSource.color);
        cb(null, self._status);
        return;
    }

    // Grab status from job obj.
    if(this.jobSource) {
        cb(null, self._status);
        return;
    }

    // Load otherwise
    this.load(function(err, result) {
        if(!err) {
            cb(null, result._status);
        } else {
            cb(err);
        }
    });
};

Job.prototype.healthReport = function(cb) {
    // Grab from job obj.
    if(this.jobSource) {
        cb(null, this.jobSource.healthReport);
        return;
    }

    // Load otherwise
    this.load(function(err, result) {
        if(!err) {
            cb(null, result.jobSource.healthReport);
        } else {
            cb(err);
        }
    });
};

Job.prototype.build = function(buildNb, cb) {
    var build = new Build(this, buildNb);

    if(cb)
        cb(null, build);

    return build;
};

Job.prototype.lastBuild = function(cb) {
    return this.build(0, cb);
}

Job.prototype.stop = function(cb) {

    var self = this;

    function _success(result, cb) {
        cb(null);
    }

    function _notFound(result, cb) {
        cb(new Error('Job ' + self.name + ' does not exist'));
    }

    this.opts.handlers[200] = _success;
    this.opts.handlers[404] = _notFound;

    bag.http.request('get', this.url + '/lastBuild/stop', this.opts, cb);
};

Job.prototype.launch = function(params, cb) {

    var self = this;
    var json = { parameter: [] },
        method = 'get',
        buildVariant = 'build';

    if(params) {
        buildVariant = 'buildWithParameters'

        params.split('&').forEach(function (param) {
            var keyVal = param.split('=');
            json.parameter.push({ name: keyVal[0], value: keyVal[1] });
        });
        method = 'post';       
    }
    this.opts.queryStrings = { token: 'nestor', json: JSON.stringify(json) };

  // OLD
  // var json = { parameter: [] },
  // method = 'get';
  // buildVariant = 'build'

  // if (params) {
  //   buildVariant = 'buildWithParameters'

  //   params.split('&').forEach(function (param) {
  //     var keyVal = param.split('=');
  //     json.parameter.push({ name: keyVal[0], value: keyVal[1] });
  //   });
  //   method = 'post';
  // }
  // this.opts.queryStrings = { token: 'nestor', json: JSON.stringify(json) };

    function _success(result, cb) {
        var project = JSON.parse(result.body);
        var build = new Build(self, project.nextBuildNumber);
        // var response = {
        //   uuid: null,
        //   builds: {
        //     lastCompleted: project.lastCompletedBuild.number,
        //     next: project.nextBuildNumber,
        //   },
        //   task: {
        //     name: project.name,
        //     url: project.url
        //   }
        // };

        if(!project.hasOwnProperty('scheduledItem') || project.scheduledItem) {

          // if(project.scheduledItem) {
          //   response.uuid = project.scheduledItem.uuid;
          // }
          
          cb(null, build);
        }
        else {
          cb(new Error('Job ' + self.name + ' was already scheduled'));
        }
    }

    function _notFound(result, cb) {
        cb(new Error('Job ' + self.name + ' does not exist'));
    }

    function _paramsRequire(result, cb) {
        cb(new Error('Job ' + self.name + ' requires build parameters'));
    }

    this.opts.handlers[200] = _success;
    this.opts.handlers[302] = _success;
    this.opts.handlers[404] = _notFound;
    this.opts.handlers[405] = _paramsRequire;

    this.opts.headers['Accept'] = "application/json";

    bag.http.request(method, this.url + buildVariant, this.opts, cb);
}

module.exports = Job;
