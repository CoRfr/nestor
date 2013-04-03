/*jshint esnext: true */
const COLORS = {  
  OK: 'green',
  ABORTED: 'grey',
  FAIL: 'red',
  WARN: 'yellow',
  SUCCESS: 'green',
  FAILURE: 'red',
};

var _ = require('underscore'),
  bag = require('bagofholding'),
  colors = require('colors'),
  irc = require('./irc'),
  Jenkins = require('./jenkins'),
  jenkins = new Jenkins();

function _build(jobName, params, args) {
  if (!args) {
    args = params || {};
  }

  const PENDING = 2000;
  const MAX_PENDING = 10000;
  var message = 'Job %s was started successfully',
    cb;

  if (args.console) {
    cb = function (err, result) {
      if (err) {
        bag.cli.exit(err, result);
      } else {
        console.log(message, jobName);

        buildUuid = result.uuid;
        currentBuildNb = result.builds.lastCompleted + 1;
        nextBuildNb = result.builds.next;
        pendingTimeout = MAX_PENDING;

        function handleBuildSearchResult(err, result) {
          var launchConsole = false;

          // Pull until the next build number is valid
          if(err && (nextBuildNb == currentBuildNb)) {
            pendingTimeout -= PENDING;

            if(pendingTimeout <= 0) {
              console.log("Timeout has expired, build %d still does not exist");
              return;
            } else {
              setTimeout(startBuildSearch, PENDING);
              return;
            }
          }

          if(err) {
            console.log("Unable to find matching build for UUID %s", buildUuid);
            return;
          } else if(!result.source.uuid || !buildUuid) {
            console.log("Build %s has no UUID, assuming this is the one", currentBuildNb);
            launchConsole = true;
          } else if(result.source.uuid == buildUuid) {
            console.log("Build %s has matching UUID (%s)", currentBuildNb, buildUuid);
            launchConsole = true;
          } else {
            // Continue search
            currentBuildNb++;
            jenkins.status(jobName, currentBuildNb, handleBuildSearchResult);
          }

          if(launchConsole) {
            var opts = {};

            if(args.follow) {
              var mvariant = result.variants.filter(function(val) {
                return (val.name == args.follow);
              });

              if(mvariant.length == 0) {
                console.log('Error: specified variant does not exist');
                return;
              } else {
                opts.variant = mvariant[0];
              }
            }

            jenkins.console(jobName, currentBuildNb, opts, bag.cli.exit);
          }
        }

        function startBuildSearch() {
          // First, we need to get the associated build nb
          jenkins.status(jobName, currentBuildNb, handleBuildSearchResult);
        }

        // Wait for pending period before calling console search
        setTimeout(startBuildSearch, PENDING);
      }
    };
  } else {
    cb = bag.cli.exitCb(null, function (result) {
      console.log(message, jobName);
    });
  }

  jenkins.build(jobName, (_.isString(params)) ? params : undefined, cb);
}

function _console(jobName) {
  jenkins.console(jobName, 0, bag.cli.exit);
}

function _stop(jobName) {
  jenkins.stop(
    jobName,
    bag.cli.exitCb(null, function (result) {
      console.log('Job %s was stopped successfully', jobName);
    })
  ); 
}

function _dashboard() {
  jenkins.dashboard(bag.cli.exitCb(null, function (result) {
    if (result.length === 0) {
      console.log('Jobless Jenkins');
    } else {
      result.forEach(function (job) {
        console.log('%s - %s', job.status[COLORS[job.status] || 'grey'], job.name);
      });
    }
  }));
}

function _discover(host) {
  host = (_.isString(host)) ? host : 'localhost';
  jenkins.discover(host, bag.cli.exitCb(null, function (result) {
    console.log('Jenkins ver. %s is running on %s',
        result.hudson.version[0],
        (result.hudson.url && result.hudson.url[0]) ? result.hudson.url[0] : host);
  }));
}

function _executor() {
  jenkins.executor(bag.cli.exitCb(null, function (result) {
    if (!_.isEmpty(_.keys(result))) {
      _.keys(result).forEach(function (computer) {
        console.log('+ ' + computer);
        result[computer].forEach(function (executor) {
          if (executor.idle) {
            console.log('  - idle');
          } else {
            console.log('  - %s | %s%%s', executor.name, executor.progress, (executor.stuck) ? ' stuck!' : '');
          }
        });
      });
    } else {
      console.log('No executor found');
    }
  }));
}

