const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const {
  TASK_STATUS,
  PRIORITY,
  asyncHandler,
  parseId,
  escapeLike,
  validateTask,
  buildUpdate,
} = require('../utils/helpers');

const router = express.Router();
router.use(auth);

const COLUMNS = {
  name: 'name',
  description: 'description',
  priority: 'priority',
  status: 'status',
  dueDate: 'due_date',
};

// Tasks have no user_id. We find the owner by joining to the project.
const SELECT_TASK = `
  SELECT t.id, t.project_id AS "projectId", p.name AS "projectName",
         t.name, t.description, t.priority, t.status,
         t.due_date AS "dueDate", t.created_at AS "createdAt"
  FROM tasks t
  JOIN projects p ON p.id = t.project_id`;

async function getTask(id, userId) {
  const result = await pool.query(
    `${SELECT_TASK} WHERE t.id = $1 AND p.user_id = $2`,
    [id, userId]
  );
  return result.rows[0];
}

// GET /api/tasks?projectId=&search=&status=&priority=
router.get('/', asyncHandler(async (req, res) => {
  const { projectId, search, status, priority } = req.query;
  const params = [req.user.id];
  let where = 'WHERE p.user_id = $1';

  if (projectId !== undefined) {
    const pid = parseId(projectId);
    if (!pid) return res.status(400).json({ message: 'Invalid projectId' });
    params.push(pid);
    where += ` AND t.project_id = $${params.length}`;
  }
  if (typeof search === 'string' && search.trim()) {
    params.push(`%${escapeLike(search.trim())}%`);
    where += ` AND t.name ILIKE $${params.length}`;
  }
  if (status !== undefined) {
    if (!TASK_STATUS.includes(status)) {
      return res.status(400).json({ message: `Status must be one of: ${TASK_STATUS.join(', ')}` });
    }
    params.push(status);
    where += ` AND t.status = $${params.length}`;
  }
  if (priority !== undefined) {
    if (!PRIORITY.includes(priority)) {
      return res.status(400).json({ message: `Priority must be one of: ${PRIORITY.join(', ')}` });
    }
    params.push(priority);
    where += ` AND t.priority = $${params.length}`;
  }

  const result = await pool.query(
    `${SELECT_TASK} ${where} ORDER BY t.created_at DESC`,
    params
  );
  res.json(result.rows);
}));

// GET /api/tasks/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid task id' });

  const task = await getTask(id, req.user.id);
  if (!task) return res.status(404).json({ message: 'Task not found' });
  res.json(task);
}));

// POST /api/tasks  (body must include projectId)
router.post('/', asyncHandler(async (req, res) => {
  const { errors, data } = validateTask(req.body, true);
  const projectId = parseId(String((req.body || {}).projectId));
  if (!projectId) errors.push('A valid projectId is required');
  if (errors.length) return res.status(400).json({ message: 'Validation failed', errors });

  // The project must belong to the logged-in user
  const owned = await pool.query(
    'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
    [projectId, req.user.id]
  );
  if (!owned.rowCount) return res.status(404).json({ message: 'Project not found' });

  const result = await pool.query(
    `INSERT INTO tasks (project_id, name, description, priority, status, due_date)
     VALUES ($1, $2, $3, COALESCE($4, 'Medium'), COALESCE($5, 'Pending'), $6)
     RETURNING id`,
    [
      projectId,
      data.name,
      data.description ?? null,
      data.priority ?? null,
      data.status ?? null,
      data.dueDate ?? null,
    ]
  );
  res.status(201).json(await getTask(result.rows[0].id, req.user.id));
}));

// PUT /api/tasks/:id  (send only the fields you want to change)
router.put('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid task id' });

  const { errors, data } = validateTask(req.body, false);
  if (errors.length) return res.status(400).json({ message: 'Validation failed', errors });
  if (!Object.keys(data).length) return res.status(400).json({ message: 'Nothing to update' });

  const { sets, values } = buildUpdate(data, COLUMNS);
  values.push(id, req.user.id);
  const result = await pool.query(
    `UPDATE tasks SET ${sets.join(', ')}
     WHERE id = $${values.length - 1}
       AND project_id IN (SELECT id FROM projects WHERE user_id = $${values.length})`,
    values
  );
  if (!result.rowCount) return res.status(404).json({ message: 'Task not found' });

  res.json(await getTask(id, req.user.id));
}));

// DELETE /api/tasks/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid task id' });

  const result = await pool.query(
    `DELETE FROM tasks
     WHERE id = $1
       AND project_id IN (SELECT id FROM projects WHERE user_id = $2)`,
    [id, req.user.id]
  );
  if (!result.rowCount) return res.status(404).json({ message: 'Task not found' });
  res.json({ message: 'Task deleted' });
}));

module.exports = router;