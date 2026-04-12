/**
 * fix_salones_nombre.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PROBLEMA QUE RESUELVE:
 *   Salones que tienen colegioNombre vacío ("") o que tienen colegioId correcto
 *   pero el nombre del colegio no quedó guardado. Esto causa confusión visual
 *   en Compass y puede indicar salones mal migrados.
 *
 *   TAMBIÉN detecta si hay estudiantes cuyo campo `salon` apunta a un nombre
 *   de salón que no existe en su propio colegio (cross-tenant data leak).
 *
 * QUÉ HACE:
 *   1. Lista salones con colegioNombre vacío agrupados por colegioId.
 *   2. Rellena colegioNombre desde la colección `colegios` usando colegioId.
 *   3. Detecta estudiantes con salon asignado a un salón de otro colegio.
 *   4. Reporta salones duplicados por nombre entre colegios distintos.
 *
 * USO:
 *   node scripts/fix_salones_nombre.js            # Modo real (corrige)
 *   DRY_RUN=true node scripts/fix_salones_nombre.js  # Solo diagnóstico
 *
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

// ── Schemas mínimos ──────────────────────────────────────────────────────────
const SalonSchema = new mongoose.Schema(
  { nombre: String, ciclo: String, colegioId: String, colegioNombre: String },
  { collection: 'salones' }
);
const Salon = mongoose.model('Salon', SalonSchema);

const ColegioSchema = new mongoose.Schema(
  { id: String, nombre: String },
  { collection: 'colegios' }
);
const Colegio = mongoose.model('Colegio', ColegioSchema);

const UsuarioSchema = new mongoose.Schema(
  { id: String, nombre: String, usuario: String, role: String,
    colegioId: String, colegioNombre: String, salon: String },
  { collection: 'usuarios' }
);
const Usuario = mongoose.model('Usuario', UsuarioSchema);

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🔧  fix_salones_nombre.js');
  console.log(`   Modo: ${DRY_RUN ? '🟡 DRY-RUN (sin cambios reales)' : '🔴 REAL (modificará documentos)'}\n`);

  await mongoose.connect(MONGO_URI);
  console.log('✅  Conectado a MongoDB\n');

  // ── 1. Cargar todos los colegios para tener el mapa id→nombre ──────────────
  const colegios = await Colegio.find().lean();
  const colMap = {};
  colegios.forEach(c => { colMap[c.id] = c.nombre; });

  console.log(`📚  Colegios en BD: ${colegios.length}`);
  colegios.forEach(c => console.log(`   • ${c.id} → "${c.nombre}"`));
  console.log('');

  // ── 2. Detectar salones con colegioNombre vacío ────────────────────────────
  const sinNombre = await Salon.find({
    $or: [
      { colegioNombre: { $in: [null, '', undefined] } },
      { colegioNombre: { $exists: false } },
    ],
    colegioId: { $nin: [null, '', undefined] },
  }).lean();

  if (sinNombre.length === 0) {
    console.log('✅  Todos los salones tienen colegioNombre. Sin problemas.\n');
  } else {
    console.log(`⚠️   Salones con colegioNombre vacío: ${sinNombre.length}`);
    sinNombre.forEach(s =>
      console.log(`   - "${s.nombre}" | colegioId: "${s.colegioId}" | _id: ${s._id}`)
    );

    if (!DRY_RUN) {
      let fixed = 0, noMatch = 0;
      for (const s of sinNombre) {
        const nombreColegio = colMap[s.colegioId];
        if (nombreColegio) {
          await Salon.updateOne(
            { _id: s._id },
            { $set: { colegioNombre: nombreColegio } }
          );
          console.log(`   ✅ "${s.nombre}" (${s.colegioId}) → colegioNombre = "${nombreColegio}"`);
          fixed++;
        } else {
          console.log(`   ⚠️  "${s.nombre}" tiene colegioId="${s.colegioId}" que NO existe en colegios. Requiere revisión manual.`);
          noMatch++;
        }
      }
      console.log(`\n   Corregidos: ${fixed} | Sin colegio en BD: ${noMatch}\n`);
    } else {
      console.log('\n   [DRY-RUN] Se actualizarían los campos colegioNombre con datos de la colección colegios.\n');
    }
  }

  // ── 3. Reporte completo: salones por colegio ───────────────────────────────
  const todos = await Salon.find({ colegioId: { $nin: [null, ''] } }).lean();
  const porColegio = {};
  todos.forEach(s => {
    const key = `${s.colegioId} — "${s.colegioNombre || '(sin nombre)'}"`;
    if (!porColegio[key]) porColegio[key] = [];
    porColegio[key].push(s.nombre);
  });

  console.log('📊  Salones válidos por colegio:');
  Object.entries(porColegio).forEach(([col, sals]) => {
    console.log(`   ${col}:`);
    console.log(`      ${sals.sort().join(', ')}`);
  });
  console.log('');

  // ── 4. Detectar nombres de salón duplicados entre colegios ────────────────
  // Esto es NORMAL (cada colegio puede tener su "1A"), pero lo listamos
  // para confirmar que el aislamiento por colegioId funciona correctamente.
  const nombresSalones = {};
  todos.forEach(s => {
    if (!nombresSalones[s.nombre]) nombresSalones[s.nombre] = [];
    nombresSalones[s.nombre].push(s.colegioId);
  });

  const duplicadosEntreCols = Object.entries(nombresSalones)
    .filter(([, cols]) => cols.length > 1);

  if (duplicadosEntreCols.length === 0) {
    console.log('✅  No hay nombres de salón compartidos entre colegios.\n');
  } else {
    console.log(`ℹ️   Nombres de salón que existen en MÁS de un colegio (esto es normal):`);
    duplicadosEntreCols.forEach(([nombre, cols]) => {
      console.log(`   "${nombre}" → colegios: ${cols.join(', ')}`);
    });
    console.log('   → El índice único {nombre, colegioId} garantiza el aislamiento.\n');
  }

  // ── 5. Detectar estudiantes cuyo salón NO existe en su colegio ─────────────
  console.log('🔍  Verificando integridad estudiante↔salón...');
  const ests = await Usuario.find({ role: 'est', salon: { $nin: [null, ''] } }).lean();

  // Construir set de salones por colegioId
  const salonSet = {}; // { colegioId: Set(nombres) }
  todos.forEach(s => {
    if (!salonSet[s.colegioId]) salonSet[s.colegioId] = new Set();
    salonSet[s.colegioId].add(s.nombre);
  });

  const inconsistentes = ests.filter(e => {
    if (!e.colegioId || !e.salon) return false;
    const salones = salonSet[e.colegioId];
    return !salones || !salones.has(e.salon);
  });

  if (inconsistentes.length === 0) {
    console.log('✅  Todos los estudiantes tienen su salón dentro de su propio colegio.\n');
  } else {
    console.log(`\n🚨  PROBLEMA DETECTADO: ${inconsistentes.length} estudiante(s) con salón inconsistente:`);
    inconsistentes.forEach(e => {
      const salonesColegio = salonSet[e.colegioId]
        ? [...salonSet[e.colegioId]].join(', ')
        : '(ninguno)';
      console.log(`   • ${e.nombre} (${e.usuario}) | colegioId: "${e.colegioId}" | salon: "${e.salon}"`);
      console.log(`     Salones disponibles en su colegio: ${salonesColegio}`);
    });

    if (!DRY_RUN) {
      console.log('\n   ❓ Para corregir: asignar el salón correcto manualmente via el panel admin.');
      console.log('   No se modifican automáticamente para evitar pérdida de datos.');
    }
    console.log('');
  }

  await mongoose.disconnect();
  console.log('🏁  Diagnóstico completado.\n');
}

main().catch(err => {
  console.error('❌  Error:', err.message);
  process.exit(1);
});