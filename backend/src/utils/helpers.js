const PROJECT_STATUS = ['Not Started', 'In Progress', 'Completed'];
const TASK_STATUS = ['Pending', 'In Progress', 'Completed'];
const PRIORITY = ['Low', 'Medium', 'High'];

// Catches errors from async routes and sends them to the error handler
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Accepts only whole numbers like "5". Rejects "abc", "5; DROP TABLE", "-1".
function parseId(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return n > 0 && n < 2147483647 ? n : null;
}

// Accepts only real dates in YYYY-MM-DD format. Rejects "2026-13-45".
function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// So that % and _ typed by the user are searched as normal characters
function escapeLike(text) {
  return text.replace(/[\\%_]/g, '\\$&');
}

function readName(b, required, data, errors) {
  if (b.name === undefined && !required) return;
  if (typeof b.name !== 'string' || !b.name.trim() || b.name.trim().length > 150) {
    errors.push('Name is required (max 150 characters)');
  } else {
    data.name = b.name.trim();
  }
}

function readDescription(b, data, errors) {
  if (b.description === undefined) return;
  if (b.description === null || b.description === '') {
    data.description = null;
  } else if (typeof b.description !== 'string' || b.description.length > 5000) {
    errors.push('Description must be text (max 5000 characters)');
  } else {
    data.description = b.description.trim();
  }
}

function readEnum(b, key, label, allowed, data, errors) {
  if (b[key] === undefined) return;
  if (!allowed.includes(b[key])) {
    errors.push(`${label} must be one of: ${allowed.join(', ')}`);
  } else {
    data[key] = b[key];
  }
}

function readDate(b, key, label, data, errors) {
  if (b[key] === undefined) return;
  if (b[key] === null || b[key] === '') {
    data[key] = null;
  } else if (!isValidDate(b[key])) {
    errors.push(`${label} must be a valid date in YYYY-MM-DD format`);
  } else {
    data[key] = b[key];
  }
}

function validateProject(body, isCreate) {
  const b = body && typeof body === 'object' ? body : {};
  const errors = [];
  const data = {};
  readName(b, isCreate, data, errors);
  readDescription(b, data, errors);
  readEnum(b, 'status', 'Status', PROJECT_STATUS, data, errors);
  readDate(b, 'startDate', 'Start date', data, errors);
  readDate(b, 'endDate', 'End date', data, errors);
  if (data.startDate && data.endDate && data.endDate < data.startDate) {
    errors.push('End date cannot be before start date');
  }
  return { errors, data };
}

function validateTask(body, isCreate) {
  const b = body && typeof body === 'object' ? body : {};
  const errors = [];
  const data = {};
  readName(b, isCreate, data, errors);
  readDescription(b, data, errors);
  readEnum(b, 'priority', 'Priority', PRIORITY, data, errors);
  readEnum(b, 'status', 'Status', TASK_STATUS, data, errors);
  readDate(b, 'dueDate', 'Due date', data, errors);
  return { errors, data };
}

// Builds "name = $1, status = $2" from a fixed list of allowed columns.
// Column names come from our own map, never from the user. Values are parameters.
function buildUpdate(data, columns) {
  const sets = [];
  const values = [];
  for (const key of Object.keys(data)) {
    values.push(data[key]);
    sets.push(`${columns[key]} = $${values.length}`);
  }
  return { sets, values };
}

module.exports = {
  PROJECT_STATUS,
  TASK_STATUS,
  PRIORITY,
  asyncHandler,
  parseId,
  escapeLike,
  validateProject,
  validateTask,
  buildUpdate,
};