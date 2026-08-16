// Wraps an async express handler so thrown rejections reach the error
// middleware instead of crashing the process.
module.exports = function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
