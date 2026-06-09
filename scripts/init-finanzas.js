#!/usr/bin/env node
// scripts/init-finanzas.js
// ─────────────────────────────────────────────────────────────────────────────
// Crea el primer usuario finAdmin de un colegio.
//
// Windows PowerShell:
//   $env:FIN_COLEGIO_ID="col_1780002622502"; node scripts/init-finanzas.js
//
// O edita directamente la sección CONFIGURACIÓN MANUAL abajo.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

// ══════════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN MANUAL — edita estos valores si no usas variables de entorno
// ══════════════════════════════════════════════════════════════════════════════
const MANUAL = {
  colegioId: 'col_1780002622502',
  usuario:   'luismoreno',
  password:  'luis026',
  nombre:    'Administrador Financiero CEPA',
  role:      'finAdmin',
  reset:     true,   // ← fuerza reset de contraseña si el usuario ya existe
};
// ══════════════════════════════════════════════════════════════════════════════

// Variables de entorno sobreescriben la configuración manual
const CONFIG = {
  colegioId: process.env.FIN_COLEGIO_ID || MANUAL.colegioId,
  usuario:   process.env.FIN_USUARIO    || MANUAL.usuario,
  password:  process.env.FIN_PASSWORD   || MANUAL.password,
  nombre:    process.env.FIN_NOMBRE     || MANUAL.nombre,
  role:      process.env.FIN_ROLE       || MANUAL.role,
  reset:     process.env.FIN_RESET === '1' || MANUAL.reset,
};

// ── Schemas mínimos para el script ───────────────────────────────────────────
const ColegioSchema = new mongoose.Schema({
  id: String, nombre: String, activo: Boolean,
}, { collection: 'colegios' });

const FinUsuarioSchema = new mongoose.Schema({
  id:            { type: String, required: true, unique: true },
  nombre:        String,
  usuario:       { type: String, required: true, unique: true },
  password:      String,
  role:          { type: String, enum: ['finAdmin','finUser'], default: 'finAdmin' },
  colegioId:     String,
  colegioNombre: String,
  blocked:       { type: Boolean, default: false },
  createdBy:     String,
}, { timestamps: true, collection: 'fin_usuarios' });

async function main() {
  if (!CONFIG.colegioId) {
    console.error('\n❌ ERROR: Debes especificar el colegioId.');
    console.error('   Edita la sección CONFIGURACIÓN MANUAL en el script.');
    console.error('   O en PowerShell: $env:FIN_COLEGIO_ID="col_xxx"; node scripts/init-finanzas.js\n');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('\n❌ ERROR: MONGODB_URI no está definida en .env\n');
    process.exit(1);
  }

  console.log('\n🔌 Conectando a MongoDB...');
  await mongoose.connect(uri, {
    dbName: process.env.DB_NAME || 'edusistema',
    serverSelectionTimeoutMS: 10000,
  });
  console.log('✅ Conectado a:', mongoose.connection.name);

  const Colegio    = mongoose.model('Colegio',    ColegioSchema);
  const FinUsuario = mongoose.model('FinUsuario', FinUsuarioSchema);

  // 1. Verificar que el colegio existe
  const col = await Colegio.findOne({ id: CONFIG.colegioId }).lean();
  if (!col) {
    console.error(`\n❌ Colegio "${CONFIG.colegioId}" no encontrado en la BD.\n`);
    console.error('   Colegios disponibles:');
    const todos = await Colegio.find({}, 'id nombre').lean();
    todos.forEach(c => console.error(`     • ${c.id}  →  ${c.nombre}`));
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`✅ Colegio encontrado: ${col.nombre}`);

  // 2. Verificar si ya existe el usuario
  const existe = await FinUsuario.findOne({ usuario: CONFIG.usuario }).lean();
  if (existe) {
    console.log(`\n⚠️  El usuario "${CONFIG.usuario}" ya existe en fin_usuarios.`);
    console.log(`   Colegio: ${existe.colegioNombre} | Rol: ${existe.role}`);
    console.log('\n   Si quieres resetear la contraseña, usa:');
    console.log(`   FIN_USUARIO=${CONFIG.usuario} FIN_RESET=1 node scripts/init-finanzas.js\n`);

    if (process.env.FIN_RESET === '1' || CONFIG.reset) {
      const hashed = await bcrypt.hash(CONFIG.password, 12);
      await FinUsuario.updateOne({ usuario: CONFIG.usuario }, { $set: { password: hashed, blocked: false } });
      console.log('✅ Contraseña reseteada correctamente.\n');
    }

    await mongoose.disconnect();
    process.exit(0);
  }

  // 3. Crear el usuario finAdmin
  const hashed = await bcrypt.hash(CONFIG.password, 12);
  const nuevoId = 'fin_' + Date.now();

  await FinUsuario.create({
    id:            nuevoId,
    nombre:        CONFIG.nombre,
    usuario:       CONFIG.usuario,
    password:      hashed,
    role:          CONFIG.role,
    colegioId:     CONFIG.colegioId,
    colegioNombre: col.nombre,
    blocked:       false,
    createdBy:     'init-script',
  });

  console.log('\n✅ Usuario financiero creado exitosamente:\n');
  console.log(`   ID:        ${nuevoId}`);
  console.log(`   Nombre:    ${CONFIG.nombre}`);
  console.log(`   Usuario:   ${CONFIG.usuario}`);
  console.log(`   Password:  ${CONFIG.password}  ← GUÁRDALA`);
  console.log(`   Rol:       ${CONFIG.role}`);
  console.log(`   Colegio:   ${col.nombre} (${CONFIG.colegioId})\n`);
  console.log('   → Inicia sesión en la app con estas credenciales.\n');
  console.log('   → Desde el panel del superadmin (💰 Módulo Financiero)');
  console.log('     puedes crear más usuarios finAdmin y finUser.\n');

  await mongoose.disconnect();
  console.log('🔌 Desconectado de MongoDB.\n');
}

main().catch(err => {
  console.error('\n❌ Error inesperado:', err.message);
  mongoose.disconnect();
  process.exit(1);
});