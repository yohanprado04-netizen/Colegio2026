// seed_atlas.js — Siembra datos en MongoDB ATLAS (Render)
// Uso: node seed_atlas.js
// ⚠️  Ejecutar desde la raíz del proyecto (donde está el .env)
'use strict';
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

// ── URI de Atlas (del .env o hardcodeada aquí) ──────────────────
const ATLAS_URI = process.env.MONGODB_URI || 
  'mongodb+srv://yohanprado04_db_user:pradera123@prado04.t4d8ob8.mongodb.net/edusistema?retryWrites=true&w=majority&appName=prado04';

const { Schema } = mongoose;

// ── Modelos mínimos para el seed ────────────────────────────────
const ColegioSchema = new Schema({
  id: String, nombre: String, codigo: String, direccion: String,
  telefono: String, sedes: [String], jornadas: [String],
  activo: { type: Boolean, default: true }, createdBy: String,
}, { timestamps: true, collection: 'colegios' });

const UsuarioSchema = new Schema({
  id: String, nombre: String, ti: String, usuario: String,
  password: String, role: String, blocked: Boolean,
  colegioId: String, colegioNombre: String,
  salon: String, registrado: String, ciclo: String,
  salones: [String], materias: [String], materia: String,
  salonMaterias: Schema.Types.Mixed,
}, { timestamps: true, collection: 'usuarios' });

const SalonSchema = new Schema({
  nombre: String, ciclo: String, mats: [String], colegioId: String,
}, { timestamps: true, collection: 'salones' });

const ConfigSchema = new Schema({
  key: String, value: Schema.Types.Mixed, colegioId: String,
}, { timestamps: true, collection: 'config' });

const PlanEstudiosSchema = new Schema({
  colegioId: String, ciclo: String, grado: String,
  area: String, asignatura: String, intensidad: Number,
}, { timestamps: true, collection: 'plan_estudios' });

const EstHistSchema = new Schema({
  id: String, nombre: String, ti: String, salon: String,
  registrado: String, activo: Boolean, colegioId: String,
}, { timestamps: true, collection: 'est_historial' });

const Colegio       = mongoose.model('Colegio',       ColegioSchema);
const Usuario       = mongoose.model('Usuario',       UsuarioSchema);
const Salon         = mongoose.model('Salon',         SalonSchema);
const Config        = mongoose.model('Config',        ConfigSchema);
const PlanEstudios  = mongoose.model('PlanEstudios',  PlanEstudiosSchema);
const EstHist       = mongoose.model('EstHist',       EstHistSchema);

const SALT = 12;
const hash = (pwd) => bcrypt.hash(pwd, SALT);

