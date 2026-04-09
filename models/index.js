// models/index.js — Todos los modelos con índices optimizados para 50k+ estudiantes
require('dotenv').config();
'use strict';
const mongoose = require('mongoose');
const { Schema } = mongoose;

// ─────────────────────────────────────────────────────────────────────────────
// COLEGIO
// ─────────────────────────────────────────────────────────────────────────────
const ColegioSchema = new Schema({
  id:           { type: String, required: true, unique: true },
  nombre:       { type: String, required: true, trim: true },
  codigo:       { type: String, default: '' },
  direccion:    { type: String, default: '' },
  telefono:     { type: String, default: '' },
  logo:         { type: String, default: '' },
  activo:       { type: Boolean, default: true },
  sedes:        [{ type: String }],
  jornadas:     [{ type: String }],
  createdBy:    { type: String, default: 'superadmin' },
}, { timestamps: true, collection: 'colegios' });

// ─────────────────────────────────────────────────────────────────────────────
// USUARIO
// ─────────────────────────────────────────────────────────────────────────────
const UsuarioSchema = new Schema({
  id:            { type: String, required: true, unique: true },
  nombre:        { type: String, required: true, trim: true },
  ti:            { type: String, default: '' },
  usuario:       { type: String, required: true, unique: true, trim: true },
  password:      { type: String, required: true },
  role:          { type: String, enum: ['superadmin','admin','profe','est'], required: true },
  blocked:       { type: Boolean, default: false },
  colegioId:     { type: String, default: null, index: true },
  colegioNombre: { type: String, default: '' },
  // Solo estudiantes
  salon:         { type: String, default: '' },
  registrado:    { type: String, default: '' },
  // Solo profesores
  ciclo:         { type: String, enum: ['primaria','bachillerato',''], default: '' },
  salones:       [{ type: String }],
  materias:      [{ type: String }],
  materia:       { type: String, default: '' },
  salonMaterias: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true, collection: 'usuarios' });
