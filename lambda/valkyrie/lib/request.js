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

const accepts = require('accepts');
const parseRange = require('range-parser');
const typeis = require('type-is');
var isIP = require('net').isIP;
var http = require('http');
var fresh = require('fresh');
var parse = require('parseurl');
var proxyaddr = require('proxy-addr');

module.exports = class Request {
  constructor(app, apiGatewayReqestObject) {
    this._apiGatewayReqestObject = apiGatewayReqestObject;
    this.app = app;
    this.params = {};
   
    //TODO this will be removed when router will be refactored
    this.url = this.path;

    const keys = Object.keys(apiGatewayReqestObject);
    const l = keys.length;
    for (let i = 0; i < l; i++) {
      const key = keys[i];
      switch (key) {
        case 'headers':
          const apiGatewayHeaders = apiGatewayReqestObject.headers;
          const headers = {};
          const headersKeys = Object.keys(apiGatewayHeaders);
          const l = headersKeys.length;
          for (let i = 0; i < l; i++) {
            const headerKey = headersKeys[i];
            headers[headerKey.toLowerCase()] = apiGatewayHeaders[headerKey];
          }
          this.headers = headers;
          break;

        case 'httpMethod':
          const httpMethod = apiGatewayReqestObject.httpMethod.toUpperCase();
          this.httpMethod = httpMethod;
          this.method = httpMethod;
          break;

        default:
          this[key] = apiGatewayReqestObject[key];
      }
    }
    return this;
  }

  /**
   * Return request header.
   *
   * The `Referrer` header field is special-cased,
   * both `Referrer` and `Referer` are interchangeable.
   *
   * Examples:
   *
   *     req.get('Content-Type');
   *     // => "text/plain"
   *
   *     req.get('content-type');
   *     // => "text/plain"
   *
   *     req.get('Something');
   *     // => undefined
   *
   * Aliased as `req.header()`.
   *
   * @param {String} name
   * @return {String}
   * @public
   */

  get(name) { return this.header(name) }
  header(name) {
      if (!name) {
        throw new TypeError('name argument is required to req.get');
      }

      if (typeof name !== 'string') {
        throw new TypeError('name must be a string to req.get');
      }

      const lc = name.toLowerCase();

      //todo no referrer field in apigateway request.
      switch (lc) {
        case 'referer':
        case 'referrer':
          return this.headers.referrer
            || this.headers.referer;
        default:
          return this.headers[lc];
      }
    };


  /**
   * To do: update docs.
   *
   * Check if the given `type(s)` is acceptable, returning
   * the best match when true, otherwise `undefined`, in which
   * case you should respond with 406 "Not Acceptable".
   *
   * The `type` value may be a single MIME type string
   * such as "application/json", an extension name
   * such as "json", a comma-delimited list such as "json, html, text/plain",
   * an argument list such as `"json", "html", "text/plain"`,
   * or an array `["json", "html", "text/plain"]`. When a list
   * or array is given, the _best_ match, if any is returned.
   *
   * Examples:
   *
   *     // Accept: text/html
   *     req.accepts('html');
   *     // => "html"
   *
   *     // Accept: text/*, application/json
   *     req.accepts('html');
   *     // => "html"
   *     req.accepts('text/html');
   *     // => "text/html"
   *     req.accepts('json, text');
   *     // => "json"
   *     req.accepts('application/json');
   *     // => "application/json"
   *
   *     // Accept: text/*, application/json
   *     req.accepts('image/png');
   *     req.accepts('png');
   *     // => undefined
   *
   *     // Accept: text/*;q=.5, application/json
   *     req.accepts(['html', 'json']);
   *     req.accepts('html', 'json');
   *     req.accepts('html, json');
   *     // => "json"
   *
   * @param {String|Array} type(s)
   * @return {String|Array|Boolean}
   * @public
   */

  accepts(){
    const accept = accepts(this);
    return accept.types.apply(accept, arguments);
  };

  /**
   * Check if the given `encoding`s are accepted.
   *
   * @param {String} ...encoding
   * @return {String|Array}
   * @public
   */

  acceptsEncodings(){
    const accept = accepts(this);
    return accept.encodings.apply(accept, arguments);
  };

  /**
   * Check if the given `charset`s are acceptable,
   * otherwise you should respond with 406 "Not Acceptable".
   *
   * @param {String} ...charset
   * @return {String|Array}
   * @public
   */

  acceptsCharsets(){
    const accept = accepts(this);
    return accept.charsets.apply(accept, arguments);
  };

  /**
   * Check if the given `lang`s are acceptable,
   * otherwise you should respond with 406 "Not Acceptable".
   *
   * @param {String} ...lang
   * @return {String|Array}
   * @public
   */

  acceptsLanguages(){
    const accept = accepts(this);
    return accept.languages.apply(accept, arguments);
  };

  /**
   * Parse Range header field, capping to the given `size`.
   *
   * Unspecified ranges such as "0-" require knowledge of your resource length. In
   * the case of a byte range this is of course the total number of bytes. If the
   * Range header field is not given `undefined` is returned, `-1` when unsatisfiable,
   * and `-2` when syntactically invalid.
   *
   * When ranges are returned, the array has a "type" property which is the type of
   * range that is required (most commonly, "bytes"). Each array element is an object
   * with a "start" and "end" property for the portion of the range.
   *
   * The "combine" option can be set to `true` and overlapping & adjacent ranges
   * will be combined into a single range.
   *
   * NOTE: remember that ranges are inclusive, so for example "Range: users=0-3"
   * should respond with 4 users when available, not 3.
   *
   * @param {number} size
   * @param {object} [options]
   * @param {boolean} [options.combine=false]
   * @return {number|array}
   * @public
   */

  range(size, options) {
    const range = this.get('Range');
    if (!range) return;
    return parseRange(size, range, options);
  };
  
  /**
  * Check if the incoming request contains the "Content-Type"
  * header field, and it contains the give mime `type`.
  *
  * Examples:
  *
  *      // With Content-Type: text/html; charset=utf-8
  *      req.is('html');
  *      req.is('text/html');
  *      req.is('text/*');
  *      // => true
  *
  *      // When Content-Type is application/json
  *      req.is('json');
  *      req.is('application/json');
  *      req.is('application/*');
  *      // => true
  *
  *      req.is('html');
  *      // => false
  *
  * @param {String|Array} types...
  * @return {String|false|null}
  * @public
  */

  is(types) {
    let arr = types;

    // support flattened arguments
    if (!Array.isArray(types)) {
      arr = new Array(arguments.length);
      const l = arr.length
      for (var i = 0; i < l; i++) {
        arr[i] = arguments[i];
      }
    }

    return typeis(this, arr);
  };
};

