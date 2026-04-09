// middleware/auth.js — Verificación de JWT
const jwt = require('jsonwebtoken');
const { Usuario } = require('../models');

const authMiddleware = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token no provisto' });
    }

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await Usuario.findOne({ id: decoded.id });
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
    if (user.blocked) return res.status(403).json({ error: 'Cuenta bloqueada' });

    req.user = user;
    // Inyectar colegioId para filtrado automático en rutas normales
    req.colegioId = user.colegioId || null;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Sesión expirada', expired: true });
    }
    return res.status(401).json({ error: 'Token inválido' });
  }
};

// Alias para las rutas de superadmin
const verifyToken = authMiddleware;

// Guardia de roles (acepta uno o varios)
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Acceso no autorizado' });
  }
  next();
};

// Solo superadmin puede ver datos entre colegios;
// admin/profe/est ven solo su colegioId
const scopeFilter = (req) => {
  if (req.user.role === 'superadmin') return {};
  return { colegioId: req.user.colegioId };
};

module.exports = { authMiddleware, verifyToken, requireRole, scopeFilter };
