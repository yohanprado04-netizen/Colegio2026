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

    // Validar que el usuario siga existiendo y no esté bloqueado
    const user = await Usuario.findOne({ id: decoded.id });
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
    if (user.blocked) return res.status(403).json({ error: 'Cuenta bloqueada' });

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Sesión expirada', expired: true });
    }
    return res.status(401).json({ error: 'Token inválido' });
  }
};

// Guardia de roles
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Acceso no autorizado' });
  }
  next();
};

module.exports = { authMiddleware, requireRole };
