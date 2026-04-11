/**
 * fix_index_salones.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PROBLEMA:
 *   En Atlas existe un índice legacy "nombre_1" (único solo por nombre) que
 *   fue creado antes de la arquitectura multi-tenant. Este índice impide crear
 *   el salón "1A" en Carrasquilla porque ya existe "1A" en col_demo.
 *
 *   El modelo actual define { nombre: 1, colegioId: 1 } (correcto), pero
 *   Mongoose NO elimina índices viejos automáticamente al hacer syncIndexes.
 *
 * QUÉ HACE:
 *   1. Muestra todos los índices actuales de la colección salones.
 *   2. Elimina el índice "nombre_1" si existe.
 *   3. Crea el índice correcto { nombre, colegioId } si no existe.
 *   4. Verifica el resultado final.
 *
 * USO:
 *   node scripts/fix_index_salones.js
 *
 * MODO SIMULACIÓN (solo muestra, no cambia nada):
 *   DRY_RUN=true node scripts/fix_index_salones.js
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

async function main() {
  console.log('\n🔧  fix_index_salones.js');
  console.log(`   Modo: ${DRY_RUN ? '🟡 DRY-RUN (sin cambios)' : '🔴 REAL (modificará índices en Atlas)'}\n`);

  await mongoose.connect(MONGO_URI);
  console.log('✅  Conectado a MongoDB Atlas\n');

  const col = mongoose.connection.collection('salones');

  // ── 1. Listar índices actuales ───────────────────────────────────────────────
  const indexes = await col.indexes();
  console.log('📋  Índices actuales en colección "salones":');
  indexes.forEach(idx => {
    const keys = JSON.stringify(idx.key);
    const flags = [
      idx.unique ? 'UNIQUE' : '',
      idx.sparse ? 'SPARSE' : '',
    ].filter(Boolean).join(', ');
    console.log(`   - "${idx.name}"  →  ${keys}  ${flags ? '[' + flags + ']' : ''}`);
  });
  console.log('');

  // ── 2. Detectar índice problemático "nombre_1" ───────────────────────────────
  const idxNombre1 = indexes.find(i => i.name === 'nombre_1');
  const idxCorrecto = indexes.find(i => i.name === 'nombre_1_colegioId_1');

  if (!idxNombre1) {
    console.log('✅  El índice problemático "nombre_1" NO existe. Nada que limpiar.\n');
  } else {
    console.log(`⚠️   Índice problemático encontrado: "nombre_1" → ${JSON.stringify(idxNombre1.key)}`);
    console.log('     Este índice impide que dos colegios tengan salones con el mismo nombre.\n');

    if (!DRY_RUN) {
      try {
        await col.dropIndex('nombre_1');
        console.log('🗑️   Índice "nombre_1" eliminado correctamente.\n');
      } catch (err) {
        console.error(`❌  Error eliminando "nombre_1": ${err.message}\n`);
      }
    } else {
      console.log('   [DRY-RUN] Se eliminaría el índice "nombre_1"\n');
    }
  }

  // ── 3. Verificar/crear índice correcto { nombre, colegioId } ─────────────────
  if (!idxCorrecto) {
    console.log('⚠️   Índice correcto "nombre_1_colegioId_1" NO existe. Creando...');
    if (!DRY_RUN) {
      try {
        await col.createIndex(
          { nombre: 1, colegioId: 1 },
          { unique: true, name: 'nombre_1_colegioId_1' }
        );
        console.log('✅  Índice { nombre, colegioId } creado correctamente.\n');
      } catch (err) {
        if (err.code === 11000 || err.code === 85 || err.code === 86) {
          console.warn(`⚠️   No se pudo crear el índice (posible duplicado en datos): ${err.message}\n`);
          console.log('     Ejecuta primero: node scripts/fix_salones_colegioId.js');
          console.log('     para eliminar salones huérfanos y luego vuelve a correr este script.\n');
        } else {
          console.error(`❌  Error creando índice: ${err.message}\n`);
        }
      }
    } else {
      console.log('   [DRY-RUN] Se crearía el índice { nombre: 1, colegioId: 1 } unique\n');
    }
  } else {
    console.log('✅  Índice correcto "nombre_1_colegioId_1" ya existe.\n');
  }

  // ── 4. Estado final ──────────────────────────────────────────────────────────
  const indexesFinal = await col.indexes();
  console.log('📋  Índices FINALES en colección "salones":');
  indexesFinal.forEach(idx => {
    const keys = JSON.stringify(idx.key);
    const flags = [idx.unique ? 'UNIQUE' : '', idx.sparse ? 'SPARSE' : ''].filter(Boolean).join(', ');
    console.log(`   - "${idx.name}"  →  ${keys}  ${flags ? '[' + flags + ']' : ''}`);
  });

  await mongoose.disconnect();
  console.log('\n🏁  Listo. Ahora los salones de cada colegio son independientes.\n');
}

main().catch(err => {
  console.error('❌  Error fatal:', err.message);
  process.exit(1);
});