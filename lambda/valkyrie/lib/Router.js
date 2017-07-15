'use strict';

const methods = require('methods');
const { flatten } = require('./Utils');
const Route = require('./Route');

class Router {
  constructor(settings) {
    this.settings = Object.assign({
      sensitive: false, //When true the path will be case sensitive
      strict: false,    //When false the trailing slash is optional
      end: true,        //When false the path will match at the beginning
      delimiter: '/'    //Set the default delimiter for repeat parameters
    }, settings);

    this.stack = [];
    this.stackCount = 0;

    Object.assign(this, {
      mountpath: '',
      routeStack: [],
      _routeIndex: null,
      _parent: null
    });

    ['all', ...methods].forEach(method => {
      this[method] = (...args) => _register(this, method, ...args);
    });

    return this;
  }

  get isRouter() {
    return true;
  }

  use(...args) {
    _register(this, 'use', ...args);
  }

  //todo
  route(path) {

  }

  handleRequest(req, res, mountPath = '', routeStartIndex = 0) {
    const { stack, stackCount } = this;
    for (let routeIndex = routeStartIndex; routeIndex < stackCount; routeIndex++) {
      //console.log('ROUTE', routeIndex);
      if (stack[routeIndex].handleRequest(req, res, mountPath)) return true;
    }
  }

  describe(mountPrefix = '') {
    this.stack.forEach(route => route.describe(mountPrefix));
  }
}

function _register(self, methods, ...args) {
  const { stack, settings } = self;
  const path = typeof args[0] === 'string' ? args.shift() : '*';
  stack.push(new Route(
    self,
    typeof methods === 'string'? { [methods]:true } : methods,
    path,
    flatten(args),
    settings)
  );

  self.stackCount++;
}

module.exports = Router;
