// models/index.js — Todos los modelos de MongoDB para EduSistema Pro
const mongoose = require('mongoose');
const { Schema } = mongoose;

// ─────────────────────────────────────────────────────────────────────────────
// COLEGIO (institución gestionada por un admin)
// ─────────────────────────────────────────────────────────────────────────────
const ColegioSchema = new Schema({
  id:           { type: String, required: true, unique: true },
  nombre:       { type: String, required: true, trim: true },
  codigo:       { type: String, default: '' },        // código interno
  direccion:    { type: String, default: '' },
  telefono:     { type: String, default: '' },
  logo:         { type: String, default: '' },        // base64 o URL
  activo:       { type: Boolean, default: true },
  // Configuración institucional (super admin)
  sedes:        [{ type: String }],
  jornadas:     [{ type: String }],
  createdBy:    { type: String, default: 'superadmin' },
}, { timestamps: true, collection: 'colegios' });

// ─────────────────────────────────────────────────────────────────────────────
// USUARIO (superadmin, admin, profe, estudiante — colección unificada)
// ─────────────────────────────────────────────────────────────────────────────
const UsuarioSchema = new Schema({
  // Identificación
  id:         { type: String, required: true, unique: true },
  nombre:     { type: String, required: true, trim: true },
  ti:         { type: String, default: '' },
  usuario:    { type: String, required: true, unique: true, trim: true },
  password:   { type: String, required: true },
  role:       { type: String, enum: ['superadmin', 'admin', 'profe', 'est'], required: true },
  blocked:    { type: Boolean, default: false },

  // Multi-tenant: a qué colegio pertenece (null = superadmin)
  colegioId:  { type: String, default: null },
  colegioNombre: { type: String, default: '' },

  // Solo estudiantes
  salon:      { type: String, default: '' },
  registrado: { type: String, default: '' },

  // Solo profesores
  ciclo:         { type: String, enum: ['primaria', 'bachillerato', ''], default: '' },
  salones:       [{ type: String }],
  materias:      [{ type: String }],
  materia:       { type: String, default: '' },
  salonMaterias: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true, collection: 'usuarios' });

// ─────────────────────────────────────────────────────────────────────────────
// SALÓN
// ─────────────────────────────────────────────────────────────────────────────
const SalonSchema = new Schema({
  nombre:    { type: String, required: true, trim: true },
  ciclo:     { type: String, enum: ['primaria', 'bachillerato'], required: true },
  mats:      [{ type: String }],
  colegioId: { type: String, required: true },
}, { timestamps: true, collection: 'salones' });
SalonSchema.index({ nombre: 1, colegioId: 1 }, { unique: true });

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN GLOBAL (por colegio o global para superadmin)
// ─────────────────────────────────────────────────────────────────────────────
const ConfigSchema = new Schema({
  key:       { type: String, required: true },
  value:     { type: Schema.Types.Mixed, required: true },
  colegioId: { type: String, default: 'global' },
}, { collection: 'config' });
ConfigSchema.index({ key: 1, colegioId: 1 }, { unique: true });

// ─────────────────────────────────────────────────────────────────────────────
// PLAN DE ESTUDIOS (super admin define áreas/asignaturas/intensidades)
// ─────────────────────────────────────────────────────────────────────────────
const PlanEstudiosSchema = new Schema({
  colegioId:   { type: String, required: true },
  ciclo:       { type: String, enum: ['primaria', 'bachillerato'], required: true },
  grado:       { type: String, required: true },
  area:        { type: String, required: true },
  asignatura:  { type: String, required: true },
  intensidad:  { type: Number, default: 0 },           // horas semanales
  periodo:     { type: String, default: '' },
}, { timestamps: true, collection: 'plan_estudios' });

// ─────────────────────────────────────────────────────────────────────────────
// NOTAS  — tripartita por estudiante / periodo / materia
// ─────────────────────────────────────────────────────────────────────────────
const NotaEntradaSchema = new Schema({
  a: { type: Number, default: 0, min: 0, max: 5 },
  c: { type: Number, default: 0, min: 0, max: 5 },
  r: { type: Number, default: 0, min: 0, max: 5 },
}, { _id: false });

const NotaPeriodoSchema = new Schema({
  periodo:    { type: String, required: true },
  materias:   { type: Schema.Types.Mixed, default: {} },
  disciplina: { type: String, default: '' },
}, { _id: false });

const NotaSchema = new Schema({
  estId:      { type: String, required: true },
  anoLectivo: { type: String, required: true, default: () => String(new Date().getFullYear()) },
  periodos:   [NotaPeriodoSchema],
  disciplina: { type: String, default: '' },
  colegioId:  { type: String, default: '' },
}, { timestamps: true, collection: 'notas' });
NotaSchema.index({ estId: 1, anoLectivo: 1 }, { unique: true });

