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
 * QUÉ HACE ESTE SCRIPT:
 *   1. Lista todos los salones con colegioId vacío/nulo.
 *   2. Los elimina (son residuos del seed demo o creaciones incorrectas).
 *   3. Reporta los salones que quedaron en la colección por colegioId.
 *
 * USO:
 *   node scripts/fix_salones_colegioId.js
 *
 * MODO SIMULACIÓN (sin borrar nada):
 *   DRY_RUN=true node scripts/fix_salones_colegioId.js
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

const DRY_RUN = process.env.DRY_RUN === 'true';

// Schema mínimo — no necesitamos el modelo completo
const SalonSchema = new mongoose.Schema(
  { nombre: String, ciclo: String, colegioId: String, colegioNombre: String },
  { collection: 'salones' }
);
const Salon = mongoose.model('Salon', SalonSchema);

async function main() {
  console.log('\n🔧  fix_salones_colegioId.js');
  console.log(`   Modo: ${DRY_RUN ? '🟡 DRY-RUN (sin cambios)' : '🔴 REAL (borrará documentos)'}\n`);

  await mongoose.connect(MONGO_URI);
  console.log('✅  Conectado a MongoDB\n');

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

  // ── 2. Reporte de salones válidos agrupados por colegio ─────────────────────
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