async function seed() {
  console.log('🔌 Conectando a MongoDB Atlas...');
  await mongoose.connect(ATLAS_URI, {
    dbName: 'edusistema',
    serverSelectionTimeoutMS: 15000,
  });
  console.log('✅ Conectado a Atlas\n');
  console.log('🌱 Iniciando seed...\n');

  // Limpiar colecciones
  await Promise.all([
    Usuario.deleteMany({}),
    Colegio.deleteMany({}),
    Salon.deleteMany({}),
    Config.deleteMany({}),
    PlanEstudios.deleteMany({}),
    EstHist.deleteMany({}),
  ]);
  console.log('🗑️  Colecciones limpiadas');

  // ── Super Admin ────────────────────────────────────────────────
  await Usuario.create({
    id: 'superadmin', nombre: 'Super Administrador', ti: '',
    usuario: 'superadmin', password: await hash('superadmin123'),
    role: 'superadmin', blocked: false, colegioId: null, colegioNombre: '',
    salon: '', registrado: '', ciclo: '', salones: [], materias: [], materia: '', salonMaterias: {},
  });
  console.log('🌐 Super Admin       → superadmin / superadmin123');

  // ── Colegio Demo ───────────────────────────────────────────────
  const colegioId     = 'col_demo';
  const colegioNombre = 'Colegio Demo';

  await Colegio.create({
    id: colegioId, nombre: colegioNombre, nit: '900123456-1',
    direccion: 'Calle 1 # 2-3', telefono: '3001234567',
    sedes: ['Sede Principal'], jornadas: ['Mañana', 'Tarde'],
    activo: true, createdBy: 'superadmin',
  });
  console.log(`🏫 Colegio Demo      → id: ${colegioId}`);

  // ── Admin del Colegio Demo ─────────────────────────────────────
  await Usuario.create({
    id: 'admin_col_demo', nombre: 'Administrador Demo', ti: 'CC-000001',
    usuario: 'admin', password: await hash('admin123'),
    role: 'admin', blocked: false, colegioId, colegioNombre,
    salon: '', registrado: '', ciclo: '', salones: [], materias: [], materia: '', salonMaterias: {},
  });
  console.log('👤 Admin Demo        → admin / admin123');

  // ── Config del Colegio Demo ────────────────────────────────────
  const configItems = [
    { key: 'mP',        value: ['Matemáticas','Lengua Castellana','Ciencias Naturales','Ciencias Sociales','Ed. Artística','Ed. Física','Ética'] },
    { key: 'mB',        value: ['Matemáticas','Español','Ciencias Naturales','Ciencias Sociales','Inglés','Ed. Física','Arte','Filosofía'] },
    { key: 'pers',      value: ['Periodo 1','Periodo 2','Periodo 3','Periodo 4'] },
    { key: 'dr',        value: { s: '', e: '' } },
    { key: 'drPer',     value: {} },
    { key: 'ext',       value: { on: false, s: '', e: '' } },
    { key: 'anoActual', value: String(new Date().getFullYear()) },
  ];
  await Config.insertMany(configItems.map(c => ({ ...c, colegioId })));
  console.log('⚙️  Config creada');

  // ── Salones ────────────────────────────────────────────────────
  const salones = [
    { nombre: '1A',  ciclo: 'primaria',     colegioId },
    { nombre: '2A',  ciclo: 'primaria',     colegioId },
    { nombre: '6A',  ciclo: 'bachillerato', colegioId },
    { nombre: '11A', ciclo: 'bachillerato', colegioId },
  ];
  await Salon.insertMany(salones);
  console.log('🏫 Salones creados:  ', salones.map(s => s.nombre).join(', '));

  // ── Profesores ─────────────────────────────────────────────────
  const profs = [
    { id:'prf_001', nombre:'Ana García',   usuario:'anagarcia',   ciclo:'primaria',     salones:['1A','2A'],  materias:['Matemáticas','Lengua Castellana'] },
    { id:'prf_002', nombre:'Carlos López', usuario:'carloslopez', ciclo:'bachillerato', salones:['6A','11A'], materias:['Matemáticas','Física'] },
  ];
  for (const p of profs) {
    await Usuario.create({
      ...p, ti: '', password: await hash(p.usuario + '123'),
      role: 'profe', blocked: false, colegioId, colegioNombre,
      materia: p.materias[0], salonMaterias: {}, registrado: '',
    });
  }
  console.log('👩‍🏫 Profesores:      ', profs.map(p => `${p.usuario}/${p.usuario}123`).join(', '));

  // ── Estudiantes ────────────────────────────────────────────────
  const ests = [
    { id:'est_001', nombre:'Luis Pérez',     salon:'1A',  ti:'TI-001' },
    { id:'est_002', nombre:'María Torres',   salon:'1A',  ti:'TI-002' },
    { id:'est_003', nombre:'Juan Rodríguez', salon:'6A',  ti:'TI-003' },
    { id:'est_004', nombre:'Sofía Martínez', salon:'6A',  ti:'TI-004' },
    { id:'est_005', nombre:'Pedro Gómez',    salon:'11A', ti:'TI-005' },
  ];
  for (const e of ests) {
    const usr = 'est_' + e.id.split('_')[1];
    await Usuario.create({
      ...e, usuario: usr,
      password: await hash('est' + e.id.split('_')[1] + '123'),
      role: 'est', blocked: false, colegioId, colegioNombre,
      registrado: new Date().toLocaleDateString('es-CO'),
      ciclo: '', salones: [], materias: [], materia: '', salonMaterias: {},
    });
    await EstHist.findOneAndUpdate(
      { id: e.id },
      { id: e.id, nombre: e.nombre, ti: e.ti, salon: e.salon,
        registrado: new Date().toLocaleDateString('es-CO'), activo: true, colegioId },
      { upsert: true }
    );
  }
  console.log('🎓 Estudiantes:       est_001/est001123 … est_005/est005123');

  // ── Plan de Estudios ───────────────────────────────────────────
  const plan = [
    { colegioId, ciclo:'primaria',     grado:'1°', area:'Matemáticas', asignatura:'Matemáticas',       intensidad:5 },
    { colegioId, ciclo:'primaria',     grado:'1°', area:'Lenguaje',    asignatura:'Lengua Castellana', intensidad:5 },
    { colegioId, ciclo:'bachillerato', grado:'6°', area:'Matemáticas', asignatura:'Matemáticas',       intensidad:5 },
    { colegioId, ciclo:'bachillerato', grado:'6°', area:'Ciencias',    asignatura:'Física',            intensidad:3 },
  ];
  await PlanEstudios.insertMany(plan);
  console.log('📖 Plan de Estudios creado');

  console.log('\n✅ Seed completado exitosamente en Atlas!\n');
  console.log('═══════════════════════════════════════');
  console.log('  🌐 superadmin   / superadmin123');
  console.log('  👤 admin        / admin123');
  console.log('  👩‍🏫 anagarcia    / anagarcia123');
  console.log('  🎓 est_001      / est001123');
  console.log('═══════════════════════════════════════\n');

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch(err => {
  console.error('\n❌ Error en seed:', err.message);
  if (err.message.includes('ENOTFOUND') || err.message.includes('getaddrinfo')) {
    console.error('   → No se pudo resolver el host de Atlas.');
    console.error('   → Verifica tu conexión a internet y el string de conexión.');
  }
  if (err.message.includes('Authentication failed')) {
    console.error('   → Contraseña incorrecta en MONGODB_URI.');
  }
  process.exit(1);
});