// ─────────────────────────────────────────────────────────────────────────────
// ASISTENCIA
// ─────────────────────────────────────────────────────────────────────────────
const AsistenciaSchema = new Schema({
  fecha:    { type: String, required: true },
  salon:    { type: String, required: true },
  colegioId:{ type: String, required: true },
  registros: [{
    estId:  { type: String, required: true },
    estado: { type: String, enum: ['presente', 'ausente', 'tarde'], default: 'presente' },
  }],
}, { timestamps: true, collection: 'asistencias' });
AsistenciaSchema.index({ fecha: 1, salon: 1, colegioId: 1 }, { unique: true });

// ─────────────────────────────────────────────────────────────────────────────
// EXCUSA
// ─────────────────────────────────────────────────────────────────────────────
const ExcusaSchema = new Schema({
  estId:    { type: String, required: true },
  enombre:  { type: String, required: true },
  salon:    { type: String, default: '' },
  fecha:    { type: String, required: true },
  dest:     { type: String, required: true },
  causa:    { type: String, required: true },
  desc:     { type: String, default: '' },
  leida:    { type: Boolean, default: false },
  ts:       { type: String, default: '' },
  colegioId:{ type: String, default: '' },
}, { timestamps: true, collection: 'excusas' });

// ─────────────────────────────────────────────────────────────────────────────
// CLASE VIRTUAL
// ─────────────────────────────────────────────────────────────────────────────
const VClaseSchema = new Schema({
  id:          { type: String, required: true, unique: true },
  profId:      { type: String, required: true },
  profNombre:  { type: String, default: '' },
  materias:    { type: String, default: '' },
  salon:       { type: String, required: true },
  fecha:       { type: String, required: true },
  hora:        { type: String, required: true },
  link:        { type: String, required: true },
  desc:        { type: String, default: '' },
  ts:          { type: String, default: '' },
  colegioId:   { type: String, default: '' },
}, { timestamps: true, collection: 'vclases' });

// ─────────────────────────────────────────────────────────────────────────────
// TAREA / UPLOAD
// ─────────────────────────────────────────────────────────────────────────────
const UploadSchema = new Schema({
  id:          { type: String, required: true, unique: true },
  estId:       { type: String, required: true },
  estNombre:   { type: String, required: true },
  profId:      { type: String, default: '' },
  profNombre:  { type: String, default: '' },
  materia:     { type: String, required: true },
  periodo:     { type: String, required: true },
  nombre:      { type: String, required: true },
  desc:        { type: String, default: '' },
  fecha:       { type: String, required: true },
  size:        { type: Number, default: 0 },
  type:        { type: String, default: '' },
  dataUrl:     { type: String, default: '' },
  revisado:    { type: Boolean, default: false },
  revisadoTs:  { type: String, default: '' },
  colegioId:   { type: String, default: '' },
}, { timestamps: true, collection: 'uploads' });

// ─────────────────────────────────────────────────────────────────────────────
// PLAN DE RECUPERACIÓN
// ─────────────────────────────────────────────────────────────────────────────
const PlanSchema = new Schema({
  id:           { type: String, required: true, unique: true },
  estId:        { type: String, required: true },
  estNombre:    { type: String, required: true },
  salon:        { type: String, required: true },
  materia:      { type: String, required: true },
  profId:       { type: String, required: true },
  profNombre:   { type: String, required: true },
  titulo:       { type: String, required: true },
  desc:         { type: String, default: '' },
  fechaLimite:  { type: String, default: '' },
  archNombre:   { type: String, default: '' },
  archDataUrl:  { type: String, default: '' },
  archType:     { type: String, default: '' },
  fecha:        { type: String, required: true },
  visto:        { type: Boolean, default: false },
  esSalon:      { type: Boolean, default: false },
  planId:       { type: String, default: '' },
  archivado:    { type: Boolean, default: false },
  _periodo:     { type: String, default: '' },
  _archivedAt:  { type: String, default: '' },
  colegioId:    { type: String, default: '' },
}, { timestamps: true, collection: 'planes' });

