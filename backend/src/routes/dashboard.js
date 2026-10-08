const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const { asyncHandler } = require('../utils/helpers');

const router = express.Router();
router.use(auth);

// GET /api/dashboard
router.get('/', asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM projects WHERE user_id = $1)::int AS "totalProjects",
       (SELECT COUNT(*) FROM projects WHERE user_id = $1 AND status = 'In Progress')::int AS "projectsInProgress",
       COUNT(t.id)::int AS "totalTasks",
       COUNT(t.id) FILTER (WHERE t.status = 'Completed')::int AS "completedTasks",
       COUNT(t.id) FILTER (WHERE t.status = 'Pending')::int AS "pendingTasks",
       COUNT(t.id) FILTER (WHERE t.status = 'In Progress')::int AS "inProgressTasks"
     FROM tasks t
     JOIN projects p ON p.id = t.project_id
     WHERE p.user_id = $1`,
    [req.user.id]
  );
  res.json(result.rows[0]);
}));

module.exports = router;