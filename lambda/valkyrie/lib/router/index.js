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
 * @private
 */

const methods = require('methods');
const Route = require('./route');
const Layer = require('./layer');
const debug = require('./../Utils').debug('valkyrie:router', 'green');
const flatten = require('./../Utils').flatten;

/**
 * Module variables.
 * @private
 */

const slice = Array.prototype.slice;

/**
 * Initialize a new `Router` with the given `options`.
 *
 * @param {Object} options
 * @return {Router} which is an callable function
 * @public
 */

const proto = module.exports = function(options) {
  const opts = options || {};

  function router(req, res, next) {
    router.handle(req, res, next);
  }

  // mixin Router class functions
  router.__proto__ = proto;

  router.params = {};
  router._params = [];
  router.caseSensitive = opts.caseSensitive;
  router.mergeParams = opts.mergeParams;
  router.strict = opts.strict;
  router.stack = [];
  return router;
};

/**
 * Map the given param placeholder `name`(s) to the given callback.
 *
 * Parameter mapping is used to provide pre-conditions to routes
 * which use normalized placeholders. For example a _:user_id_ parameter
 * could automatically load a user's information from the database without
 * any additional code,
 *
 * The callback uses the same signature as middleware, the only difference
 * being that the value of the placeholder is passed, in this case the _id_
 * of the user. Once the `next()` function is invoked, just like middleware
 * it will continue on to execute the route, or subsequent parameter functions.
 *
 * Just like in middleware, you must either respond to the request or call next
 * to avoid stalling the request.
 *
 *  app.param('user_id', function(req, res, next, id){
 *    User.find(id, function(err, user){
 *      if (err) {
 *        return next(err);
 *      } else if (!user) {
 *        return next(new Error('failed to load user'));
 *      }
 *      req.user = user;
 *      next();
 *    });
 *  });
 *
 * @param {String} name
 * @param {Function} fn
 * @return {app} for chaining
 * @public
 */

proto.param = function param(name, fn) {
  // apply param functions
  const params = this._params;

  let ret;
  const l = params.length;
  for (let i = 0; i < l; ++i) {
    if (ret = params[i](name, fn)) fn = ret;
  }

  // ensure we end up with a
  // middleware function
  if ('function' !== typeof fn) {
    throw new Error('invalid param() call for ' + name + ', got ' + fn);
  }

  (this.params[name] = this.params[name] || []).push(fn);
  return this;
};

/**
 * Dispatch a req, res into the router.
 * @private
 */

