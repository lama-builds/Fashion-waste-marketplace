class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Lets async route functions throw errors that reach the error handler (works on Express 4 and 5).
const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

// Each helper pushes a readable message into `errors` and returns the cleaned value (or undefined).
function str(errors, name, v, { min = 0, max = 200, required = false, pattern, patternMsg } = {}) {
  if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
    if (required) errors.push(`${name} is required.`);
    return undefined;
  }
  if (typeof v !== 'string') { errors.push(`${name} must be text.`); return undefined; }
  const s = v.trim();
  if (s.length < min) errors.push(`${name} must be at least ${min} characters.`);
  else if (s.length > max) errors.push(`${name} must be at most ${max} characters.`);
  else if (pattern && !pattern.test(s)) errors.push(`${name} ${patternMsg || 'has an invalid format.'}`);
  return s;
}

function num(errors, name, v, { integer = false, min, max, required = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) errors.push(`${name} is required.`);
    return undefined;
  }
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) { errors.push(`${name} must be a number.`); return undefined; }
  if (integer && !Number.isInteger(n)) { errors.push(`${name} must be a whole number.`); return undefined; }
  if (min !== undefined && n < min) { errors.push(`${name} must be at least ${min}.`); return undefined; }
  if (max !== undefined && n > max) { errors.push(`${name} must be at most ${max}.`); return undefined; }
  return n;
}

function oneOf(errors, name, v, list, { required = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) errors.push(`${name} is required.`);
    return undefined;
  }
  if (!list.includes(v)) { errors.push(`${name} must be one of: ${list.join(', ')}.`); return undefined; }
  return v;
}

function uuid(errors, name, v, { required = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) errors.push(`${name} is required.`);
    return undefined;
  }
  if (!isUuid(v)) { errors.push(`${name} is not a valid id.`); return undefined; }
  return v;
}

// Throws one 400 error that lists every problem found.
function done(errors) {
  if (errors.length) throw new HttpError(400, 'Please fix the following.', errors);
}

module.exports = { HttpError, asyncH, isUuid, str, num, oneOf, uuid, done };
