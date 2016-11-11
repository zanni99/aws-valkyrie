'use strict';

const methods = require('methods');
const debug = require('./../valk-utils').debug('valkyrie:route', 'cyan');
const flatten = require('./../valk-utils').flatten;
const Layer = require('./layer');

/**
 * Module variables.
 * @private
 */

var toString = Object.prototype.toString;

class Route {
  /**
   * Initialize `Route` with the given `path`,
   *
   * @param {String} path
   * @public
   */
  constructor(path) {
    this.path = path;
    this.stack = [];

    debug(`new ${path}`);

    // route handlers for various http methods
    this.methods = {};
  }

  /**
   * Determine if the route handles a given method.
   * @private
   */
  _handles_method(method) {
    if (this.methods._all) return true;

    //todo questo facilmente sono certo sia gia' in lower, potro' evitare
    let name = method.toLowerCase();

    if (name === 'head' && !this.methods['head']) name = 'get';

    return Boolean(this.methods[name]);
  }

  /**
   * @return {Array} supported HTTP methods
   * @private
   */
  _options() {
    var methods = Object.keys(this.methods);

    // append automatic head
    if (this.methods.get && !this.methods.head) methods.push('head');

    // make upper case
    const l = methods.length;
    for (var i = 0; i < l; i++) methods[i] = methods[i].toUpperCase();

    return methods;
  };

  /**
   * dispatch req, res into this route
   * @private
   */
  dispatch(req, res, done) {
    let idx = 0;
    const stack = this.stack;
    if (stack.length === 0) return done();

    //todo todo questo facilmente sono certo sia gia' in lower, potro' evitare
    let method = req.method.toLowerCase();
    if (method === 'head' && !this.methods['head']) method = 'get';

    req.route = this;

    next();

    function next(err) {
      if (err && err === 'route') return done();

      const layer = stack[idx++];
      if (!layer) return done(err);

      if (layer.method && layer.method !== method) return next(err);

      if (err) layer.handle_error(err, req, res, next);
      else layer.handle_request(req, res, next);
    }
  };

  /**
   * Add a handler for all HTTP verbs to this route.
   *
   * Behaves just like middleware and can respond or call `next`
   * to continue processing.
   *
   * You can use multiple `.all` call to add multiple handlers.
   *
   *   function check_something(req, res, next){
   *     next();
   *   };
   *
   *   function validate_user(req, res, next){
   *     next();
   *   };
   *
   *   route
   *   .all(validate_user)
   *   .all(check_something)
   *   .get(function(req, res, next){
   *     res.send('hello world');
   *   });
   *
   * @param {function} handler
   * @return {Route} for chaining
   * @api public
   */
  all() {
    return function() {
      return this._add_layer('all', flatten(Array.from(arguments)));
    }
  }

  /**
   * todo: description
   * @param method
   * @param handles
   * @returns {Route}
   * @private
   */

  _add_layer(method, handles) {
    const l = handles.length;
    for (let i = 0; i < l; i++) {
      var handle = handles[i];

      if (typeof handle !== 'function') {
        const type = toString.call(handle);
        const msg = `Route.${method}() requires callback functions but got a ${type}`;
        throw new TypeError(msg);
      }

      debug(`${method} ${this.path}`);

      const layer = new Layer('/', {}, handle);

      if ( method === 'all' ) {
        layer.method = undefined;
        this.methods._all = true;
      } else {
        layer.method = method;
        this.methods[method] = true;
      }

      this.stack.push(layer);
    }

    return this;
  };

  //todo potrebbe essere utile se e quando passo al patten a classi, se lo faccio
  //describe(indent) {
  //  console.log(`${indent || ''}Route - [${this.methods || ''}] ${this.path}`);
  //  const stack = this.stack;
  //  const l = stack.length;
  //  for (let i = 0; i < l; i++) stack[i].describe(indent + '   ');
  //}
}

const l = methods.length;
for (let i = 0; i < l; i++) {
  const method = methods[i];
  Route.prototype[method] = function() {
    return this._add_layer(method, flatten(Array.from(arguments)));
  }
}

module.exports = Route;
