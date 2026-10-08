const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const {
  PROJECT_STATUS,
  asyncHandler,
  parseId,
  escapeLike,
  validateProject,
  buildUpdate,
} = require('../utils/helpers');

const router = express.Router();
router.use(auth); // every route in this file needs login

const COLUMNS = {
  name: 'name',
  description: 'description',
  status: 'status',
  startDate: 'start_date',
  endDate: 'end_date',
};

const SELECT_PROJECT = `
  SELECT p.id, p.name, p.description, p.status,
         p.start_date AS "startDate", p.end_date AS "endDate",
         p.created_at AS "createdAt",
         COUNT(t.id)::int AS "totalTasks",
         COUNT(t.id) FILTER (WHERE t.status = 'Completed')::int AS "completedTasks"
  FROM projects p
  LEFT JOIN tasks t ON t.project_id = p.id`;

// "AND p.user_id" is what stops users from seeing other people's projects
async function getProject(id, userId) {
  const result = await pool.query(
    `${SELECT_PROJECT} WHERE p.id = $1 AND p.user_id = $2 GROUP BY p.id`,
    [id, userId]
  );
  return result.rows[0];
}

// GET /api/projects?search=&status=
router.get('/', asyncHandler(async (req, res) => {
  const { search, status } = req.query;
  const params = [req.user.id];
  let where = 'WHERE p.user_id = $1';

  if (typeof search === 'string' && search.trim()) {
    params.push(`%${escapeLike(search.trim())}%`);
    where += ` AND p.name ILIKE $${params.length}`;
  }
  if (status !== undefined) {
    if (!PROJECT_STATUS.includes(status)) {
      return res.status(400).json({ message: `Status must be one of: ${PROJECT_STATUS.join(', ')}` });
    }
    params.push(status);
    where += ` AND p.status = $${params.length}`;
  }

  const result = await pool.query(
    `${SELECT_PROJECT} ${where} GROUP BY p.id ORDER BY p.created_at DESC`,
    params
  );
  res.json(result.rows);
}));

// GET /api/projects/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid project id' });

  const project = await getProject(id, req.user.id);
  if (!project) return res.status(404).json({ message: 'Project not found' });
  res.json(project);
}));

// POST /api/projects
router.post('/', asyncHandler(async (req, res) => {
  const { errors, data } = validateProject(req.body, true);
  if (errors.length) return res.status(400).json({ message: 'Validation failed', errors });

  const result = await pool.query(
    `INSERT INTO projects (user_id, name, description, status, start_date, end_date)
     VALUES ($1, $2, $3, COALESCE($4, 'Not Started'), $5, $6)
     RETURNING id`,
    [
      req.user.id,
      data.name,
      data.description ?? null,
      data.status ?? null,
      data.startDate ?? null,
      data.endDate ?? null,
    ]
  );
  res.status(201).json(await getProject(result.rows[0].id, req.user.id));
}));

// PUT /api/projects/:id  (send only the fields you want to change)
router.put('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid project id' });

  const { errors, data } = validateProject(req.body, false);
  if (errors.length) return res.status(400).json({ message: 'Validation failed', errors });
  if (!Object.keys(data).length) return res.status(400).json({ message: 'Nothing to update' });

  const { sets, values } = buildUpdate(data, COLUMNS);
  values.push(id, req.user.id);
  const result = await pool.query(
    `UPDATE projects SET ${sets.join(', ')}
     WHERE id = $${values.length - 1} AND user_id = $${values.length}`,
    values
  );
  if (!result.rowCount) return res.status(404).json({ message: 'Project not found' });

  res.json(await getProject(id, req.user.id));
}));

// DELETE /api/projects/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid project id' });

  const result = await pool.query(
    'DELETE FROM projects WHERE id = $1 AND user_id = $2',
    [id, req.user.id]
  );
  if (!result.rowCount) return res.status(404).json({ message: 'Project not found' });
  res.json({ message: 'Project deleted' });
}));

module.exports = router;