function _job(name) {
  jenkins.job(name, bag.cli.exitCb(null, function (result) {
    console.log('%s | %s', name, result.status[COLORS[result.status] || 'grey']);
    result.reports.forEach(function (report) {
      console.log(' - %s', report);
    });
  }));
}

if (!String.prototype.format) {
  String.prototype.format = function() {
    var args = arguments;
    return this.replace(/{(\d+)}/g, function(match, number) { 
      return typeof args[number] != 'undefined'
        ? args[number]
        : match
      ;
    });
  };
}

function formatDuration(msecs) {
  var secs = msecs / 1000;

  var hours = Math.floor(secs / (60 * 60));

  var divisor_for_minutes = secs % (60 * 60);
  var minutes = Math.floor(divisor_for_minutes / 60);

  var divisor_for_seconds = divisor_for_minutes % 60;
  var seconds = Math.ceil(divisor_for_seconds);

  var result = '';

  if(hours > 0)
    result = "{0}h".format(hours);
  if( (minutes > 0) || (hours > 0) )
    result = "{0}{1}m".format(result, minutes);
  result = "{0}{1}s".format(result, seconds);

  return result;
}

function _status(jobName, buildNb, args) {
  jenkins.status(jobName, buildNb, function (err, result) {
      if(err) {
        console.log('%s', err);
      } else {
        var currentStatus = result.source.result,
          color = COLORS[result.source.result];
        var durationLine;

        if(result.source.building) {
          currentStatus = 'IN PROGRESS';
          color = 'grey';

          durationLine = "Estimated Duration " + formatDuration(result.source.estimatedDuration);
        } else {
          durationLine = "Duration: " + formatDuration(result.source.duration);
        }

        currentStatus = currentStatus[color];

        console.log('Job %s | Build %d | %s', jobName, buildNb, currentStatus);

        // Duration
        if(durationLine) {
          console.log(durationLine);
        }

        // UUID
        if(result.source.uuid) {
          console.log('UUID: %s', result.source.uuid);
        }

        // Parameters
        result.source.actions.forEach(function(obj) {
          if(obj.hasOwnProperty('parameters')) {
            console.log('Parameters:');
            obj.parameters.forEach(function(param) {
              console.log('\t- %s="%s"', param.name, param.value);
            });
          }
        });

        // Variants
        if(result.variants) {
          console.log('Variants:');
          result.variants.forEach(function(variant) {
            console.log('\t- %s [Build %d]', variant.name, variant.number);
          });
        }

        // Console
        if(args.console) {
          var opts = {};

          if(args.follow) {
            var mvariant = result.variants.filter(function(val) {
              return (val.name == args.follow);
            });

            if(mvariant.length == 0) {
              console.log('Error: specified variant does not exist');
              return;
            } else {
              opts.variant = mvariant[0];
            }
          }

          console.log('Console:');
          jenkins.console(jobName, buildNb, opts, bag.cli.exit);
        }
      }
    }
  );
}

function _queue() {
  jenkins.queue(bag.cli.exitCb(null, function (result) {
    if (result.length === 0) {
      console.log('Queue is empty');
    } else {
      result.forEach(function (job) {
        console.log('- %s', job);
      });
    }
  }));
}

function _version() {
  jenkins.version(bag.cli.exitCb(null, function (result) {
    console.log('Jenkins ver. %s', result);
  }));
}

function _irc(host, channel, nick) {
  nick = (typeof nick === 'string') ? nick : undefined;
  irc.start(host, channel, nick);
}

/**
 * Execute Nestor CLI.
 */
function exec() {

  var actions = {
    commands: {
      build: { action: _build },
      console: { action: _console },
      stop: { action: _stop },
      dashboard: { action: _dashboard },
      discover: { action: _discover },
      executor: { action: _executor },
      job: { action: _job },
      status: { action: _status },
      queue: { action: _queue },
      ver: { action: _version },
      irc: { action: _irc }
    }
  };

  bag.cli.command(__dirname, actions);
}

exports.exec = exec;
