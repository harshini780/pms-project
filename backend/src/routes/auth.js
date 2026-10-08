const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const pool = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// Max 20 tries per 15 minutes per IP on login and register
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: { message: 'Too many attempts. Try again after 15 minutes.' },
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function makeToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

// POST /api/auth/register
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { fullName, email, password } = req.body || {};
    const errors = [];

    if (typeof fullName !== 'string' || fullName.trim().length < 1 || fullName.trim().length > 100) {
      errors.push('Full name is required (max 100 characters)');
    }
    if (typeof email !== 'string' || !EMAIL_REGEX.test(email.trim()) || email.length > 255) {
      errors.push('A valid email is required');
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
      errors.push('Password must be 8 to 72 characters');
    }
    if (errors.length) return res.status(400).json({ message: 'Validation failed', errors });

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (full_name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, full_name, email, created_at`,
      [fullName.trim(), email.trim().toLowerCase(), passwordHash]
    );

    const user = result.rows[0];
    res.status(201).json({
      token: makeToken(user.id),
      user: { id: user.id, fullName: user.full_name, email: user.email },
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Email already registered' });
    }
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const result = await pool.query(
      'SELECT id, full_name, email, password_hash FROM users WHERE email = $1',
      [email.trim().toLowerCase()]
    );
    const user = result.rows[0];

    // Same message for wrong email and wrong password, so attackers can't guess which emails exist
    const ok = user && (await bcrypt.compare(password, user.password_hash));
    if (!ok) return res.status(401).json({ message: 'Invalid email or password' });

    res.json({
      token: makeToken(user.id),
      user: { id: user.id, fullName: user.full_name, email: user.email },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', auth, (req, res) => {
  // The app deletes the token on its side. See the note below.
  res.json({ message: 'Logged out' });
});

// GET /api/auth/me
router.get('/me', auth, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, full_name, email, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ message: 'User no longer exists' });

    res.json({ id: user.id, fullName: user.full_name, email: user.email, createdAt: user.created_at });
  } catch (err) {
    next(err);
  }
});

module.exports = router;