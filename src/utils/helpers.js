const crypto = require('crypto');

function generateId(prefix = '') {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return prefix ? `${prefix}-${timestamp}-${random}` : `${timestamp}-${random}`;
}

function now() {
  return new Date().toISOString();
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result.toISOString();
}

function isOverdue(dueDate) {
  return new Date() > new Date(dueDate);
}

function parseQueryInt(value, defaultValue) {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function buildResponse(success, data = null, error = null) {
  return {
    success,
    ...(data !== null && { data }),
    ...(error !== null && { error })
  };
}

module.exports = {
  generateId,
  now,
  addDays,
  isOverdue,
  parseQueryInt,
  buildResponse
};
