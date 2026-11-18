'use strict';
/**
 * Test harness: runs the REAL controllers/services against in-memory fakes of the Mongoose models and S3,
 * so the status-transition logic can be tested without MongoDB, AWS or third-party packages.
 * The fakes implement the Mongo features the code relies on: conditional updateOne / findOneAndUpdate
 * ($set, $unset, $in, $ne, $exists), sort, and the unique (fileId, payloadHash) index (E11000).
 * LIMIT: this proves the application logic, not MongoDB/S3 behaviour itself. See the testing report.
 */
const path = require('path');
const Module = require('module');

Object.assign(process.env, {
  MONGO_URI: 'mongodb://localhost/test', JWT_SECRET: 'x'.repeat(40), AWS_REGION: 'ap-southeast-2',
  S3_BUCKET: 'test-bucket', LAMBDA_API_KEY: 'y'.repeat(30), FRONTEND_URL: 'http://localhost:3000', NODE_ENV: 'test',
  MAX_FILE_SIZE_MB: '1',
});

const root = path.resolve(__dirname, '../..');
let seq = 1;
const nextId = () => new Id(String(seq++).padStart(24, '0'));
class Id {
  constructor(v) { this.v = String(v); }
  equals(o) { return String(o) === this.v; }
  toString() { return this.v; }
  toHexString() { return this.v; }
}
const clone = (o) => Object.assign(Object.create(Object.getPrototypeOf(o)), o);
const same = (a, b) => String(a) === String(b);

function matches(doc, filter) {
  return Object.entries(filter).every(([k, cond]) => {
    const v = doc[k];
    if (cond && typeof cond === 'object' && !(cond instanceof Id) && !(cond instanceof Date)) {
      if ('$in' in cond) return cond.$in.some((x) => same(x, v));
      if ('$ne' in cond) return !same(cond.$ne, v);
      if ('$exists' in cond) return (v !== undefined) === cond.$exists;
      if ('$gte' in cond) return v >= cond.$gte;
      return false;
    }
    return same(cond, v);
  });
}
function applyUpdate(doc, upd) {
  Object.assign(doc, upd.$set || {});
  Object.keys(upd.$unset || {}).forEach((k) => { delete doc[k]; });
}

// ---- generic in-memory collection --------------------------------------------------------------
function makeModel(defaults, { unique } = {}) {
  const store = [];
  const hooks = {};
  class Doc {
    constructor(o = {}) { Object.assign(this, defaults(), o); if (!this._id) this._id = nextId(); }
    async save() {
      if (unique) {
        const dup = store.find((d) => !same(d._id, this._id) && unique(d, this));
        if (dup) throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
      }
      const i = store.findIndex((d) => same(d._id, this._id));
      if (i >= 0) store[i] = clone(this); else store.push(clone(this));
      return this;
    }
    toObject() { return { ...this }; }
  }
  const query = (compute) => {
    const q = { _sort: null, sort(s) { this._sort = s; return this; }, lean() { return this; }, select() { return this; },
      then(res, rej) { return Promise.resolve().then(() => compute(this._sort)).then(res, rej); } };
    return q;
  };
  const sorted = (arr, s) => {
    if (!s) return arr;
    const [[k, dir]] = Object.entries(s);
    return [...arr].sort((a, b) => ((a[k] ?? a.createdAt) > (b[k] ?? b.createdAt) ? 1 : -1) * dir);
  };
  Doc.store = store;
  Doc.hooks = hooks;
  Doc.reset = () => { store.length = 0; Object.keys(hooks).forEach((k) => delete hooks[k]); };
  Doc.create = async (o) => new Doc(o).save();
  Doc.findById = (id) => query(() => { const d = store.find((x) => same(x._id, id)); return d ? new Doc(clone(d)) : null; });
  Doc.findOne = (f) => query((s) => { const r = sorted(store.filter((d) => matches(d, f)), s)[0]; return r ? new Doc(clone(r)) : null; });
  Doc.find = (f = {}) => query((s) => sorted(store.filter((d) => matches(d, f)), s).map((d) => new Doc(clone(d))));
  Doc.exists = (f) => query(() => (store.some((d) => matches(d, f)) ? { _id: 1 } : null));
  Doc.countDocuments = (f = {}) => query(() => store.filter((d) => matches(d, f)).length);
  Doc.updateOne = async (f, upd) => {
    if (hooks.beforeUpdateOne) await hooks.beforeUpdateOne(f, upd);
    const d = store.find((x) => matches(x, f)); if (!d) return { modifiedCount: 0 };
    applyUpdate(d, upd); return { modifiedCount: 1 };
  };
  Doc.updateMany = async (f, upd) => {
    const hit = store.filter((d) => matches(d, f)); hit.forEach((d) => applyUpdate(d, upd.$set ? upd : { $set: upd })); return { modifiedCount: hit.length };
  };
  Doc.findOneAndUpdate = async (f, upd) => {
    const d = store.find((x) => matches(x, f)); if (!d) return null;
    applyUpdate(d, upd);
    const out = new Doc(clone(d));
    if (hooks.afterFindOneAndUpdate) await hooks.afterFindOneAndUpdate(out);
    return out;
  };
  return Doc;
}