proto.handle = function handle(req, res, out) {
  const self = this;

  debug(`dispatching ${req.method} ${req.url}`);

  let idx = 0;
  let removed = '';
  let slashAdded = false;
  const paramcalled = {};

  // store options for OPTIONS request
  // only used if OPTIONS request
  const options = [];

  // middleware and routes
  const stack = self.stack;

  // manage inter-router variables
  const parentParams = req.params;
  const parentPath = req.basePath || '';
  let done = restore(out, req, 'basePath', 'next', 'params');

  // setup next layer
  req.next = next;

  // for options requests, respond with a default if nothing else responds
  if (req.method === 'OPTIONS') {
    done = wrap(done, function(old, err) {
      if (err || options.length === 0) return old(err);
      sendOptionsResponse(res, options, old);
    });
  }

  // setup basic req values
  req.basePath = parentPath;
  req.originalPath = req.originalPath || req.url;

  next();

  function next(err) {
    let layerError = err === 'route' ? null : err;

    // remove added slash
    if (slashAdded) {
      req.url = req.url.substr(1);
      slashAdded = false;
    }

    // restore altered req.url
    if (removed.length !== 0) {
      req.basePath = parentPath;
      req.url = removed + req.url;
      removed = '';
    }

    // no more matching layers
    if (idx >= stack.length) {
      setImmediate(done, layerError);
      return;
    }

    // get pathname of request
    var path = req.url;

    // find next matching layer
    var layer;
    var match;
    var route;

    const l = stack.length;
    while (match !== true && idx < l) {
      layer = stack[idx++];
      match = matchLayer(layer, path);
      route = layer.route;

      // hold on to layerError
      if (typeof match !== 'boolean') layerError = layerError || match;

      if (match !== true) continue;

      // process non-route handlers normally
      if (!route) continue;

      // routes do not match with a pending error
      if (layerError) {
        match = false;
        continue;
      }

      const method = req.method;
      const has_method = route._handles_method(method);

      // build up automatic options response
      if (!has_method && method === 'OPTIONS') appendMethods(options, route._options());

      // don't even bother matching route
      if (!has_method && method !== 'HEAD') match = false;
    }

    // no match
    if (match !== true) return done(layerError);

    // store route for dispatch on change
    if (route) req.route = route;

    // Capture one-time layer values
    req.params = self.mergeParams ? mergeParams(layer.params, parentParams) : layer.params;
    const layerPath = layer.path;

    // this should be done for the layer
    self.process_params(layer, paramcalled, req, res, function (err) {
      if (err) return next(layerError || err);
      if (route) return layer.handle_request(req, res, next);
      trim_prefix(layer, layerError, layerPath, path);
    });
  }

  function trim_prefix(layer, layerError, layerPath, path) {
    const c = path[layerPath.length];
    if (c && '/' !== c && '.' !== c) return next(layerError);

    // Trim off the part of the url that matches the route
    // middleware (.use stuff) needs to have the path stripped
    if (layerPath.length !== 0) {
      debug(`trim prefix (${layerPath}) from url ${req.url}`);
      removed = layerPath;
      req.url = req.url.substr(removed.length);

      // Ensure leading slash
      if (req.url[0] !== '/') {
        req.url = '/' + req.url;
        slashAdded = true;
      }

      // Setup base URL (no trailing slash)
      req.basePath = parentPath + (removed[removed.length - 1] === '/' ? removed.substring(0, removed.length - 1) : removed);
    }

    debug(`${layer.name} ${layerPath} : ${req.originalPath}`);

    if (layerError) layer.handle_error(layerError, req, res, next);
    else layer.handle_request(req, res, next);
  }
};

/**
 * Process any parameters for the layer.
 * @private
 */

proto.process_params = function process_params(layer, called, req, res, done) {
  const params = this.params;

  // captured parameters from the layer, keys and values
  const keys = layer.keys;

  // fast track
  if (!keys || keys.length === 0) return done();

  let i = 0;
  let name;
  let paramIndex = 0;
  let key;
  let paramVal;
  let paramCallbacks;
  let paramCalled;

  // process params in order
  // param callbacks can be async
  function param(err) {
    if (err) return done(err);

    if (i >= keys.length ) return done();

    paramIndex = 0;
    key = keys[i++];

    if (!key) return done();

    name = key.name;
    paramVal = req.params[name];
    paramCallbacks = params[name];
    paramCalled = called[name];

    if (paramVal === undefined || !paramCallbacks) return param();

    // param previously called with same value or error occurred
    if (paramCalled && (paramCalled.match === paramVal
      || (paramCalled.error && paramCalled.error !== 'route'))) {
      // restore value
      req.params[name] = paramCalled.value;

      // next param
      return param(paramCalled.error);
    }

    called[name] = paramCalled = {
      error: null,
      match: paramVal,
      value: paramVal
    };

    paramCallback();
  }

  // single param callbacks
  function paramCallback(err) {
    const fn = paramCallbacks[paramIndex++];

    // store updated value
    paramCalled.value = req.params[key.name];

    if (err) {
      // store error
      paramCalled.error = err;
      param(err);
      return;
    }

    if (!fn) return param();

    try {
      fn(req, res, paramCallback, paramVal, key.name);
    } catch (e) {
      paramCallback(e);
    }
  }

  param();
};

/**
 * Use the given middleware function, with optional path, defaulting to "/".
 *
 * Use (like `.all`) will run for any http METHOD, but it will not add
 * handlers for those methods so OPTIONS requests will not consider `.use`
 * functions even if they could respond.
 *
 * The other difference is that _route_ path is stripped and not visible
 * to the handler function. The main effect of this feature is that mounted
 * handlers can operate without any code changes regardless of the "prefix"
 * pathname.
 *
 * @public
 */

