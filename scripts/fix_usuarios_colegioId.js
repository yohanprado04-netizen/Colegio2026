/**
 * fix_usuarios_colegioId.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PROBLEMA:
 *   Los estudiantes/profesores creados antes del fix multi-tenant tienen
 *   colegioId vacío ("") o null en MongoDB. Esto hace que el profesor
 *   NO vea los estudiantes al cargar notas, porque /api/db filtra por
 *   { colegioId: req.user.colegioId } y los estudiantes no coinciden.
 *
 * QUÉ HACE:
 *   1. Lista todos los usuarios (est/profe/admin) sin colegioId.
 *   2. Los asigna al colegio correcto (por nombre o ID).
 *   3. Verifica el resultado.
 *
 * USO:
 *   FIX_COLEGIO_NOMBRE=Carrasquilla node scripts/fix_usuarios_colegioId.js
 *   FIX_COLEGIO_ID=col_1775916523356 node scripts/fix_usuarios_colegioId.js
 *
 * DRY-RUN (ver sin cambiar):
 *   $env:DRY_RUN="true"; $env:FIX_COLEGIO_NOMBRE="Carrasquilla"; node scripts/fix_usuarios_colegioId.js
 * ─────────────────────────────────────────────────────────────────────────────
 */
'use strict';
require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) { console.error('❌ Falta MONGO_URI en .env'); process.exit(1); }

const DRY_RUN          = process.env.DRY_RUN === 'true';
const FIX_COLEGIO_ID   = process.env.FIX_COLEGIO_ID   || '';
const FIX_COLEGIO_NOMBRE = process.env.FIX_COLEGIO_NOMBRE || '';

const UsuarioSchema = new mongoose.Schema(
  { id: String, usuario: String, nombre: String, role: String, colegioId: String, colegioNombre: String, salon: String },
  { collection: 'usuarios' }
);
const ColegioSchema = new mongoose.Schema(
  { id: String, nombre: String, nit: String },
  { collection: 'colegios' }
);
const Usuario = mongoose.model('Usuario', UsuarioSchema);
const Colegio  = mongoose.model('Colegio', ColegioSchema);

async function main() {
  console.log('\n🔧  fix_usuarios_colegioId.js');
  console.log(`   Modo: ${DRY_RUN ? '🟡 DRY-RUN' : '🔴 REAL'}\n`);

  await mongoose.connect(MONGO_URI);
  console.log('✅  Conectado a MongoDB\n');

  // ── Resolver el colegio destino ──────────────────────────────────────────────
  let colegio = null;
  if (FIX_COLEGIO_ID) {
    colegio = await Colegio.findOne({ id: FIX_COLEGIO_ID }).lean();
  } else if (FIX_COLEGIO_NOMBRE) {
    colegio = await Colegio.findOne({ nombre: new RegExp(FIX_COLEGIO_NOMBRE, 'i') }).lean();
  }

  if (!colegio) {
    // Listar colegios disponibles
    const todos = await Colegio.find().lean();
    console.log('📋  Colegios disponibles en la BD:');
    todos.forEach(c => console.log(`   - id: "${c.id}"  nombre: "${c.nombre}"`));
    console.log('\n⚠️  Especifica el colegio:');
    console.log('   $env:FIX_COLEGIO_NOMBRE="Carrasquilla"; node scripts/fix_usuarios_colegioId.js');
    console.log('   $env:FIX_COLEGIO_ID="col_XXX"; node scripts/fix_usuarios_colegioId.js\n');
    await mongoose.disconnect();
    return;
  }

  console.log(`🏫  Colegio destino: "${colegio.nombre}" (id: ${colegio.id})\n`);

  // ── Buscar usuarios sin colegioId ────────────────────────────────────────────
  const sinColegio = await Usuario.find({
    role: { $in: ['admin', 'profe', 'est'] },
    $or: [
      { colegioId: { $in: [null, '', undefined] } },
      { colegioId: { $exists: false } },
    ]
  }).lean();

  if (!sinColegio.length) {
    console.log('✅  Todos los usuarios tienen colegioId. Nada que reparar.\n');
    await mongoose.disconnect();
    return;
  }

  console.log(`⚠️   Usuarios sin colegioId: ${sinColegio.length}`);
  sinColegio.forEach(u =>
    console.log(`   - [${u.role}] ${u.usuario} — "${u.nombre}" ${u.salon ? `(salón: ${u.salon})` : ''}`)
  );

  if (!DRY_RUN) {
    const ids = sinColegio.map(u => u._id);
    const result = await Usuario.updateMany(
      { _id: { $in: ids } },
      { $set: { colegioId: colegio.id, colegioNombre: colegio.nombre } }
    );
    console.log(`\n✅  Reparados: ${result.modifiedCount} usuarios → colegioId="${colegio.id}"\n`);
  } else {
    console.log(`\n[DRY-RUN] Se asignaría colegioId="${colegio.id}" a ${sinColegio.length} usuarios.\n`);
  }

  // ── Verificación final ───────────────────────────────────────────────────────
  const aun = await Usuario.countDocuments({
    role: { $in: ['admin', 'profe', 'est'] },
    $or: [{ colegioId: { $in: [null, ''] } }, { colegioId: { $exists: false } }]
  });
  console.log(`📊  Usuarios sin colegioId restantes: ${aun}`);
  if (aun === 0) console.log('🏁  ¡Base de datos limpia!\n');

  await mongoose.disconnect();
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });