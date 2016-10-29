'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

exports.default = init;

var _googleCloud = require('google-cloud');

var _googleCloud2 = _interopRequireDefault(_googleCloud);

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

var _uberproto = require('uberproto');

var _uberproto2 = _interopRequireDefault(_uberproto);

var _feathersErrors = require('feathers-errors');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _objectWithoutProperties(obj, keys) { var target = {}; for (var i in obj) { if (keys.indexOf(i) >= 0) continue; if (!Object.prototype.hasOwnProperty.call(obj, i)) continue; target[i] = obj[i]; } return target; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var debug = (0, _debug2.default)('feathers-datastore');

function promisify(obj, method) {
  return function () {
    for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    return new Promise(function (resolve, reject) {
      obj[method].apply(obj, args.concat([function (err, result) {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      }]));
    });
  };
}

var Datastore = function () {
  function Datastore() {
    var _this = this;

    var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

    _classCallCheck(this, Datastore);

    this.store = _googleCloud2.default.datastore({ projectId: options.projectId, keyFilename: options.keyFilename });

    this.id = options.id || 'id';
    this.kind = options.kind;
    this.events = options.events;

    // NOTE: This isn't nice, but it's the only way to give internal methods full
    //  unrestricted (no hooks) access to all methods
    ['find', 'get', 'create', 'update', 'patch', 'remove'].forEach(function (method) {
      _this[method] = function () {
        return _this['_' + method].apply(_this, arguments);
      };
    });
  }

  _createClass(Datastore, [{
    key: 'extend',
    value: function extend(obj) {
      return _uberproto2.default.extend(obj, this);
    }
  }, {
    key: '_get',
    value: function _get(id, params) {
      var _this2 = this;

      var key = this.makeKey(id, params);
      return promisify(this.store, 'get')(key).then(function (e) {
        return _this2.entityToPlain(e);
      }).then(function (entity) {
        if (!entity) {
          throw new _feathersErrors.NotFound('No record found for id \'' + id + '\'');
        }

        return entity;
      });
    }
  }, {
    key: '_create',
    value: function _create(data, params) {
      var _this3 = this;

      var entities = void 0,
          key = void 0;

      if (data.hasOwnProperty(this.id)) {
        key = this.makeKey(data[this.id], params);
      } else {
        key = this.makeKey(undefined, params);
      }

      entities = { key: key, data: data };

      // Normalize
      if (Array.isArray(data)) {
        entities = data.map(function (data) {
          return { key: key, data: data };
        });
      }

      return promisify(this.store, 'insert')(entities).then(function () {
        return entities;
      }).then(function (e) {
        return _this3.entityToPlain(e);
      });
    }
  }, {
    key: '_update',
    value: function _update(id, data) {
      var _this4 = this;

      var params = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
      var key = this.makeKey(id, params),
          entity = { key: key, data: data },
          _params$query = params.query,
          query = _params$query === undefined ? {} : _params$query,
          method = query.create ? 'upsert' : 'update';


      return promisify(this.store, method)(entity).then(function () {
        return entity;
      }).then(function (e) {
        return _this4.entityToPlain(e);
      }).catch(function (err) {
        // NOTE: Updating a not found entity will result in a bad request, rather than
        //  a not found, this gets around that, though in future should be made more
        //  secure
        if (err.code === 400 && err.message === 'no entity to update') {
          throw new _feathersErrors.NotFound('No record found for id \'' + id + '\'');
        }

        throw err;
      });
    }
  }, {
    key: '_patch',
    value: function _patch(id, data, params) {
      var _this5 = this;

      return Promise.resolve().then(function () {
        return id ? _this5._get(id, params) : _this5._find(params);
      }).then(function (results) {
        var entities = void 0,
            makeNewEntity = function makeNewEntity(current, update) {
          return {
            key: _this5.makeKey(current[_this5.id], params),
            data: Object.assign({}, current, update)
          };
        };

        if (Array.isArray(results)) {
          entities = results.map(function (current) {
            return makeNewEntity(current, data);
          });
        } else {
          entities = makeNewEntity(results, data);
        }

        return promisify(_this5.store, 'update')(entities).then(function () {
          return entities;
        });
      }).then(function (e) {
        return _this5.entityToPlain(e);
      });
    }
  }, {
    key: '_find',
    value: function _find() {
      var _this6 = this;

      var params = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

      params.query = params.query || {};

      var _params$query2 = params.query,
          ancestor = _params$query2.ancestor,
          namespace = _params$query2.namespace,
          _params$query2$kind = _params$query2.kind,
          kind = _params$query2$kind === undefined ? this.kind : _params$query2$kind,
          query = _objectWithoutProperties(_params$query2, ['ancestor', 'namespace', 'kind']),
          dsQuery = this.store.createQuery(namespace, kind),
          filters = void 0;

      if (ancestor) {
        var ancestorKey = this.makeKey(ancestor, params);
        dsQuery = dsQuery.hasAncestor(ancestorKey);
      }

      filters = Object.entries(query).reduce(function (filters, _ref) {
        var _ref2 = _slicedToArray(_ref, 2),
            key = _ref2[0],
            value = _ref2[1];

        var opMap = {
          $gt: '>',
          $gte: '>=',
          $lt: '<',
          $lte: '<=',
          '=': '='
        };

        var special = void 0;

        // Normalize
        if ((typeof value === 'undefined' ? 'undefined' : _typeof(value)) !== 'object' || value instanceof _this6.store.key().constructor) {
          value = { '=': value };
        }

        special = Object.entries(value).filter(function (_ref3) {
          var _ref4 = _slicedToArray(_ref3, 1),
              op = _ref4[0];

          return opMap[op];
        }).map(function (_ref5) {
          var _ref6 = _slicedToArray(_ref5, 2),
              op = _ref6[0],
              val = _ref6[1];

          // Try convert it into a number
          if (typeof val === 'string') {
            var valAsNum = parseFloat(val);

            if (!isNaN(valAsNum)) {
              // Its a number, assign it to original val
              val = valAsNum;
            }
          }

          return [key, opMap[op], val];
        });

        return [].concat(_toConsumableArray(filters), _toConsumableArray(special));
      }, []);

      dsQuery = filters.reduce(function (q, filter) {
        return q.filter.apply(q, _toConsumableArray(filter));
      }, dsQuery);

      return promisify(dsQuery, 'run')().then(function (e) {
        return _this6.entityToPlain(e);
      }).then(function (data) {
        if (ancestor) {
          return data.filter(function (_ref7) {
            var id = _ref7.id;
            return id !== ancestor;
          });
        }

        return data;
      });
    }
  }, {
    key: '_remove',
    value: function _remove(id, params) {
      var _this7 = this;

      return Promise.resolve().then(function () {
        return id ? _this7._get(id, params) : _this7._find(params);
      }).then(function (results) {
        var keys = void 0;

        if (Array.isArray(results)) {
          keys = results.map(function (_ref8) {
            var id = _ref8[_this7.id];
            return _this7.makeKey(id, params);
          });
        } else {
          keys = _this7.makeKey(results[_this7.id], params);
        }

        return promisify(_this7.store, 'delete')(keys).then(function () {
          return results;
        });
      });
    }
  }, {
    key: 'makeKey',
    value: function makeKey(id) {
      var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      var _params$query3 = params.query,
          query = _params$query3 === undefined ? {} : _params$query3,
          key = void 0;


      if (Array.isArray(id) || (typeof id === 'undefined' ? 'undefined' : _typeof(id)) === 'object') {
        key = this.store.key(id);
      } else {
        // Try fetching a number
        var idAsNum = parseInt(id);
        if (!isNaN(idAsNum)) {
          id = idAsNum;
        }

        key = this.store.key([this.kind, id]);
      }

      if (query.namespace) {
        key.namespace = query.namespace;
      }

      return key;
    }
  }, {
    key: 'entityToPlain',
    value: function entityToPlain(entity) {
      var _this8 = this;

      if (Array.isArray(entity)) {
        return entity.map(function (e) {
          return _this8.entityToPlain(e);
        });
      }

      if (!entity) {
        return entity;
      }

      return Object.assign({}, entity.data, _defineProperty({}, this.id, entity.key.path.slice(-1)[0]));
    }
  }]);

  return Datastore;
}();

function init(options) {
  debug('Initializing feathers-datastore plugin');
  return new Datastore(options);
}

init.Service = Datastore;
module.exports = exports['default'];