let tick = 0;
const stamp = () => new Date(1700000000000 + (tick += 1000));
const File = makeModel(() => ({ status: 'UPLOADING', classification: 'PUBLIC', riskScore: 0, dlpSeverity: 'NONE', createdAt: stamp() }));
const DlpResult = makeModel(() => ({ scanStatus: 'PENDING', severity: 'NONE', detectedTypes: [], matchCounts: {}, createdAt: stamp() }),
  { unique: (a, b) => a.payloadHash && a.payloadHash === b.payloadHash && same(a.fileId, b.fileId) });
const SecurityEvent = makeModel(() => ({ createdAt: stamp() }));
const AuditLog = makeModel(() => ({ createdAt: new Date() }));
const SharingLink = makeModel(() => ({}));
const User = makeModel(() => ({ isActive: true }));
const SecurityPolicy = makeModel(() => ({}));

// ---- fake S3 ------------------------------------------------------------------------------------
const s3 = {
  objects: {}, deleted: [],
  put(key, o = {}) { this.objects[key] = { contentLength: 100, serverSideEncryption: 'aws:kms', kmsKeyId: 'arn:aws:kms:r:1:key/abc', eTag: '"e1"', ...o }; },
  reset() { this.objects = {}; this.deleted = []; },
  async headObject(key) { return this.objects[key] || null; },
  async deleteObject(key) { this.deleted.push(key); delete this.objects[key]; },
  async createDownloadUrl({ key }) { return `https://signed.example/${key}`; },
  async createUploadUrl() { return { uploadUrl: 'https://signed.example/put', headers: {}, expiresIn: 900 }; },
};

const STUBS = {
  'db/models/File.js': File, 'db/models/DlpResult.js': DlpResult, 'db/models/SecurityEvent.js': SecurityEvent,
  'db/models/AuditLog.js': AuditLog, 'db/models/SharingLink.js': SharingLink, 'db/models/User.js': User,
  'db/models/SecurityPolicy.js': SecurityPolicy, 'services/s3Service.js': s3,
};
const mongooseStub = { Types: { ObjectId: class { constructor() { return nextId(); } } } };
const origLoad = Module._load;
Module._load = function load(request, parent, ...rest) {
  if (request === 'mongoose') return mongooseStub;
  if (request === 'dotenv') return { config() {} };
  if (request.startsWith('@aws-sdk')) return {};
  let resolved = null;
  try { resolved = Module._resolveFilename(request, parent); } catch (e) { /* not resolvable: let node report it */ }
  if (resolved && resolved.startsWith(root)) {
    const rel = path.relative(root, resolved).split(path.sep).join('/');
    if (STUBS[rel]) return STUBS[rel];
  }
  return origLoad.call(this, request, parent, ...rest);
};

function resetAll() { [File, DlpResult, SecurityEvent, AuditLog, SharingLink, User, SecurityPolicy].forEach((m) => m.reset()); s3.reset(); }

const makeUser = (role = 'user', email) => ({ _id: nextId(), role, email: email || `${role}${seq}@demo.com`, isActive: true });

/** Invoke an Express handler (wrapped by asyncHandler) with a fake req/res. Resolves { status, body, error }. */
function call(handler, { user, params = {}, body = {}, query = {} } = {}) {
  return new Promise((resolve) => {
    const req = { user, params, body, query, id: 'test', method: 'POST', baseUrl: '/api/test', path: '/x', ip: '127.0.0.1', get: () => 'test-agent' };
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ status: this.statusCode, body: b }); return this; } };
    handler(req, res, (error) => resolve({ error, status: error && error.statusCode, code: error && error.code }));
  });
}

/** Create a File in UPLOADING state with its object in fake S3 (what upload-url + the browser PUT would produce). */
async function newUpload(owner, { name = 'a.txt', size = 100, put = {} } = {}) {
  const f = await File.create({ ownerId: owner._id, originalName: name, s3Key: `uploads/${nextId()}/${name}`, size, mimeType: 'text/plain' });
  s3.put(f.s3Key, { contentLength: size, ...put });
  return f;
}

// scanner payloads, mirroring what the Lambda sends
const PAYLOADS = {
  clean: { detectedTypes: [], matchCounts: {}, scanStatus: 'COMPLETED' },
  low: { detectedTypes: ['EMAIL'], matchCounts: { EMAIL: 2 }, scanStatus: 'COMPLETED' },
  medium: { detectedTypes: ['SALARY_KEYWORD'], matchCounts: { SALARY_KEYWORD: 1 }, scanStatus: 'COMPLETED' },
  high: { detectedTypes: ['PAN'], matchCounts: { PAN: 1 }, scanStatus: 'COMPLETED' },
  critical: { // the securecloud-test.txt case from the bug report
    detectedTypes: ['EMAIL', 'PHONE', 'PAN', 'ACCOUNT_NUMBER', 'SALARY_KEYWORD', 'CONFIDENTIAL_KEYWORD'],
    matchCounts: { EMAIL: 1, PHONE: 1, PAN: 1, ACCOUNT_NUMBER: 1, SALARY_KEYWORD: 1, CONFIDENTIAL_KEYWORD: 1 }, scanStatus: 'COMPLETED',
  },
  failed: { detectedTypes: [], matchCounts: {}, scanStatus: 'FAILED' },
  unsupported: { detectedTypes: [], matchCounts: {}, scanStatus: 'UNSUPPORTED' },
};

module.exports = { File, DlpResult, SecurityEvent, AuditLog, SharingLink, User, SecurityPolicy, s3, resetAll, makeUser, call, newUpload, PAYLOADS, Id };