// Índice compuesto para queries multi-tenant frecuentes
UsuarioSchema.index({ colegioId: 1, role: 1 });
UsuarioSchema.index({ colegioId: 1, salon: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// SALÓN
// ─────────────────────────────────────────────────────────────────────────────
const SalonSchema = new Schema({
  nombre:    { type: String, required: true, trim: true },
  ciclo:     { type: String, enum: ['primaria','bachillerato'], required: true },
  mats:      [{ type: String }],
  colegioId: { type: String, required: true, index: true },
}, { timestamps: true, collection: 'salones' });
SalonSchema.index({ nombre: 1, colegioId: 1 }, { unique: true });

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN (por colegio)
// ─────────────────────────────────────────────────────────────────────────────
const ConfigSchema = new Schema({
  key:       { type: String, required: true },
  value:     { type: Schema.Types.Mixed, required: true },
  colegioId: { type: String, default: 'global' },
}, { collection: 'config' });
ConfigSchema.index({ key: 1, colegioId: 1 }, { unique: true });

// ─────────────────────────────────────────────────────────────────────────────
// PLAN DE ESTUDIOS
// ─────────────────────────────────────────────────────────────────────────────
const PlanEstudiosSchema = new Schema({
  colegioId:  { type: String, required: true, index: true },
  ciclo:      { type: String, enum: ['primaria','bachillerato'], required: true },
  grado:      { type: String, required: true },
  area:       { type: String, required: true },
  asignatura: { type: String, required: true },
  intensidad: { type: Number, default: 0 },
  periodo:    { type: String, default: '' },
}, { timestamps: true, collection: 'plan_estudios' });
PlanEstudiosSchema.index({ colegioId: 1, ciclo: 1, grado: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// NOTAS — índice compuesto crítico para escala
// ─────────────────────────────────────────────────────────────────────────────
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
  colegioId:  { type: String, default: '', index: true },
}, { timestamps: true, collection: 'notas' });
// Único por (estId, anoLectivo, colegioId) — clave de acceso más frecuente
NotaSchema.index({ estId: 1, anoLectivo: 1, colegioId: 1 }, { unique: true });
NotaSchema.index({ colegioId: 1, anoLectivo: 1 }); // para agregaciones del superadmin

// ─────────────────────────────────────────────────────────────────────────────
// ASISTENCIA
// ─────────────────────────────────────────────────────────────────────────────
const AsistenciaSchema = new Schema({
  fecha:     { type: String, required: true },
  salon:     { type: String, required: true },
  colegioId: { type: String, required: true, index: true },
  registros: [{
    estId:  { type: String, required: true },
    estado: { type: String, enum: ['presente','ausente','tarde'], default: 'presente' },
  }],
}, { timestamps: true, collection: 'asistencias' });
AsistenciaSchema.index({ fecha: 1, salon: 1, colegioId: 1 }, { unique: true });
AsistenciaSchema.index({ colegioId: 1, fecha: 1 }); // listado por fecha

// ─────────────────────────────────────────────────────────────────────────────
// EXCUSA
// ─────────────────────────────────────────────────────────────────────────────
const ExcusaSchema = new Schema({
  estId:     { type: String, required: true },
  enombre:   { type: String, required: true },
  salon:     { type: String, default: '' },
  fecha:     { type: String, required: true },
  dest:      { type: String, required: true },
  causa:     { type: String, required: true },
  desc:      { type: String, default: '' },
  leida:     { type: Boolean, default: false },
  ts:        { type: String, default: '' },
  colegioId: { type: String, default: '', index: true },
}, { timestamps: true, collection: 'excusas' });
ExcusaSchema.index({ colegioId: 1, estId: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// CLASE VIRTUAL
// ─────────────────────────────────────────────────────────────────────────────
const VClaseSchema = new Schema({
  id:         { type: String, required: true, unique: true },
  profId:     { type: String, required: true },
  profNombre: { type: String, default: '' },
  materias:   { type: String, default: '' },
  salon:      { type: String, required: true },
  fecha:      { type: String, required: true },
  hora:       { type: String, required: true },
  link:       { type: String, required: true },
  desc:       { type: String, default: '' },
  ts:         { type: String, default: '' },
  colegioId:  { type: String, default: '', index: true },
}, { timestamps: true, collection: 'vclases' });

// ─────────────────────────────────────────────────────────────────────────────
// UPLOAD (TAREA)
// ─────────────────────────────────────────────────────────────────────────────
const UploadSchema = new Schema({
  id:         { type: String, required: true, unique: true },
  estId:      { type: String, required: true },
  estNombre:  { type: String, required: true },
  profId:     { type: String, default: '' },
  profNombre: { type: String, default: '' },
  materia:    { type: String, required: true },
  periodo:    { type: String, required: true },
  nombre:     { type: String, required: true },
  desc:       { type: String, default: '' },
  fecha:      { type: String, required: true },
  size:       { type: Number, default: 0 },
  type:       { type: String, default: '' },
  dataUrl:    { type: String, default: '' }, // base64 — se excluye de listados
  revisado:   { type: Boolean, default: false },
  revisadoTs: { type: String, default: '' },
  colegioId:  { type: String, default: '', index: true },
}, { timestamps: true, collection: 'uploads' });
UploadSchema.index({ colegioId: 1, estId: 1 });
UploadSchema.index({ colegioId: 1, profId: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// PLAN DE RECUPERACIÓN
// ─────────────────────────────────────────────────────────────────────────────
const PlanSchema = new Schema({
  id:          { type: String, required: true, unique: true },
  estId:       { type: String, required: true },
  estNombre:   { type: String, required: true },
  salon:       { type: String, required: true },
  materia:     { type: String, required: true },
  profId:      { type: String, required: true },
  profNombre:  { type: String, required: true },
  titulo:      { type: String, required: true },
  desc:        { type: String, default: '' },
  fechaLimite: { type: String, default: '' },
  archNombre:  { type: String, default: '' },
  archDataUrl: { type: String, default: '' },
  archType:    { type: String, default: '' },
  fecha:       { type: String, required: true },
  visto:       { type: Boolean, default: false },
  esSalon:     { type: Boolean, default: false },
  planId:      { type: String, default: '' },
  archivado:   { type: Boolean, default: false },
  _periodo:    { type: String, default: '' },
  _archivedAt: { type: String, default: '' },
  colegioId:   { type: String, default: '', index: true },
}, { timestamps: true, collection: 'planes' });
PlanSchema.index({ colegioId: 1, archivado: 1 });

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
  colegioId:   { type: String, default: '', index: true },
}, { timestamps: true, collection: 'recuperaciones' });
RecuperacionSchema.index({ colegioId: 1, archivado: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// AUDITORÍA
// ─────────────────────────────────────────────────────────────────────────────
const AuditoriaSchema = new Schema({
  ts:        { type: String, required: true },
  uid:       { type: String, default: '' },
  who:       { type: String, default: '' },
  role:      { type: String, default: '' },
  est:       { type: String, default: '' },
  mat:       { type: String, default: '' },
  old:       { type: String, default: '' },
  nw:        { type: String, default: '' },
  ip:        { type: String, default: '' },
  user:      { type: String, default: '' },
  accion:    { type: String, default: '' },
  extra:     { type: String, default: '' },
  colegioId: { type: String, default: '', index: true },
}, { timestamps: true, collection: 'auditoria' });
AuditoriaSchema.index({ colegioId: 1, createdAt: -1 });

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
  colegioId:       { type: String, default: '', index: true },
}, { timestamps: true, collection: 'est_historial' });

// ─────────────────────────────────────────────────────────────────────────────
// BLOQUEOS
// ─────────────────────────────────────────────────────────────────────────────
const BloqueoSchema = new Schema({
  usuario:   { type: String, required: true, unique: true },
  on:        { type: Boolean, default: true },
  ts:        { type: String, default: '' },
  colegioId: { type: String, default: '' },
}, { collection: 'bloqueos' });

// ─────────────────────────────────────────────────────────────────────────────
// SUGERENCIAS — enviadas por cualquier usuario al superadmin
// ─────────────────────────────────────────────────────────────────────────────
const SugerenciaSchema = new Schema({
  uid:           { type: String, required: true },
  nombre:        { type: String, default: '' },
  role:          { type: String, default: '' },
  colegioId:     { type: String, default: '' },
  colegioNombre: { type: String, default: '' },
  titulo:        { type: String, default: '' },
  mensaje:       { type: String, required: true },
  categoria:     { type: String, default: 'general' },
  leida:         { type: Boolean, default: false },
  leidaTs:       { type: String, default: '' },
  respuesta:     { type: String, default: '' },
  respondidaTs:  { type: String, default: '' },
  ts:            { type: String, default: '' },
}, { timestamps: true, collection: 'sugerencias' });
SugerenciaSchema.index({ uid: 1 });
SugerenciaSchema.index({ leida: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// PAPELERA — colegios y admins eliminados (para restauración)
// ─────────────────────────────────────────────────────────────────────────────
const PapeleraSchema = new Schema({
  tipo:          { type: String, enum: ['colegio', 'admin'], required: true },
  eliminadoTs:   { type: String, required: true },
  eliminadoPor:  { type: String, default: '' },
  // Snapshot completo del colegio o admin eliminado
  datos:         { type: Schema.Types.Mixed, required: true },
  // Datos relacionados (solo para colegios)
  admins:        { type: Schema.Types.Mixed, default: null },
  config:        { type: Schema.Types.Mixed, default: null },
}, { timestamps: true, collection: 'papelera' });
PapeleraSchema.index({ tipo: 1 });

// ─────────────────────────────────────────────────────────────────────────────
// ESTADÍSTICAS (snapshot periódico — para no recalcular siempre)
// ─────────────────────────────────────────────────────────────────────────────
const EstadisticaSchema = new Schema({
  colegioId:   { type: String, required: true },
  fecha:       { type: String, required: true },
  totalEst:    { type: Number, default: 0 },
  totalProfs:  { type: Number, default: 0 },
  promNotas:   { type: Number, default: 0 },
  asistPct:    { type: Number, default: 0 },
  ingresosMes: { type: Number, default: 0 },
}, { timestamps: true, collection: 'estadisticas' });
EstadisticaSchema.index({ colegioId: 1, fecha: -1 });

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
  Sugerencia:    mongoose.model('Sugerencia',    SugerenciaSchema),
  Papelera:      mongoose.model('Papelera',      PapeleraSchema),
};