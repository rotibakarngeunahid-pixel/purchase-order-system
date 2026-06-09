let app;
let initError;

try {
  app = require('../server/index');
} catch (err) {
  initError = err;
  console.error('[INIT ERROR]', err.message, err.stack);
}

module.exports = (req, res) => {
  if (initError) {
    return res.status(500).json({
      error: 'Server failed to initialize',
      message: initError.message,
      code: initError.code,
    });
  }
  return app(req, res);
};
