/**
 * fix_salones_colegioId.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Script de migración / diagnóstico para sanear la colección `salones`.
 *
 * PROBLEMA QUE RESUELVE:
 *   Si en la BD existen salones con colegioId vacío (''), nulo (null) o
 *   indefinido, el índice único { nombre, colegioId } los trata como si
 *   pertenecieran a un mismo "colegio vacío". Cuando un admin nuevo intenta
 *   crear el salón "1A" en SU colegio, Mongo lanza E11000 porque ya existe
 *   un "1A" con colegioId vacío.
 *
 *   TAMBIÉN diagnostica usuarios (admin/profe/est) sin colegioId asignado,
 *   que es la causa raíz de que los salones se creen sin tenant.
 *
 * QUÉ HACE ESTE SCRIPT:
 *   1. Lista todos los salones con colegioId vacío/nulo y los elimina.
 *   2. Detecta usuarios admin/profe/est sin colegioId y los reporta.
 *   3. Reporta los salones válidos agrupados por colegio.
 *
 * USO:
 *   node scripts/fix_salones_colegioId.js
 *
 * MODO SIMULACIÓN (sin borrar nada):
 *   DRY_RUN=true node scripts/fix_salones_colegioId.js
 *
 * REPARAR USUARIO ESPECÍFICO (asignar colegioId a un admin):
 *   FIX_USUARIO=adminc FIX_COLEGIO_ID=CARRASQUILLA node scripts/fix_salones_colegioId.js
 * ─────────────────────────────────────────────────────────────────────────────
 */
'use strict';
require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error('❌  Falta MONGO_URI en el .env');
  process.exit(1);
}

const DRY_RUN        = process.env.DRY_RUN === 'true';
const FIX_USUARIO    = process.env.FIX_USUARIO    || '';  // ej: "adminc"
const FIX_COLEGIO_ID = process.env.FIX_COLEGIO_ID || '';  // ej: "CARRASQUILLA"

// Schemas mínimos
const SalonSchema = new mongoose.Schema(
  { nombre: String, ciclo: String, colegioId: String, colegioNombre: String },
  { collection: 'salones' }
);
const Salon = mongoose.model('Salon', SalonSchema);

const UsuarioSchema = new mongoose.Schema(
  { id: String, usuario: String, nombre: String, role: String, colegioId: String, colegioNombre: String },
  { collection: 'usuarios' }
);
const Usuario = mongoose.model('Usuario', UsuarioSchema);

async function main() {
  console.log('\n🔧  fix_salones_colegioId.js — v2');
  console.log(`   Modo: ${DRY_RUN ? '🟡 DRY-RUN (sin cambios)' : '🔴 REAL (puede borrar/editar documentos)'}\n`);

  await mongoose.connect(MONGO_URI);
  console.log('✅  Conectado a MongoDB\n');

  // ── 0. Reparar usuario específico si se indicó por env ──────────────────────
  if (FIX_USUARIO && FIX_COLEGIO_ID) {
    console.log(`🔧  Reparando usuario: "${FIX_USUARIO}" → colegioId: "${FIX_COLEGIO_ID}"`);
    if (!DRY_RUN) {
      const result = await Usuario.updateOne(
        { usuario: FIX_USUARIO },
        { $set: { colegioId: FIX_COLEGIO_ID } }
      );
      if (result.matchedCount === 0) {
        console.log(`   ⚠️  Usuario "${FIX_USUARIO}" no encontrado en la BD.`);
      } else if (result.modifiedCount === 0) {
        console.log(`   ℹ️  Usuario "${FIX_USUARIO}" ya tenía colegioId asignado (sin cambios).`);
      } else {
        console.log(`   ✅ colegioId actualizado correctamente.`);
      }
    } else {
      const u = await Usuario.findOne({ usuario: FIX_USUARIO }).lean();
      if (u) {
        console.log(`   [DRY-RUN] Se actualizaría: colegioId "${u.colegioId || '(vacío)'}" → "${FIX_COLEGIO_ID}"`);
      } else {
        console.log(`   [DRY-RUN] ⚠️  Usuario "${FIX_USUARIO}" no encontrado.`);
      }
    }
    console.log('');
  }

  // ── 1. Detectar salones con colegioId problemático ──────────────────────────
  const problematicos = await Salon.find({
    $or: [
      { colegioId: { $in: [null, '', undefined] } },
      { colegioId: { $exists: false } },
    ],
  }).lean();

  if (problematicos.length === 0) {
    console.log('✅  No se encontraron salones con colegioId vacío o nulo. La BD está limpia.\n');
  } else {
    console.log(`⚠️   Salones con colegioId vacío/nulo encontrados: ${problematicos.length}`);
    problematicos.forEach(s =>
      console.log(`   - "${s.nombre}" (ciclo: ${s.ciclo}, _id: ${s._id}, colegioId: "${s.colegioId ?? 'null'}")`)
    );

    if (!DRY_RUN) {
      const ids = problematicos.map(s => s._id);
      const result = await Salon.deleteMany({ _id: { $in: ids } });
      console.log(`\n🗑️   Eliminados: ${result.deletedCount} salones huérfanos.\n`);
    } else {
      console.log('\n   (DRY_RUN activo — no se borró nada)\n');
    }
  }

  // ── 2. Detectar usuarios admin/profe/est sin colegioId ──────────────────────
  const usuariosSinColegio = await Usuario.find({
    role: { $in: ['admin', 'profe', 'est'] },
    $or: [
      { colegioId: { $in: [null, '', undefined] } },
      { colegioId: { $exists: false } },
    ],
  }).lean();

  if (usuariosSinColegio.length === 0) {
    console.log('✅  Todos los usuarios tienen colegioId asignado.\n');
  } else {
    console.log(`⚠️   Usuarios SIN colegioId (causa raíz del bug): ${usuariosSinColegio.length}`);
    usuariosSinColegio.forEach(u =>
      console.log(`   - usuario="${u.usuario}" | nombre="${u.nombre}" | role=${u.role} | _id=${u._id}`)
    );
    console.log('\n   👉 Para reparar un admin específico, ejecutar:');
    console.log('      FIX_USUARIO=<usuario> FIX_COLEGIO_ID=<ID_del_colegio> node scripts/fix_salones_colegioId.js\n');
  }

  // ── 3. Reporte de salones válidos agrupados por colegio ─────────────────────
  const todos = await Salon.find({ colegioId: { $nin: [null, ''] } }).lean();

  const porColegio = {};
  todos.forEach(s => {
    const key = `${s.colegioId} (${s.colegioNombre || '—'})`;
    if (!porColegio[key]) porColegio[key] = [];
    porColegio[key].push(s.nombre);
  });

  console.log('📊  Salones válidos por colegio:');
  if (Object.keys(porColegio).length === 0) {
    console.log('   (ninguno)\n');
  } else {
    Object.entries(porColegio).forEach(([colegio, salones]) => {
      console.log(`   ${colegio}: ${salones.join(', ')}`);
    });
    console.log('');
  }

  await mongoose.disconnect();
  console.log('🏁  Listo.\n');
}

main().catch(err => {
  console.error('❌  Error:', err.message);
  process.exit(1);
});