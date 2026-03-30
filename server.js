// server.js — Servidor principal EduSistema Pro
require('dotenv').config();
const express    = require('express');
const mongoose   = require('mongoose');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const connectDB  = require('./config/db');

const app = express();

// ─── Seguridad ───────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

const corsOptions = {
  origin: function (origin, callback) {
    const allowed = [
      process.env.FRONTEND_URL || 'https://tu-pagina.onrender.com',
      'http://127.0.0.1:5500',
      'http://localhost:3000',
      // Agrega aquí tu dominio de producción, ej: 'https://tuescuela.com'
    ];
    // Permitir archivos abiertos directamente desde disco (origin es null o undefined)
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

// Rate limiting — protección contra ataques de fuerza bruta
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Intenta en 15 minutos.' },
});
app.use(limiter);

// Rate limit estricto solo para login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Demasiados intentos de login. Espera 15 minutos.' },
});

// ─── Body parser ─────────────────────────────────────────────────
// Aumentar límite para soportar archivos en base64 (talleres, planes)
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// ─── Rutas ───────────────────────────────────────────────────────
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
    console.log(`\n🚀 EduSistema Pro Backend corriendo en http://localhost:${PORT}`);
    console.log(`📡 Health check: http://localhost:${PORT}/health`);
    console.log(`🌍 CORS permitido para: ${process.env.FRONTEND_URL}`);
  });
})();
