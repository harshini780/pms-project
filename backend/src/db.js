require('dotenv').config();
const { Pool, types } = require('pg');

// Return DATE columns as plain text like "2026-10-09", not JavaScript Date objects
types.setTypeParser(1082, (value) => value);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = pool;