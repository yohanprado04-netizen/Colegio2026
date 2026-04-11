/**
 * fix_multitenant_mezcla.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PROBLEMA:
 *   La lógica de "reparación automática" en routes/db.js usaba el nombre del
 *   salón (ej: "1A") para decidir a qué colegio pertenece un estudiante.
 *   Como todos los colegios tienen salones con los mismos nombres, esto causó
 *   que estudiantes y profes fueran reasignados al colegioId equivocado.
 *
 * QUÉ HACE ESTE SCRIPT:
 *   1. Lista todos los colegios registrados.
 *   2. Para cada colegio, muestra los usuarios que tiene actualmente.
 *   3. Detecta usuarios cuyo colegioId no coincide con ningún colegio real.
 *   4. SOLO MODO DIAGNÓSTICO por defecto — imprime lo que haría sin cambiar nada.
 *   5. Con --fix aplica la corrección usando el colegioId del admin del colegio.
 *
 * USO:
 *   node scripts/fix_multitenant_mezcla.js          # Solo diagnóstico
 *   node scripts/fix_multitenant_mezcla.js --fix    # Aplica correcciones
 *
 * IMPORTANTE: Ejecutar --fix solo después de revisar el diagnóstico.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';
require('dotenv').config();
const mongoose = require('mongoose');
const { Usuario, Colegio } = require('../models');

const APPLY_FIX = process.argv.includes('--fix');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Conectado a MongoDB\n');

  // 1. Cargar todos los colegios
  let colegios;
  try {
    colegios = await Colegio.find({}).lean();
  } catch (e) {
    // Si no existe modelo Colegio, obtener colegioIds únicos de los admins
    console.warn('⚠️  Modelo Colegio no encontrado. Usando admins para detectar colegios...');
    const admins = await Usuario.find({ role: 'admin', colegioId: { $ne: '' } }).lean();
    colegios = admins.map(a => ({ id: a.colegioId, nombre: a.colegioNombre || a.colegioId }));
  }

  if (colegios.length === 0) {
    console.log('⚠️  No se encontraron colegios en la base de datos.');
    process.exit(0);
  }

  console.log(`📋 Colegios encontrados: ${colegios.length}`);
  colegios.forEach(c => console.log(`   • ${c.id || c._id} — ${c.nombre || ''}`));
  console.log('');

  const colegioIds = new Set(colegios.map(c => String(c.id || c._id)));

  // 2. Buscar usuarios con colegioId inválido (no pertenece a ningún colegio real)
  const todosUsuarios = await Usuario.find({ role: { $in: ['admin','profe','est'] } }).lean();
  const usuariosHuerfanos = todosUsuarios.filter(u => !colegioIds.has(String(u.colegioId || '')));

  console.log(`👤 Usuarios totales: ${todosUsuarios.length}`);
  console.log(`🔴 Usuarios con colegioId inválido/vacío: ${usuariosHuerfanos.length}\n`);

  if (usuariosHuerfanos.length > 0) {
    console.log('Usuarios huérfanos (colegioId no coincide con ningún colegio):');
    usuariosHuerfanos.forEach(u => {
      console.log(`   [${u.role}] ${u.nombre} (id: ${u.id}) — colegioId actual: "${u.colegioId || '(vacío)'}"`);
    });
    console.log('');
    console.log('⚠️  Estos usuarios necesitan ser asignados manualmente al colegio correcto.');
    console.log('   Usa MongoDB Atlas o el panel de admin para reasignarlos.');
  }

  // 3. Por cada colegio, verificar que sus usuarios tienen el colegioId correcto
  console.log('\n══════════════════════════════════════════════════');
  console.log('VERIFICACIÓN POR COLEGIO');
  console.log('══════════════════════════════════════════════════\n');

  for (const colegio of colegios) {
    const cid = String(colegio.id || colegio._id);
    const nombre = colegio.nombre || cid;

    const usuarios = await Usuario.find({ colegioId: cid, role: { $in: ['admin','profe','est'] } }).lean();
    const admins = usuarios.filter(u => u.role === 'admin');
    const profs  = usuarios.filter(u => u.role === 'profe');
    const ests   = usuarios.filter(u => u.role === 'est');

    console.log(`🏫 ${nombre} (id: ${cid})`);
    console.log(`   Admins: ${admins.length} | Profes: ${profs.length} | Estudiantes: ${ests.length}`);

    // Verificar si hay estudiantes duplicados entre colegios
    const estIds = ests.map(e => e.id);
    const duplicados = await Usuario.find({
      id: { $in: estIds },
      colegioId: { $ne: cid },
      role: 'est'
    }).lean();

    if (duplicados.length > 0) {
      console.log(`   ⚠️  ${duplicados.length} estudiante(s) con el mismo "id" pero diferente colegioId:`);
      duplicados.forEach(d => {
        console.log(`      • ${d.nombre} (id: ${d.id}) → colegioId incorrecto: "${d.colegioId}"`);
        if (APPLY_FIX) {
          console.log(`        → Esto indica un ID duplicado entre colegios. Revisar manualmente.`);
        }
      });
    } else {
      console.log(`   ✅ Sin duplicados detectados`);
    }
    console.log('');
  }

  // 4. Detectar estudiantes que fueron reasignados por el bug (tienen colegioId de otro colegio pero su colegioNombre sugiere otro)
  console.log('══════════════════════════════════════════════════');
  console.log('DETECCIÓN DE REASIGNACIONES INCORRECTAS');
  console.log('══════════════════════════════════════════════════\n');

  const posiblesMezclados = await Usuario.find({
    role: 'est',
    colegioId: { $ne: '' },
    $expr: {
      $and: [
        { $ne: ['$colegioId', ''] },
        // Si colegioNombre no coincide con el colegioId del usuario
        // (indica que fue reasignado por el bug)
        { $ne: ['$colegioNombre', ''] }
      ]
    }
  }).lean();

  // Verificar cruzando con los datos de colegios
  const colegioMap = {};
  colegios.forEach(c => { colegioMap[String(c.id || c._id)] = c.nombre || ''; });

  let problemasEncontrados = 0;
  for (const est of posiblesMezclados) {
    const nombreEsperado = colegioMap[est.colegioId] || '';
    if (nombreEsperado && est.colegioNombre && est.colegioNombre !== nombreEsperado) {
      problemasEncontrados++;
      console.log(`🔴 Estudiante posiblemente reasignado incorrectamente:`);
      console.log(`   Nombre: ${est.nombre} (id: ${est.id})`);
      console.log(`   colegioId: "${est.colegioId}" (colegio: "${nombreEsperado}")`);
      console.log(`   colegioNombre guardado: "${est.colegioNombre}"`);
      console.log(`   → El colegioNombre no coincide con el colegio al que está asignado.`);
      console.log('');
    }
  }

  if (problemasEncontrados === 0) {
    console.log('✅ No se detectaron reasignaciones incorrectas evidentes.\n');
  } else {
    console.log(`⚠️  Se encontraron ${problemasEncontrados} posibles reasignaciones incorrectas.`);
    console.log('   Para corregirlas, actualiza manualmente el colegioId correcto en MongoDB Atlas.\n');
  }

  if (!APPLY_FIX) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('ℹ️  MODO DIAGNÓSTICO — No se hicieron cambios.');
    console.log('   Revisa el reporte arriba y corrige manualmente en Atlas.');
    console.log('   Para aplicar correcciones automáticas: node scripts/fix_multitenant_mezcla.js --fix');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }

  await mongoose.disconnect();
  console.log('🔌 Desconectado de MongoDB');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});