'use strict';

const valkyrie = require('./valkyrie/lib/express');
const app = new valkyrie();
const router = valkyrie.Router();
const router2 = valkyrie.Router();

exports.handler = (req, context, callback) => {
  const middle1 = (req, res, next) => {
    console.log('middle1');
    next();
    //res.send('this is middle 1');
  };

  app.use( (req, res, next) => {
    console.log('PATH >>>', req.path);
    next();
  });

  const skipMiddle = (req, res, next) => {
    console.log('this middleware skip to next route');
    next('route');
  };

  app.use('/test-next', middle1, middle1, router, middle1, skipMiddle, middle1, middle1, (req, res) => {
    res.send('test-next')
  });

  app.get('/test-next', (req, res) => {
    res.send('test-next-skipped')
  });

  app.use(['/route', ['/route2', '/route3']], (req, res, next) => {
    console.log('sto qui');
    next();
  });

  app.route('/route')
    .get((req, res) => {
      res.send('this is route in get')
    })
    .post((req, res) => {
      res.send('this is the same route in post')
    })
    .head((req, res, next) => {
      res.sendStatus(201);
    });

  app.route('/route')
    .put((req, res) => {
      res.sendStatus(201);
    });

  app.get('/send-status/:statusCode', (req, res, next) => {
    res.sendStatus(req.params.statusCode);
  });

  app.get('/log-request', (req, res, next) => {
    res.send(req);
  });

  router.use((req, res, next) => {
    res.append('custom-header-field', 'Valkyrie!');
    console.log('possible auth middleware');
    next();
  });

  router.get('/say/:text', (req, res, next) => {
    console.log(`param text is equal to ${req.params.text}`);
    res.send(`I just want to say "${req.params.text}"`);
  });

  router2.get('/hi', (req, res, next) => {
    res.send('hi, this is router2!');
  });

  //app.use('/router', router);

  //router.use('/router2', router2);

  app.use('*', (req, res, next) => {
    res.status(404).send('not found!');
    next()
  });

  //app.listen(8080, () => {console.log('listening 8080')})
  //app.describe();
  app.start(req, context, callback);
};
