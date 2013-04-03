/*jshint esnext: true */
const COLORS = {  
  OK: 'green',
  ABORTED: 'grey',
  FAIL: 'red',
  WARN: 'yellow',
  SUCCESS: 'green',
  FAILURE: 'red',
  "IN PROGRESS": 'yellow',
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

  var job = new Job(this, jobName);

  if(!cb) {
    cb = params;
    params = {};
  }

  var build = job.launch(params, cb);

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
  var job = new Job(jenkins, jobName);
  job.lastBuild().console(bag.cli.exit);
}

function _stop(jobName) {
  var job = new Job(jenkins, jobName);
  job.stop(bag.cli.exitCb(null, function (result) {
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
        job.status(function(err, result) {
          console.log('%s - %s', result[COLORS[result] || 'grey'], job.name);   
        });
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
  var job = new Job(jenkins, name);

  job.grab(['status','healthReport'], bag.cli.exitCb(null, function (result) {
    var jobName = result.orig.name;

    console.log('%s | %s', jobName, result.status[COLORS[result.status] || 'grey']);
    result.healthReport.forEach(function(report) {
      console.log(" - %s", report.description)
    })
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
  if(!args) {
    args = buildNb;
    buildNb = 0;
  }

  var build = jenkins.job(jobName).build(buildNb);

  function printStatus(err, result) {
      if(err) {
        console.log('%s', err);
      } else {
        var currentStatus = result.source.result,
          color = COLORS[result.source.result];
        var startLine, durationLine, params;

        startLine = "Started at: {0}".format( new Date( result.source.timestamp ) );

        if(result.source.building) {
          currentStatus = 'IN PROGRESS';

          durationLine = "Estimated Duration " + formatDuration(result.source.estimatedDuration);
        } else {
          durationLine = "Duration: " + formatDuration(result.source.duration);
        }

        currentStatus = currentStatus[COLORS[currentStatus] || 'grey'];

        // Parameters
        params = "";
        result.source.actions.forEach(function(obj) {
          if(obj.hasOwnProperty('parameters')) {
            obj.parameters.forEach(function(param) {
              params += '{0}="{1}"'.format(param.name, param.value);
            });
          }
        });

        console.log('[#%d, %s] %s %s', result.source.number, currentStatus, jobName, params);

        // Start / Duration
          console.log("|| %s", startLine);
        if(durationLine) {
          console.log("|| %s", durationLine);
        }

        // UUID
        if(result.source.uuid) {
          console.log('|| UUID: %s', result.source.uuid);
        }

        var consoleHandler = null;

        // Prepare Console
        if(args.console) {
          consoleHandler = function() {
            var opts = {};
            var build = result.orig;

            if(args.follow) {
              var mChildren = result.children.filter(function(child) {
                return (child.variant == args.follow);
              });

              if(mChildren.length == 0) {
                console.log('Error: specified variant does not exist');
                bag.cli.exit(1);
              } else {
                build = mChildren[0];
              }
            }

            console.log('##############################################################################');
            build.console(opts, bag.cli.exit);
          }
        }

        // Variants
        var childrenCnt = result.children.length; 
        if(result.children) {
          function printChild(err, result) {
            var childStatus;

            if(err) {
              childStatus = "QUEUED";
            } else {
              childStatus = result.result;
            }

            console.log("||--- [%s] %s", childStatus[COLORS[childStatus] || 'grey'], result.orig.name);
          
            childrenCnt--;
            if( (childrenCnt == 0) && consoleHandler) {
              consoleHandler();
            }
          }

          result.children.forEach(function(child) {
            child.grab(['result'], printChild);
          });
        }
      }
  }

  build.grab( ['source','children'], printStatus);
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
