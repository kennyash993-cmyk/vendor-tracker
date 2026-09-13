require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const apiRoutes = require('./routes/api');
const { scheduleAlerts } = require('./email');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 30 } // 30 days
  })
);

// ---------- Auth ----------

function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  return res.redirect('/login.html');
}

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  const correct = process.env.APP_PASSWORD || 'changeme123';
  if (password === correct) {
    req.session.loggedIn = true;
    return res.json({ ok: true });
  }
  return res.status(401).json({ ok: false, error: 'Incorrect password' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// login page itself must be reachable without auth
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// protect everything else in /public and all /api routes except login
app.use((req, res, next) => {
  if (req.path === '/login.html' || req.path === '/api/login') return next();
  return requireAuth(req, res, next);
});

app.use('/api', apiRoutes);

db.connect()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Vendor Work Tracker running at http://localhost:${PORT}`);
      scheduleAlerts();
    });
  })
  .catch((err) => {
    console.error('Could not start: failed to connect to MongoDB.');
    console.error(err.message);
    process.exit(1);
  });
