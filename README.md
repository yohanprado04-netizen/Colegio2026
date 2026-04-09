# EduSistema Pro — Backend MongoDB Atlas

## Estructura del proyecto

```
edusistema-backend/
├── config/
│   └── db.js              ← Conexión a MongoDB Atlas
├── middleware/
│   └── auth.js            ← JWT + guardas de rol
├── models/
│   └── index.js           ← Todos los modelos Mongoose
├── routes/
│   ├── auth.js            ← POST /api/auth/login
│   ├── db.js              ← GET|PUT /api/db (compatibilidad completa)
│   └── api.js             ← Rutas granulares por entidad
├── scripts/
│   └── seed.js            ← Seed inicial de la BD
├── .env                   ← Variables de entorno (NO subir a git)
├── .gitignore
├── package.json
└── server.js              ← Entrada principal
```

---

## Instalación

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
# Editar .env y poner tu contraseña real en MONGODB_URI:
MONGODB_URI=mongodb+srv://yohanprado04_db_user:colegio2026@prado04.t4d8ob8.mongodb.net/edusistema?retryWrites=true&w=majority

# 3. Cargar datos iniciales (solo la primera vez)
node scripts/seed.js

# 4. Arrancar el servidor
npm start
# o en desarrollo:
npm run dev
```

---

## Variables de entorno (.env)

| Variable | Descripción |
|---|---|
| `MONGODB_URI` | Cadena de conexión MongoDB Atlas |
| `DB_NAME` | Nombre de la base de datos (`edusistema`) |
| `JWT_SECRET` | Clave secreta para firmar tokens JWT |
| `JWT_EXPIRES_IN` | Duración del token (`20m` = 20 minutos) |
| `PORT` | Puerto del servidor (default: 3001) |
| `FRONTEND_URL` | URL del frontend para CORS |

---

## Endpoints principales

### Autenticación
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` | Login → devuelve JWT + datos usuario |

### DB completo (compatibilidad con frontend)
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/db` | Carga todo el objeto DB (como localStorage) |
| PUT | `/api/db` | Guarda todo el objeto DB (solo admin) |

### Granular
| Método | Ruta | Descripción |
|---|---|---|
| GET/POST/PUT/DELETE | `/api/usuarios` | CRUD usuarios |
| GET/POST/PUT/DELETE | `/api/salones` | CRUD salones |
| GET/PUT | `/api/config/:key` | Configuración global |
| GET/PUT | `/api/notas/:estId` | Notas tripartitas |
| GET/PUT | `/api/asistencias` | Registros de asistencia |
| GET/POST | `/api/excusas` | Excusas |
| GET/POST/DELETE | `/api/vclases` | Clases virtuales |
| GET/POST/DELETE | `/api/uploads` | Tareas/talleres |
| GET/POST | `/api/planes` | Planes de recuperación |
| GET/POST/DELETE | `/api/recuperaciones` | Respuestas de recuperación |
| GET/POST/DELETE | `/api/auditoria` | Historial de auditoría |
| GET/PUT | `/api/bloqueos` | Bloqueos de usuarios |
| GET/PUT | `/api/est-hist` | Historial de estudiantes |

### Sistema
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado del servidor y BD |

---

## Credenciales iniciales (después del seed)

| Rol | Usuario | Contraseña |
|---|---|---|
| Admin | `admin` | `admin123` |
| Profesor | `profe1` | `profe123` |
| Estudiante | `est1` | `est1123` |
| Estudiante | `est2` | `est2123` |
| … | … | … |

> ⚠️ **Cambia las contraseñas en producción.**

---

## Frontend

El archivo `edusistema-frontend-mongodb.html` reemplaza `localStorage` por
llamadas a esta API. Configurar la URL del backend al inicio del script:

```javascript
const API_BASE = 'https://colegio2026.onrender.com; // producción: 'https://tu-backend.com'
```

---

## Despliegue recomendado

- **Backend**: Railway, Render, Heroku, o VPS (Node.js)
- **Frontend**: Netlify, Vercel, GitHub Pages, o mismo VPS con nginx
- **BD**: MongoDB Atlas (cluster gratuito M0 es suficiente para empezar)

### MongoDB Atlas — configurar IP
En Atlas → Network Access → Add IP Address → Allow from Anywhere (0.0.0.0/0)
o agrega la IP específica de tu servidor backend.
