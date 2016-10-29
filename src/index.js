import gcloud from 'google-cloud';
import makeDebug from 'debug';
import Proto from 'uberproto';
import { NotFound } from 'feathers-errors';
const debug = makeDebug('feathers-datastore');

function promisify(obj, method) {
  return (...args) => {
    return new Promise((resolve, reject) => {
      obj[method](...args, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  };
}

class Datastore {
  constructor(options = {}) {
    this.store = gcloud.datastore({ projectId: options.projectId, keyFilename: options.keyFilename });

    this.id = options.id || 'id';
    this.kind = options.kind;
    this.events = options.events;

    // NOTE: This isn't nice, but it's the only way to give internal methods full
    //  unrestricted (no hooks) access to all methods
    [
      'find',
      'get',
      'create',
      'update',
      'patch',
      'remove'
    ].forEach(method => {
      this[method] = (...args) => this[`_${method}`](...args);
    });
  }

  extend(obj) {
    return Proto.extend(obj, this);
  }

  _get(id, params) {
    let key = this.makeKey(id, params);
    return promisify(this.store, 'get')(key)
      .then(e => this.entityToPlain(e))
      .then(entity => {
        if (!entity) {
          throw new NotFound(`No record found for id '${id}'`);
        }

        return entity;
      });
  }

  _create(data, params) {
    let entities,
        key;

    if (data.hasOwnProperty(this.id)) {
      key = this.makeKey(data[this.id], params);
    } else {
      key = this.makeKey(undefined, params);
    }

    entities = { key, data };

    // Normalize
    if (Array.isArray(data)) {
      entities = data.map(data => ({ key, data }));
    }

    return promisify(this.store, 'insert')(entities)
      .then(() => entities)
      .then(e => this.entityToPlain(e));
  }

  _update(id, data, params = {}) {
    let key = this.makeKey(id, params),
        entity = { key, data },
        { query = {} } = params,
        method = query.create ? 'upsert' : 'update';

    return promisify(this.store, method)(entity)
      .then(() => entity)
      .then(e => this.entityToPlain(e))
      .catch(err => {
        // NOTE: Updating a not found entity will result in a bad request, rather than
        //  a not found, this gets around that, though in future should be made more
        //  secure
        if (err.code === 400 && err.message === 'no entity to update') {
          throw new NotFound(`No record found for id \'${id}'`);
        }

        throw err;
      });
  }

  _patch(id, data, params) {

    return Promise.resolve()
      .then(() => id ? this._get(id, params) : this._find(params))
      .then(results => {
        let entities,
            makeNewEntity = (current, update) => {
              return {
                key: this.makeKey(current[ this.id ], params),
                data: Object.assign({}, current, update)
              };
            };

        if (Array.isArray(results)) {
          entities = results.map(current => makeNewEntity(current, data));
        } else {
          entities = makeNewEntity(results, data);
        }

        return promisify(this.store, 'update')(entities)
          .then(() => entities);
      })
      .then(e => this.entityToPlain(e));
  }

  _find(params = {}) {
    params.query = params.query || {};

    let { ancestor, namespace, kind = this.kind, ...query } = params.query,
        dsQuery = this.store.createQuery(namespace, kind),
        filters;

    if (ancestor) {
      let ancestorKey = this.makeKey(ancestor, params);
      dsQuery = dsQuery.hasAncestor(ancestorKey);
    }

    filters = Object.entries(query)
      .reduce((filters, [key, value]) => {
        const opMap = {
          $gt: '>',
          $gte: '>=',
          $lt: '<',
          $lte: '<=',
          '=': '='
        };

        let special;

        // Normalize
        if (typeof value !== 'object' || value instanceof this.store.key().constructor) {
          value = { '=': value };
        }

        special = Object.entries(value)
          .filter(([ op ]) => opMap[op])
          .map(([ op, val ]) => {
            // Try convert it into a number
            if (typeof val === 'string') {
              let valAsNum = parseFloat(val);

              if (!isNaN(valAsNum)) {
                // Its a number, assign it to original val
                val = valAsNum;
              }
            }

            return [ key, opMap[op], val ];
          });

        return [...filters, ...special];
      }, []);

    dsQuery = filters.reduce((q, filter) => q.filter(...filter), dsQuery);

    return promisify(dsQuery, 'run')()
      .then(e => this.entityToPlain(e))
      .then(data => {
        if (ancestor) {
          return data.filter(({ id }) => id !== ancestor);
        }

        return data;
      });
  }

  _remove(id, params) {
    return Promise.resolve()
      .then(() => id ? this._get(id, params) : this._find(params))
      .then(results => {
        let keys;

        if (Array.isArray(results)) {
          keys = results.map(({ [ this.id ]: id }) => this.makeKey(id, params));
        } else {
          keys = this.makeKey(results[ this.id ], params);
        }

        return promisify(this.store, 'delete')(keys)
          .then(() => results);
      });
  }

  makeKey(id, params = {}) {
    let { query = {} } = params,
        key;

    if (Array.isArray(id) || typeof id === 'object') {
      key = this.store.key(id);
    } else {
      // Try fetching a number
      let idAsNum = parseInt(id);
      if (!isNaN(idAsNum)) {
        id = idAsNum;
      }

      key = this.store.key([ this.kind, id ]);
    }

    if (query.namespace) {
      key.namespace = query.namespace;
    }

    return key;
  }

  entityToPlain(entity) {
    if (Array.isArray(entity)) {
      return entity.map(e => this.entityToPlain(e));
    }

    if (!entity) {
      return entity;
    }

    return Object.assign({}, entity.data, { [ this.id ]: entity.key.path.slice(-1)[0] });
  }
}

export default function init(options) {
  debug('Initializing feathers-datastore plugin');
  return new Datastore(options);
}

init.Service = Datastore;
