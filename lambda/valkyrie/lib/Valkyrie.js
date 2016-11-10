/*!
 * express
 * Copyright(c) 2009-2013 TJ Holowaychuk
 * Copyright(c) 2013 Roman Shtylman
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict';

/**
 * Module dependencies.
 */

var EventEmitter = require('events').EventEmitter;
var mixin = require('merge-descriptors');
var proto = require('./application');
var Route = require('./router/route');
var Router = require('./router');
//var req = require('./request');
var res = require('./response');

/**
 * Expose `createApplication()`.
 */

module.exports = class Valkyrie {
  /**
   * Create an express application.
   *
   * @return {Function}
   * @api public
   */

  constructor() {
    var app = function(req, res, next) {
      app.handle(req, res, next);
    };

    mixin(app, EventEmitter.prototype, false);
    mixin(app, proto, false);

    app.request = {}//{ __proto__: req, app: app };
    app.response = { __proto__: res, app: app };
    app.init();
    return app;
  }

  /**
   * Expose constructors.
   */
  //todo rotue non l'ho mai usate, verificare se funzia ancora
  static Route(path) { return new Route(path); }
  static Router(options) { return new Router(options); }

};

/**
 * Expose the prototypes.
 */

//exports.application = proto;
//exports.request = req;
//exports.response = res;


/**
 * Expose middleware
 */

//exports.query = require('./middleware/query');
//exports.static = require('serve-static');
