/**
 * fix_all_indexes.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Elimina TODOS los índices legacy (single-field unique) que bloquean el
 * sistema multi-tenant. Afecta las colecciones: config, notas, salones.
 *
 * PROBLEMAS QUE RESUELVE:
 *   1. config   → index "key_1"          → bloquea guardar ext/dr/pers por colegio
 *   2. notas    → index "estId_1_anoLectivo_1" → bloquea notas de mismo est en 2 colegios
 *   3. salones  → index "nombre_1"        → (ya resuelto, verifica que siga OK)
 *
 * USO:
 *   node scripts/fix_all_indexes.js
 *
 * DRY-RUN (sin cambios):
 *   $env:DRY_RUN="true"; node scripts/fix_all_indexes.js   ← PowerShell
 *   DRY_RUN=true node scripts/fix_all_indexes.js           ← Linux/Mac
 * ─────────────────────────────────────────────────────────────────────────────
 */
'use strict';
require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) { console.error('❌  Falta MONGO_URI en .env'); process.exit(1); }

const DRY_RUN = process.env.DRY_RUN === 'true';

// Índices a eliminar: { colección, nombre_del_índice, índice_correcto_que_debe_existir }
const FIXES = [
  {
    col:        'config',
    dropIndex:  'key_1',
    createIndex: { fields: { key: 1, colegioId: 1 }, options: { unique: true, name: 'key_1_colegioId_1' } },
    description: 'Config: key único sin colegioId → bloquea guardar ext/dr/pers/periodos por colegio',
  },
  {
    col:        'notas',
    dropIndex:  'estId_1_anoLectivo_1',
    createIndex: { fields: { estId: 1, anoLectivo: 1, colegioId: 1 }, options: { unique: true, name: 'estId_1_anoLectivo_1_colegioId_1' } },
    description: 'Notas: índice sin colegioId → bloquea guardar notas ("No matching document" al save())',
  },
  {
    col:        'salones',
    dropIndex:  'nombre_1',
    createIndex: { fields: { nombre: 1, colegioId: 1 }, options: { unique: true, name: 'nombre_1_colegioId_1' } },
    description: 'Salones: nombre único sin colegioId → bloquea crear salones en nuevos colegios',
  },
];

async function fixCollection(fix) {
  const col = mongoose.connection.collection(fix.col);
  const indexes = await col.indexes();

  console.log(`\n📋  [${fix.col}] Índices actuales:`);
  indexes.forEach(i => console.log(`     - "${i.name}"  ${i.unique ? '[UNIQUE]' : ''}  ${i.key ? JSON.stringify(i.key) : ''}`));

  // ── Eliminar índice problemático ─────────────────────────────────────────────
  const problematic = indexes.find(i => i.name === fix.dropIndex);
  if (problematic) {
    console.log(`\n  ⚠️   Índice problemático: "${fix.dropIndex}" → ${fix.description}`);
    if (!DRY_RUN) {
      try {
        await col.dropIndex(fix.dropIndex);
        console.log(`  🗑️   "${fix.dropIndex}" eliminado ✅`);
      } catch (e) {
        console.error(`  ❌  Error eliminando "${fix.dropIndex}": ${e.message}`);
      }
    } else {
      console.log(`  [DRY-RUN] Se eliminaría "${fix.dropIndex}"`);
    }
  } else {
    console.log(`\n  ✅  Índice "${fix.dropIndex}" no existe (ya fue eliminado o nunca existió)`);
  }

  // ── Crear índice correcto si no existe ───────────────────────────────────────
  const correctName = fix.createIndex.options.name;
  const correct = indexes.find(i => i.name === correctName);
  if (!correct) {
    console.log(`  ⚠️   Índice correcto "${correctName}" no existe. Creando...`);
    if (!DRY_RUN) {
      try {
        await col.createIndex(fix.createIndex.fields, fix.createIndex.options);
        console.log(`  ✅  "${correctName}" creado correctamente`);
      } catch (e) {
        if (e.code === 11000 || e.code === 85 || e.code === 86) {
          console.warn(`  ⚠️   No se pudo crear "${correctName}" (datos duplicados): ${e.message}`);
          console.log(`       → Ejecuta primero fix_salones_colegioId.js para limpiar docs huérfanos`);
        } else {
          console.error(`  ❌  Error creando "${correctName}": ${e.message}`);
        }
      }
    } else {
      console.log(`  [DRY-RUN] Se crearía índice ${JSON.stringify(fix.createIndex.fields)} UNIQUE`);
    }
  } else {
    console.log(`  ✅  Índice correcto "${correctName}" ya existe`);
  }
}

async function main() {
  console.log('\n🔧  fix_all_indexes.js — Limpieza de índices legacy multi-tenant');
  console.log(`   Modo: ${DRY_RUN ? '🟡 DRY-RUN (sin cambios)' : '🔴 REAL (modificará índices en Atlas)'}\n`);

  await mongoose.connect(MONGO_URI);
  console.log('✅  Conectado a MongoDB Atlas');

  for (const fix of FIXES) {
    await fixCollection(fix);
  }

  // ── Reporte final ────────────────────────────────────────────────────────────
  console.log('\n\n📊  ESTADO FINAL DE ÍNDICES:');
  for (const fix of FIXES) {
    const col = mongoose.connection.collection(fix.col);
    const indexes = await col.indexes();
    console.log(`\n  [${fix.col}]`);
    indexes.forEach(i => console.log(`   - "${i.name}"  ${i.unique ? '[UNIQUE]' : ''}  ${JSON.stringify(i.key)}`));
  }

  await mongoose.disconnect();
  console.log('\n🏁  Listo. Reinicia el servidor en Render para aplicar los cambios.\n');
}

main().catch(err => {
  console.error('❌  Error fatal:', err.message);
  process.exit(1);
});