// ─────────────────────────────────────────────────────────────────────────────
// RECUPERACIÓN
// ─────────────────────────────────────────────────────────────────────────────
const RecuperacionSchema = new Schema({
  id:          { type: String, required: true, unique: true },
  estId:       { type: String, required: true },
  estNombre:   { type: String, required: true },
  salon:       { type: String, default: '' },
  materia:     { type: String, required: true },
  profId:      { type: String, required: true },
  planId:      { type: String, default: '' },
  nombre:      { type: String, required: true },
  type:        { type: String, default: '' },
  dataUrl:     { type: String, default: '' },
  desc:        { type: String, default: '' },
  fecha:       { type: String, required: true },
  revisado:    { type: Boolean, default: false },
  revisadoTs:  { type: String, default: '' },
  ts:          { type: String, default: '' },
  archivado:   { type: Boolean, default: false },
  _periodo:    { type: String, default: '' },
  _archivedAt: { type: String, default: '' },
  colegioId:   { type: String, default: '' },
}, { timestamps: true, collection: 'recuperaciones' });

// ─────────────────────────────────────────────────────────────────────────────
// AUDITORÍA
// ─────────────────────────────────────────────────────────────────────────────
const AuditoriaSchema = new Schema({
  ts:       { type: String, required: true },
  uid:      { type: String, default: '' },
  who:      { type: String, default: '' },
  role:     { type: String, default: '' },
  est:      { type: String, default: '' },
  mat:      { type: String, default: '' },
  old:      { type: String, default: '' },
  nw:       { type: String, default: '' },
  ip:       { type: String, default: '' },
  user:     { type: String, default: '' },
  accion:   { type: String, default: '' },
  extra:    { type: String, default: '' },
  colegioId:{ type: String, default: '' },
}, { timestamps: true, collection: 'auditoria' });

// ─────────────────────────────────────────────────────────────────────────────
// HISTORIAL ESTUDIANTE
// ─────────────────────────────────────────────────────────────────────────────
const EstHistSchema = new Schema({
  id:              { type: String, required: true, unique: true },
  nombre:          { type: String, required: true },
  ti:              { type: String, default: '' },
  salon:           { type: String, default: '' },
  registrado:      { type: String, default: '' },
  activo:          { type: Boolean, default: true },
  eliminado:       { type: String, default: '' },
  restaurado:      { type: String, default: '' },
  usuario:         { type: String, default: '' },
  password:        { type: String, default: '' },
  snapSalon:       { type: String, default: '' },
  snapMats:        [{ type: String }],
  snapDisciplina:  { type: String, default: '—' },
  snapNotas:       { type: Schema.Types.Mixed, default: {} },
  snapNotasPorAno: { type: Schema.Types.Mixed, default: {} },
  snapAsist:       { type: Schema.Types.Mixed, default: {} },
  colegioId:       { type: String, default: '' },
}, { timestamps: true, collection: 'est_historial' });

// ─────────────────────────────────────────────────────────────────────────────
// BLOQUEOS DE USUARIO
// ─────────────────────────────────────────────────────────────────────────────
const BloqueoSchema = new Schema({
  usuario: { type: String, required: true, unique: true },
  on:      { type: Boolean, default: true },
  ts:      { type: String, default: '' },
}, { collection: 'bloqueos' });

// ─────────────────────────────────────────────────────────────────────────────
// ESTADÍSTICAS GLOBALES (para dashboard superadmin)
// ─────────────────────────────────────────────────────────────────────────────
const EstadisticaSchema = new Schema({
  colegioId:    { type: String, required: true },
  fecha:        { type: String, required: true },
  totalEst:     { type: Number, default: 0 },
  totalProfs:   { type: Number, default: 0 },
  promNotas:    { type: Number, default: 0 },
  asistPct:     { type: Number, default: 0 },
  ingresosMes:  { type: Number, default: 0 },
}, { timestamps: true, collection: 'estadisticas' });

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  Colegio:       mongoose.model('Colegio',       ColegioSchema),
  Usuario:       mongoose.model('Usuario',       UsuarioSchema),
  Salon:         mongoose.model('Salon',         SalonSchema),
  Config:        mongoose.model('Config',        ConfigSchema),
  PlanEstudios:  mongoose.model('PlanEstudios',  PlanEstudiosSchema),
  Nota:          mongoose.model('Nota',          NotaSchema),
  Asistencia:    mongoose.model('Asistencia',    AsistenciaSchema),
  Excusa:        mongoose.model('Excusa',        ExcusaSchema),
  VClase:        mongoose.model('VClase',        VClaseSchema),
  Upload:        mongoose.model('Upload',        UploadSchema),
  Plan:          mongoose.model('Plan',          PlanSchema),
  Recuperacion:  mongoose.model('Recuperacion',  RecuperacionSchema),
  Auditoria:     mongoose.model('Auditoria',     AuditoriaSchema),
  EstHist:       mongoose.model('EstHist',       EstHistSchema),
  Bloqueo:       mongoose.model('Bloqueo',       BloqueoSchema),
  Estadistica:   mongoose.model('Estadistica',   EstadisticaSchema),
};
