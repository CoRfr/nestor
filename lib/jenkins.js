/*jshint esnext: true */
var _ = require('underscore'),
  async = require('async'),
  bag = require('bagofholding'),
  dgram = require('dgram'),
  request = require('request'),
  xml2js = require('xml2js');
  Job = require('./job');
  Build = require('./build');

/**
 * class Jenkins
 *
 * @param {String} url: Jenkins URL, fallback to JENKINS_URL environment variable, otherwise default to http://localhost:8080
 */
function Jenkins(url) {

  function _authFail(result, cb) {
    cb(new Error('Authentication failed - incorrect username and/or password in JENKINS_URL'));
  }

  function _authRequire(result, cb) {
    cb(new Error('Jenkins requires authentication - set username and password in JENKINS_URL'));
  }

  this.url = url || process.env.JENKINS_URL || 'http://localhost:8080';

  if(this.url[this.url.length - 1] == '/') {
    this.url = this.url.substr(0, this.url.length - 1);
  }

  this.opts = {
    headers: {},
    handlers: {
      401: _authFail,
      403: _authRequire
    }
  };
}

/**
 * Retrieve all jobs as displayed on Jenkins dashboard.
 * Result is an array containing objects with status and name properties.
 *
 * @param {Function} cb: standard cb(err, result) callback
 */
Jenkins.prototype.dashboard = function (cb) {

  var self = this;

  function _success(result, cb) {
    var data = JSON.parse(result.body).jobs,
      jobs = [];

    if (!_.isEmpty(data)) {
      data.forEach(function (jobRes) {
        var job = new Job(self, jobRes);
        jobs.push(job);
      });
    }
    cb(null, jobs);    
  }

  this.opts.handlers[200] = _success;

  bag.http.request('get', this.url + '/api/json', this.opts, cb);
};

/**
 * Discover whether there's a Jenkins instance running on the specified host.
 *
 * @param {String} host: hostname
 * @param {Function} cb: standard cb(err, result) callback
 */
Jenkins.prototype.discover = function (host, cb) {

  var socket = dgram.createSocket('udp4'),
    buffer = new Buffer('Long live Jenkins!'),
    parser = new xml2js.Parser();

  socket.on('error', function (err) {
    socket.close();
    cb(err);
  });

  socket.on('message', function (result) {
    socket.close();
    parser.addListener('end', function (result) {
      cb(null, result);
    });
    parser.parseString(result);
  });

  socket.send(buffer, 0, buffer.length, 33848, host, function (err, result) {
    if (err) {
      socket.close();
      cb(err);
    }
  });
};

/**
 * Retrieve executors status grouped by Jenkins node (master and all slaves).
 *
 * @param {Function} cb: standard cb(err, result) callback
 */
Jenkins.prototype.executor = function (cb) {

  this.opts.queryStrings = { depth: 1 };

  function _success(result, cb) {
    var computers = JSON.parse(result.body).computer,
      data = {};
    computers.forEach(function (computer) {
      data[computer.displayName] = [];
      computer.executors.forEach(function (executor) {
        data[computer.displayName].push({
          idle: executor.idle,
          stuck: executor.likelyStuck,
          progress: executor.progress,
          name: (!executor.idle) ?
            executor.currentExecutable.url.replace(/.*\/job\//, '').replace(/\/.*/, '') :
            undefined
        });
      });
    });
    cb(null, data);
  }

  this.opts.handlers[200] = _success;

  bag.http.request('get', this.url + '/computer/api/json', this.opts, cb);
};

/**
 * Retrieve jobs in the queue waiting for available executor or
 * for a previously running build of the same job to finish.
 *
 * @param {Function} cb: standard cb(err, result) callback
 */
Jenkins.prototype.queue = function (cb) {

  function _success(result, cb) {
    var items = JSON.parse(result.body).items,
      data = [];
    if (!_.isEmpty(items)) {
      items.forEach(function (item) {
          data.push(item.task.name);
      });
    }
    cb(null, data);
  }

  this.opts.handlers[200] = _success;

  bag.http.request('get', this.url + '/queue/api/json', this.opts, cb);
};

/**
 * Retrieve Jenkins version number from x-jenkins header.
 * If x-jenkins header does not exist, then it's assumed that the server is not a Jenkins instance.
 *
 * @param {Function} cb: standard cb(err, result) callback
 */
Jenkins.prototype.version = function (cb) {

  function _success(result, cb) {
    if (result.headers['x-jenkins']) {
      cb(null, result.headers['x-jenkins']);
    } else {
      cb(new Error('Not a Jenkins server'));
    }
  }

  this.opts.handlers[200] = _success;

  bag.http.request('head', this.url, this.opts, cb);
};

module.exports = Jenkins;