proto.use = function use(fn) {
  let offset = 0;
  let path = '/';

  // default path to '/'
  // disambiguate router.use([fn])
  if (typeof fn !== 'function') {
    let arg = fn;

    while (Array.isArray(arg) && arg.length !== 0) arg = arg[0];

    // first arg is the path
    if (typeof arg !== 'function') {
      offset = 1;
      path = fn;
    }
  }

  const callbacks = flatten(slice.call(arguments, offset));

  const l = callbacks.length;

  if (l === 0) throw new TypeError('Router.use() requires middleware functions');

  for (var i = 0; i < l; i++) {
    const fn = callbacks[i];

    if (typeof fn !== 'function') throw new TypeError(`Router.use() requires middleware function but got a ${fn.costructor.name}`);

    // add the middleware
    debug(`use ${path} ${fn.name || '<anonymous>'}`);

    const layer = new Layer(path, {
      sensitive: this.caseSensitive,
      strict: false,
      end: false
    }, fn);

    layer.route = undefined;

    this.stack.push(layer);
  }

  return this;
};

/**
 * Create a new Route for the given path.
 *
 * Each route contains a separate middleware stack and VERB handlers.
 *
 * See the Route api documentation for details on adding handlers
 * and middleware to routes.
 *
 * @param {String} path
 * @return {Route}
 * @public
 */

proto.route = function route(path) {
  const route = new Route(path);

  const layer = new Layer(path, {
    sensitive: this.caseSensitive,
    strict: this.strict,
    end: true
  }, route.dispatch.bind(route));

  layer.route = route;

  this.stack.push(layer);
  return route;
};

// create Router#VERB functions
const l = methods.length;
methods.concat('all').forEach(function(method){
  proto[method] = function(path){
    const route = this.route(path);
    route[method].apply(route, slice.call(arguments, 1));
    return this;
  };
});

// append methods to a list of methods
function appendMethods(list, addition) {
  const l = addition.length;
  for (let i = 0; i < l; i++) {
    const method = addition[i];
    if (list.indexOf(method) === -1) list.push(method);
  }
}

/**
 * Match path to a layer.
 *
 * @param {Layer} layer
 * @param {string} path
 * @private
 */

function matchLayer(layer, path) {
  try {
    return layer.match(path);
  } catch (err) {
    return err;
  }
}

// merge params with parent params
function mergeParams(params, parent) {
  if (typeof parent !== 'object' || !parent) return params;

  // make copy of parent for base
  const obj = Object.assign({}, parent);

  // simple non-numeric merging
  if (!(0 in params) || !(0 in parent)) return Object.assign(obj, params);

  let i = 0;
  let o = 0;

  // determine numeric gaps
  while (i in params) i++;

  while (o in parent) o++;

  // offset numeric indices in params before merge
  for (i--; i >= 0; i--) {
    params[i + o] = params[i];

    // create holes for the merge when necessary
    if (i < o) delete params[i];
  }

  return Object.assign(obj, params);
}

// restore obj props after function
function restore(fn, obj) {
  const props = new Array(arguments.length - 2);
  const vals = new Array(arguments.length - 2);

  const l = props.length;
  for (let i = 0; i < l; i++) {
    props[i] = arguments[i + 2];
    vals[i] = obj[props[i]];
  }

  return function(err){
    // restore vals
    const l = props.length;
    for (let i = 0; i < l; i++) {
      obj[props[i]] = vals[i];
    }

    return fn.apply(this, arguments);
  };
}

// send an OPTIONS response
function sendOptionsResponse(res, options, next) {
  try {
    const body = options.join(',');
    res.set('Allow', body);
    res.send(body);
  } catch (err) {
    next(err);
  }
}

// wrap a function
function wrap(old, fn) {
  return function proxy() {
    const args = new Array(arguments.length + 1);

    args[0] = old;
    const l = arguments.length;
    for (let i = 0; i < l; i++) {
      args[i + 1] = arguments[i];
    }

    fn.apply(this, args);
  };
}
