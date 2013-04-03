Nestor [![Build Status](https://secure.travis-ci.org/cliffano/nestor.png?branch=master)](http://travis-ci.org/cliffano/nestor) [![Dependencies Status](https://david-dm.org/cliffano/nestor.png)](http://david-dm.org/cliffano/nestor)
------

Nestor is a [Jenkins](http://jenkins-ci.org) CLI and Node.js client.

This is handy for those who prefer to touch type on the command line over GUI and mouse clicks on the browser. It also serves as an alternative to Jenkins Java CLI where Nestor has shorter commands and executes faster.

Installation
------------

    npm install -g nestor

Usage
-----

Trigger a build:

    nestor build <job>

Trigger a parameterized build:

    nestor build <job> ["param1=value1&param2=value2"]

Trigger a build followed by console output:

    nestor build --console [--follow <variant>] <job>

Display build console output (with optional number, defaults to last build):

    nestor console <job> [number]

Stop currently running build:

    nestor stop <job>

View status of all jobs:

    nestor dashboard

View job status reports:

    nestor job <job>

View build status:

    nestor status [--console --follow <variant>] <job> <number>

View queued jobs:

    nestor queue

View executors' status (running builds):

    nestor executor
    
Discover Jenkins instance running on a specified host:

    nestor discover <host>

View Jenkins version number:

    nestor ver

Start an IRC bot:

    nestor irc <host> <channel> [nick]

Programmatically:

    var nestor = new (require('nestor'))(
      'http://user:pass@host:port/path'
    );

    // trigger a parameterized build
    nestor.build('job', 'param1=value1&param2=value2', function (err, result) {
    });

The '--follow' option on some commands allows to follow a particular variant of a parameterized build.
If job 'MyJob' has variant 'TARGET=host' and 'TARGET=arm', I can launch and follow using:
    
    nestor build --console --follow "TARGET=host" MyJob

Check out [lib/jenkins](https://github.com/cliffano/nestor/blob/master/lib/jenkins.js) for other available methods.

Configuration
-------------

Set Jenkins URL in JENKINS_URL environment variable (defaults to http://localhost:8080):

(*nix)

    export JENKINS_URL=http://user:pass@host:port/path

(Windows)

    set JENKINS_URL=http://user:pass@host:port/path

If http_proxy environment variable is set, then Nestor will automatically use it.
