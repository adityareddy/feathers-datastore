"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = errorHandler;
// import errors from 'feathers-errors';

function errorHandler(error) {
  var feathersError = error;

  // TODO: Convert all gcloud errors to feathers errors

  throw feathersError;
}
module.exports = exports["default"];