// /**
//  * Return the protocol string "http" or "https"
//  * when requested with TLS. When the "trust proxy"
//  * setting trusts the socket address, the
//  * "X-Forwarded-Proto" header field will be trusted
//  * and used if present.
//  *
//  * If you're running behind a reverse proxy that
//  * supplies https for you this may be enabled.
//  *
//  * @return {String}
//  * @public
//  */
//
// defineGetter(req, 'protocol', function protocol(){
//   var proto = this.connection.encrypted
//     ? 'https'
//     : 'http';
//   var trust = this.app.get('trust proxy fn');
//
//   if (!trust(this.connection.remoteAddress, 0)) {
//     return proto;
//   }
//
//   // Note: X-Forwarded-Proto is normally only ever a
//   //       single value, but this is to be safe.
//   proto = this.get('X-Forwarded-Proto') || proto;
//   return proto.split(/\s*,\s*/)[0];
// });
//
// /**
//  * Short-hand for:
//  *
//  *    req.protocol === 'https'
//  *
//  * @return {Boolean}
//  * @public
//  */
//
// defineGetter(req, 'secure', function secure(){
//   return this.protocol === 'https';
// });
//
// /**
//  * Return the remote address from the trusted proxy.
//  *
//  * The is the remote address on the socket unless
//  * "trust proxy" is set.
//  *
//  * @return {String}
//  * @public
//  */
//
// defineGetter(req, 'ip', function ip(){
//   var trust = this.app.get('trust proxy fn');
//   return proxyaddr(this, trust);
// });
//
// /**
//  * When "trust proxy" is set, trusted proxy addresses + client.
//  *
//  * For example if the value were "client, proxy1, proxy2"
//  * you would receive the array `["client", "proxy1", "proxy2"]`
//  * where "proxy2" is the furthest down-stream and "proxy1" and
//  * "proxy2" were trusted.
//  *
//  * @return {Array}
//  * @public
//  */
//
// defineGetter(req, 'ips', function ips() {
//   var trust = this.app.get('trust proxy fn');
//   var addrs = proxyaddr.all(this, trust);
//   return addrs.slice(1).reverse();
// });
//
// /**
//  * Return subdomains as an array.
//  *
//  * Subdomains are the dot-separated parts of the host before the main domain of
//  * the app. By default, the domain of the app is assumed to be the last two
//  * parts of the host. This can be changed by setting "subdomain offset".
//  *
//  * For example, if the domain is "tobi.ferrets.example.com":
//  * If "subdomain offset" is not set, req.subdomains is `["ferrets", "tobi"]`.
//  * If "subdomain offset" is 3, req.subdomains is `["tobi"]`.
//  *
//  * @return {Array}
//  * @public
//  */
//
// defineGetter(req, 'subdomains', function subdomains() {
//   var hostname = this.hostname;
//
//   if (!hostname) return [];
//
//   var offset = this.app.get('subdomain offset');
//   var subdomains = !isIP(hostname)
//     ? hostname.split('.').reverse()
//     : [hostname];
//
//   return subdomains.slice(offset);
// });
//
// /**
//  * Short-hand for `url.parse(req.url).pathname`.
//  *
//  * @return {String}
//  * @public
//  */
//
// defineGetter(req, 'path', function path() {
//   return parse(this).pathname;
// });
//
// /**
//  * Parse the "Host" header field to a hostname.
//  *
//  * When the "trust proxy" setting trusts the socket
//  * address, the "X-Forwarded-Host" header field will
//  * be trusted.
//  *
//  * @return {String}
//  * @public
//  */
//
// defineGetter(req, 'hostname', function hostname(){
//   var trust = this.app.get('trust proxy fn');
//   var host = this.get('X-Forwarded-Host');
//
//   if (!host || !trust(this.connection.remoteAddress, 0)) {
//     host = this.get('Host');
//   }
//
//   if (!host) return;
//
//   // IPv6 literal support
//   var offset = host[0] === '['
//     ? host.indexOf(']') + 1
//     : 0;
//   var index = host.indexOf(':', offset);
//
//   return index !== -1
//     ? host.substring(0, index)
//     : host;
// });
//
// // TODO: change req.host to return host in next major
//
// defineGetter(req, 'host', deprecate.function(function host(){
//   return this.hostname;
// }, 'req.host: Use req.hostname instead'));
//
// /**
//  * Check if the request is fresh, aka
//  * Last-Modified and/or the ETag
//  * still match.
//  *
//  * @return {Boolean}
//  * @public
//  */
//
// defineGetter(req, 'fresh', function(){
//   var method = this.method;
//   var s = this.res.statusCode;
//
//   // GET or HEAD for weak freshness validation only
//   if ('GET' !== method && 'HEAD' !== method) return false;
//
//   // 2xx or 304 as per rfc2616 14.26
//   if ((s >= 200 && s < 300) || 304 === s) {
//     return fresh(this.headers, (this.res._headers || {}));
//   }
//
//   return false;
// });
//
// /**
//  * Check if the request is stale, aka
//  * "Last-Modified" and / or the "ETag" for the
//  * resource has changed.
//  *
//  * @return {Boolean}
//  * @public
//  */
//
// defineGetter(req, 'stale', function stale(){
//   return !this.fresh;
// });
//
// /**
//  * Check if the request was an _XMLHttpRequest_.
//  *
//  * @return {Boolean}
//  * @public
//  */
//
// defineGetter(req, 'xhr', function xhr(){
//   var val = this.get('X-Requested-With') || '';
//   return val.toLowerCase() === 'xmlhttprequest';
// });
//
// /**
//  * Helper function for creating a getter on an object.
//  *
//  * @param {Object} obj
//  * @param {String} name
//  * @param {Function} getter
//  * @private
//  */
// function defineGetter(obj, name, getter) {
//   Object.defineProperty(obj, name, {
//     configurable: true,
//     enumerable: true,
//     get: getter
//   });
// };
