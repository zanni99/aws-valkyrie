'use strict';

/**
 * Module dependencies.
 * @private
 */
const pathRegexp = require('path-to-regexp');
const debug = require('./../valk-utils').debug('valkyrie:route', 'yellow');

/**
 * Module variables.
 * @private
 */
const hasOwnProperty = Object.prototype.hasOwnProperty;

/**
 * Module exports.
 * @public
 */

module.exports = class Layer {
  constructor(path, options, fn) {
    debug(`new ${path}`);
    const opts = options || {};

    this.handle = fn;
    this.name = fn.name || '<anonymous>';
    this.params = undefined;
    this.path = undefined;
    this.regexp = pathRegexp(path, this.keys = [], opts);
    if (path === '/' && opts.end === false) {
      this.regexp.fast_slash = true;
    }
  }

  /**
   * Handle the error for the layer.
   *
   * @param {Error} error
   * @param {Request} req
   * @param {Response} res
   * @param {function} next
   * @api private
   */

  handle_error(error, req, res, next) {
    const fn = this.handle;

    // not a standard error handler
    if (fn.length !== 4) return next(error);

    try {
      fn(error, req, res, next);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Handle the request for the layer.
   *
   * @param {Request} req
   * @param {Response} res
   * @param {function} next
   * @api private
   */

  handle_request(req, res, next) {
    const fn = this.handle;

    // not a standard request handler
    if (fn.length > 3) return next();

    try {
      fn(req, res, next);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Check if this route matches `path`, if so
   * populate `.params`.
   *
   * @param {String} path
   * @return {Boolean}
   * @api private
   */
  match(path) {
    if (path == null) {
      // no path, nothing matches
      this.params = undefined;
      this.path = undefined;
      return false;
    }

    if (this.regexp.fast_slash) {
      // fast path non-ending match for / (everything matches)
      this.params = {};
      this.path = '';
      return true;
    }

    var m = this.regexp.exec(path);

    if (!m) {
      this.params = undefined;
      this.path = undefined;
      return false;
    }

    // store values
    this.params = {};
    this.path = m[0];

    const keys = this.keys;
    const params = this.params;

    const l = m.length;
    for (let i = 1; i < l; i++) {
      const key = keys[i - 1];
      const prop = key.name;
      const val = decode_param(m[i]);

      if (val !== undefined || !(hasOwnProperty.call(params, prop))) {
        params[prop] = val;
      }
    }

    return true;
  }

  describe(indent) {
    console.log(`${indent || ''}Layer - ${this.name} [${this.route? Object.keys(this.route.methods) : ''}] ${this.route? '\u001b[36m' + this.route.path + '\u001b[39m': ''}`);
    if (this.handle.describe) {
      this.handle.describe(indent + '   ');
    }
  }
};

/**
 * Decode param value.
 *
 * @param {string} val
 * @return {string}
 * @private
 */
function decode_param(val) {
  if (typeof val !== 'string' || val.length === 0) return val;

  try {
    return decodeURIComponent(val);
  } catch (err) {
    if (err instanceof URIError) {
      err.message = 'Failed to decode param \'' + val + '\'';
      err.status = err.statusCode = 400;
    }

    throw err;
  }
}
