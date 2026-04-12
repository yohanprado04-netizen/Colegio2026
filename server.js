// server.js — Servidor principal EduSistema Pro
'use strict';
require('dotenv').config();
const express   = require('express');
const mongoose  = require('mongoose');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const path      = require('path');
const connectDB = require('./config/db');

const app = express();

// ─── Archivos estáticos ───────────────────────────────────────────
app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ─── Seguridad ───────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

// ─── CORS ────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://colegio2026.onrender.com',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  // Agrega aquí tu dominio de producción si aplica
  process.env.FRONTEND_URL,
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Permitir requests sin origin (apps móviles, Postman, curl)
    if (!origin || origin === 'null') return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    // En desarrollo permitir cualquier localhost
    if (process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1)/.test(origin)) {
      return callback(null, true);
    }
    console.warn('[CORS] Origen bloqueado:', origin);
    callback(new Error('CORS: origen no permitido — ' + origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200, // Compatibilidad con browsers antiguos
};
app.use(cors(corsOptions));
// Pre-flight para todas las rutas
app.options('*', cors(corsOptions));
app.set('trust proxy', 1); // Confiar en el proxy de Render

// ─── Rate limiting ────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Intenta en 15 minutos.' },
  skip: (req) => req.path === '/health', // No limitar health checks
});
app.use(limiter);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Demasiados intentos de login. Espera 15 minutos.' },
});

// ─── Body parsing ─────────────────────────────────────────────────
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// ══════════════════════════════════════════════════════════════════
// 🔒 SECURITY: NoSQL Injection sanitization
// Elimina operadores MongoDB ($where, $gt, $regex, etc.) de req.body,
// req.query y req.params antes de que lleguen a cualquier ruta.
// Previene ataques tipo: { "usuario": { "$gt": "" }, "password": "x" }
// que burlarían la autenticación en mongoose queries.
// ══════════════════════════════════════════════════════════════════
function stripMongoOperators(obj, depth = 0) {
  if (depth > 10) return obj; // evitar recursión infinita
  if (Array.isArray(obj)) {
    return obj.map(item => stripMongoOperators(item, depth + 1));
  }
  if (obj !== null && typeof obj === 'object') {
    const clean = {};
    for (const key of Object.keys(obj)) {
      // Eliminar cualquier clave que empiece con $ (operadores Mongo)
      if (key.startsWith('$')) {
        console.warn(`[SEC] 🚨 NoSQL injection bloqueado — clave: "${key}"`);
        continue;
      }
      clean[key] = stripMongoOperators(obj[key], depth + 1);
    }
    return clean;
  }
  return obj;
}

app.use((req, res, next) => {
  if (req.body)   req.body   = stripMongoOperators(req.body);
  if (req.query)  req.query  = stripMongoOperators(req.query);
  if (req.params) req.params = stripMongoOperators(req.params);
  next();
});

// 🔒 SECURITY: Prevenir prototype pollution
// Bloquea payloads que intenten contaminar Object.prototype
app.use((req, res, next) => {
  const body = JSON.stringify(req.body || {});
  if (body.includes('__proto__') || body.includes('constructor') && body.includes('prototype')) {
    console.warn(`[SEC] 🚨 Prototype pollution bloqueado desde IP: ${req.ip}`);
    return res.status(400).json({ error: 'Payload inválido' });
  }
  next();
});

// ─── Logger de requests (solo en desarrollo) ─────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - start;
      const color = res.statusCode >= 400 ? '\x1b[31m' : '\x1b[32m';
      console.log(`${color}[${res.statusCode}]\x1b[0m ${req.method} ${req.path} — ${ms}ms`);
    });
    next();
  });
}

// ─── Rutas API ────────────────────────────────────────────────────
app.use('/api/auth',        loginLimiter, require('./routes/auth'));
app.use('/api/superadmin',               require('./routes/superadmin'));
app.use('/api/sugerencias',              require('./routes/sugerencias'));
app.use('/api/db',                       require('./routes/db'));
app.use('/api',                          require('./routes/api'));

// ─── Health check ─────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    db:     mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: Math.floor(process.uptime()) + 's',
    ts:     new Date().toISOString(),
    env:    process.env.NODE_ENV || 'development',
  });
});

// ─── 404 handler ─────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
});

// ─── Error handler global ─────────────────────────────────────────
app.use((err, req, res, next) => {
  // Errores de CORS
  if (err.message && err.message.startsWith('CORS')) {
    return res.status(403).json({ error: err.message });
  }
  console.error('[Server error]', err.message);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ─── Iniciar servidor ─────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

// 🔒 SECURITY: Capturar errores no manejados para evitar crash del servidor
// y evitar que stack traces se expongan en producción
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err.message);
  // No hacer process.exit() — dejar que el servidor siga corriendo
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection:', reason?.message || reason);
});

(async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`\n🚀 Servidor en puerto ${PORT}`);
    console.log(`📡 Health: http://localhost:${PORT}/health`);
    console.log(`🌐 Orígenes CORS permitidos: ${ALLOWED_ORIGINS.join(', ')}`);
    console.log(`🔑 JWT_SECRET configurado: ${!!process.env.JWT_SECRET}`);
    if (!process.env.JWT_SECRET) {
      console.warn('⚠️  ADVERTENCIA: JWT_SECRET no está en .env, usando valor por defecto. ¡No usar en producción!');
    }
  });
})();