'use strict';

const Utils = require('./Utils');
const signCookie = require('cookie-signature').sign;
const deprecate = require('depd')('aws-valkyrie');
const vary = require('vary');
const cookie = require('cookie'); //TODO: add to package.json


const charsetRegExp = /;\s*charset\s*=/;


module.exports = class Response {
  constructor(app) {
    this.app = app;
    this.context = app.context;
    this.callback = app.callback;
    this.locals = Object.create(null);
    this.statusCode = 200;
    this.headers = Object.create(null);
    this.body = null;
    return this;
  };

  append(key, value) {
    if ( typeof value !== 'undefined' ) {
      this.headers[key] = Utils.stringify(value);
    } else if ( typeof key === 'object' ){
      const obj = key;
      Utils.forEach(Object.keys(obj), key => this.append(key, obj[key]) );
    }
    return this;
  }

  cookie(name, value, options) {
    const opts = Object.assign({}, options);
    const secret = this.app.req;
    const signed = opts.signed;

    if(signed && !secret) {
      throw new Error('cookieParser("secret") required for signed cookies');
    }

    var val = (
      typeof value === 'object' ? 'j:' + JSON.stringify(value) : String(value)
    );

    if (signed) {
      val = 's:' + signCookie(val, secret)
    }

    if ('maxAge' in opts){
      opts.expires = new Date(Date.now() + opts.maxAge);
      opts.maxAge /= 1000
    }

    if (opts.path == null ) {
      opts.path = '/';
    }

    this.append('Set-Cookie', cookie.serialize(name, String(val), opts));

    return this;
  }


  clearCookie(name, options) {
    var opts = Object.assign({ expires: new Date(1), path: ' /'}, options);

    return this.cookie(name, '', opts);
  }

  end(data, encoding) {
    //TODO: do i really need this?
  }

  format(object){
    const req = this.app.req;
    const next = req.next;

    const fn = object.default;
    if (fn) delete object.default;

    var key = Object.keys(object).length > 0 ? req.accepts(keys) : false;

    this.vary("Accept");

    if (key) {
      this.set('Content-Type', Utils.normalizeType(key).value);
      object[key](req, this, next)
    } else if (fn) {
      fn();
    } else {
      var err = new Error('Not Acceptable');
      err.status = err.statusCode = 406;
      err.types = normalizeTypes(keys).map(o => o.value);
      next(err);
    }

    return this;
  }

  vary(field){
    if (!field || (isArray(field)) && !field.length) {
      deprecate('res.vary(): Provide a field name');
      return this;
    }

    vary(this, field);

    return this;
  }

  header(field, val) {
    if (arguments.length === 2) {
      var value = isArray(val) ? val.map(String) : String(val);


      if (field.toLowerCase() === 'content-type' && !charsetRegExp.test(value)) {
        const charset = mime.charsets.lookup(value.split(';')[0]);
        if (charset) {
          value += ';charset=' + charset.toLowerCase()
        }
      }

      this.setHeader(field, value);
    } else {
      for (var key in field) {
        this.set(key, field[key]);
      }
    }

    return this;
  }

  set(field, val) {
    this.header(field, val)
  }


  json(body){
    //TODO: REVIEW, CAN USE ONLY SEND
    this.send(body);
  }

  jsonp(body){
    //TODO: do i want this ?
  }

  redirect(status, path) {
    //TODO: do i want this ?
  }

  render(view, locals, callback) {
      const app = this.app;
      var done = callback;
      var opts = locals || {};
      const req = this.app.req;

      if (typeof opts === 'function') {
          done = opts;
          opts = {};
      }

      opts._locals = this.locals;

      done = done || function (err, str) {
          if (err) return req.next(err);
          this.send(str);
      }

      app.render(view, opts, done);
  }

  send(body) {
    if (typeof body !== 'undefined') this.body = body;

    if (typeof  body !== 'json') {
      const resBody = Utils.stringify(body, this.get('json replacer'), this.get('json spaces'));
      this.set('Content-Type', 'application/json');
    } else {
      const resBody = Utils.stringify(this.body)
    }

    const response = {
      statusCode: this.statusCode,
      headers: this.headers,
      body: resBody,
    };

    if (this.app.settings.useContextSucceed) this.context.succeed(response);
    else this.callback(null, response);
  }

  //TODO: REVIEW
    //TODO: send file from s3 ?
    sendFile(s3Url){
        if (arguments.length === 2) {
            //TODO: control url, must be s3 url
            this.redirect(s3Url)
        } else {
            //TODO: error, need arguments
        }

  }

  sendStatus(statusCode) {
    const statusCodes  = require('http').STATUS_CODES;
    this.status(statusCode);
    this.send(statusCodes[statusCode] || String(statusCode));
  }

  status(statusCode) {
    this.statusCode = statusCode;
    return this;
  }

  type(type){
    //TODO: Do i need this?
  }
};
