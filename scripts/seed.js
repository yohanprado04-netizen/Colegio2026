// scripts/seed.js — Datos iniciales EduSistema Pro (multi-tenant)
// Uso: node scripts/seed.js
// ⚠️  Borra y recrea todos los datos existentes
'use strict';
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const connectDB = require('../config/db');
const {
  Usuario, Colegio, Salon, Config,
  Nota, EstHist, PlanEstudios
} = require('../models');

const SALT = 12;
const hash = (pwd) => bcrypt.hash(pwd, SALT);

async function seed() {
  await connectDB();
  console.log('🌱 Iniciando seed...\n');

  await Promise.all([
    Usuario.deleteMany({}),
    Colegio.deleteMany({}),
    Salon.deleteMany({}),
    Config.deleteMany({}),
    Nota.deleteMany({}),
    EstHist.deleteMany({}),
    PlanEstudios.deleteMany({}),
  ]);
  console.log('🗑️  Colecciones limpiadas');

  // ── Super Admin ──────────────────────────────────────────────────
  await Usuario.create({
    id:            'superadmin',
    nombre:        'Super Administrador',
    ti:            '',
    usuario:       'superadmin',
    password:      await hash('superadmin123'),
    role:          'superadmin',
    blocked:       false,
    colegioId:     null,
    colegioNombre: '',
    salon: '', registrado: '', ciclo: '', salones: [], materias: [], materia: '', salonMaterias: {},
  });
  console.log('🌐 Super Admin → usuario: superadmin / contraseña: superadmin123');

  // ── Colegio Demo ─────────────────────────────────────────────────
  const colegioId     = 'col_demo';
  const colegioNombre = 'Colegio Demo';

  await Colegio.create({
    id:        colegioId,
    nombre:    colegioNombre,
    codigo:    'DEMO-001',
    direccion: 'Calle 1 # 2-3',
    telefono:  '3001234567',
    sedes:     ['Sede Principal'],
    jornadas:  ['Mañana', 'Tarde'],
    activo:    true,
    createdBy: 'superadmin',
  });
  console.log(`🏫 Colegio Demo → id: ${colegioId}`);

  // ── Admin del Colegio Demo ────────────────────────────────────────
  await Usuario.create({
    id:            'admin_col_demo',
    nombre:        'Administrador Demo',
    ti:            'CC-000001',
    usuario:       'admin',
    password:      await hash('admin123'),
    role:          'admin',
    blocked:       false,
    colegioId,
    colegioNombre,
    salon: '', registrado: '', ciclo: '', salones: [], materias: [], materia: '', salonMaterias: {},
  });
  console.log('👤 Admin Demo → usuario: admin / contraseña: admin123');

  // ── Config del Colegio Demo ───────────────────────────────────────
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
  console.log('⚙️  Config del Colegio Demo creada');

  // ── Salones ───────────────────────────────────────────────────────
  const salones = [
    { nombre: '1A', ciclo: 'primaria',     colegioId },
    { nombre: '2A', ciclo: 'primaria',     colegioId },
    { nombre: '6A', ciclo: 'bachillerato', colegioId },
    { nombre: '11A',ciclo: 'bachillerato', colegioId },
  ];
  await Salon.insertMany(salones);
  console.log('🏫 Salones creados:', salones.map(s => s.nombre).join(', '));

  // ── Profesores ────────────────────────────────────────────────────
  const profs = [
    { id:'prf_001', nombre:'Ana García',    usuario:'anagarcia',  ciclo:'primaria',     salones:['1A','2A'],  materias:['Matemáticas','Lengua Castellana'] },
    { id:'prf_002', nombre:'Carlos López',  usuario:'carloslopez',ciclo:'bachillerato', salones:['6A','11A'], materias:['Matemáticas','Física'] },
  ];
  for (const p of profs) {
    await Usuario.create({
      ...p, ti: '', password: await hash(p.usuario + '123'),
      role: 'profe', blocked: false, colegioId, colegioNombre,
      materia: p.materias[0], salonMaterias: {}, registrado: '',
    });
    await EstHist.findOneAndUpdate({ id: p.id }, { id: p.id, nombre: p.nombre, activo: true, colegioId }, { upsert: true });
  }
  console.log('👩‍🏫 Profesores creados:', profs.map(p => p.usuario).join(', '));

  // ── Estudiantes ───────────────────────────────────────────────────
  const ests = [
    { id:'est_001', nombre:'Luis Pérez',     salon:'1A',  ti:'TI-001' },
    { id:'est_002', nombre:'María Torres',   salon:'1A',  ti:'TI-002' },
    { id:'est_003', nombre:'Juan Rodríguez', salon:'6A',  ti:'TI-003' },
    { id:'est_004', nombre:'Sofía Martínez', salon:'6A',  ti:'TI-004' },
    { id:'est_005', nombre:'Pedro Gómez',    salon:'11A', ti:'TI-005' },
  ];
  for (const e of ests) {
    await Usuario.create({
      ...e, usuario: 'est_' + e.id.split('_')[1],
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
  console.log('🎓 Estudiantes creados:', ests.map(e => e.nombre).join(', '));

  // ── Plan de Estudios Demo ─────────────────────────────────────────
  const plan = [
    { colegioId, ciclo:'primaria',     grado:'1°', area:'Matemáticas', asignatura:'Matemáticas',        intensidad:5 },
    { colegioId, ciclo:'primaria',     grado:'1°', area:'Lenguaje',    asignatura:'Lengua Castellana',  intensidad:5 },
    { colegioId, ciclo:'primaria',     grado:'1°', area:'Ciencias',    asignatura:'Ciencias Naturales', intensidad:3 },
    { colegioId, ciclo:'bachillerato', grado:'6°', area:'Matemáticas', asignatura:'Matemáticas',        intensidad:5 },
    { colegioId, ciclo:'bachillerato', grado:'6°', area:'Lenguaje',    asignatura:'Español',            intensidad:4 },
    { colegioId, ciclo:'bachillerato', grado:'6°', area:'Ciencias',    asignatura:'Física',             intensidad:3 },
  ];
  await PlanEstudios.insertMany(plan);
  console.log('📖 Plan de Estudios Demo creado');

  console.log('\n✅ Seed completado.\n');
  console.log('Credenciales:');
  console.log('  🌐 superadmin / superadmin123');
  console.log('  👤 admin       / admin123');
  console.log('  👩‍🏫 anagarcia   / anagarcia123');
  console.log('  🎓 est_001     / est001123');

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch(err => { console.error('❌ Error en seed:', err); process.exit(1); });