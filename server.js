// server.js — Servidor principal EduSistema Pro
require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const helmet   = require('helmet');
const rateLimit = require('express-rate-limit');
const path     = require('path');
const connectDB = require('./config/db');

const app = express();

// ─── Servir frontend estático ─────────────────────────────────────
app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ─── Seguridad ───────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

const corsOptions = {
  origin: function (origin, callback) {
    const allowed = [
      'https://colegio2026.onrender.com',
      'http://localhost:5500',
      'http://127.0.0.1:5500',
      'http://localhost:3001',
    ];
    if (!origin || origin === 'null' || allowed.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('CORS: origen no permitido — ' + origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));

// ─── Rate limiting ───────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Intenta en 15 minutos.' },
});
app.use(limiter);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Demasiados intentos de login. Espera 15 minutos.' },
});

// ─── Body parser ─────────────────────────────────────────────────
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// ─── Rutas API ───────────────────────────────────────────────────
app.use('/api/auth', loginLimiter, require('./routes/auth'));
app.use('/api/db',                 require('./routes/db'));
app.use('/api',                    require('./routes/api'));

// ─── Health check ────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: Math.floor(process.uptime()) + 's',
    timestamp: new Date().toISOString(),
  });
});

// ─── 404 ─────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
});

// ─── Error handler ───────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ─── Inicio ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

(async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`\n🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`📡 Health check: /health`);
  });
})();
