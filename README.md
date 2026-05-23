# Solgram Control

Suite unificada de control de proyectos de construcción/minería:

- **Dashboard**: indicadores principales del proyecto.
- **Gantt XER**: importa cronogramas de Primavera P6 (`.xer`).
- **Control de Personal**: dotación, turnos 14×14, licencias.
- **Reporte Diario**: avances, HH, fotografías.
- **Asistente IA "Solgramia"** (Gemini) para consultar el estado del proyecto.
- Sincronización en tiempo real con **Firestore** y respaldo a **Google Drive / Calendar**.

Stack: React 19 + TypeScript + Vite 6 + Tailwind 4 + Firebase 12 + Express 4.

---

## Requisitos

- Node.js 20+
- Una cuenta de Firebase con Firestore habilitado
- Una API Key de Gemini

## Instalación

```bash
npm install
cp .env.example .env
# rellenar GEMINI_API_KEY y GOOGLE_APPLICATION_CREDENTIALS
```

## Configuración de Firebase

1. Pega la configuración pública del proyecto Firebase en `firebase-applet-config.json`.
2. Despliega las reglas de Firestore (ver `firestore.rules`):
   ```bash
   firebase deploy --only firestore:rules
   ```
3. Crea el primer administrador (la colección `/admins` solo se administra desde el backend):
   ```bash
   # En Firebase Auth crea manualmente el usuario admin@miempresa.cl
   # Luego:
   BOOTSTRAP_ADMIN_EMAIL=admin@miempresa.cl npm run bootstrap-admin
   ```

## Ejecutar en local

```bash
npm run dev
# http://localhost:3000
```

## Build de producción

```bash
npm run build
npm start
```

---

## Modelo de seguridad

- **Supervisor (worker)**: sesión anónima de Firebase. Puede crear reportes diarios y consultar datos. No puede borrar reportes ni modificar la configuración del proyecto.
- **Administrador**: inicia sesión con email + contraseña (Firebase Auth) y debe tener un documento en `/admins/{uid}`. Solo administradores pueden:
  - Borrar reportes.
  - Editar el cronograma (Gantt).
  - Modificar el personal.
  - Cambiar configuración global.

Las **reglas de Firestore** son la única fuente de verdad: el cliente no puede saltárselas aunque modifique código o consola del navegador.

El endpoint `/api/chat` exige un Firebase **ID Token** válido y aplica rate-limit (20 req/min por IP).

## Variables de entorno

Ver `.env.example`. Las críticas son:

| Variable | Para qué sirve |
| --- | --- |
| `GEMINI_API_KEY` | Llama a Gemini desde `/api/chat`. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Ruta a un service-account de Firebase para verificar tokens en el backend. |
| `FIREBASE_SERVICE_ACCOUNT` | Alternativa a la anterior, JSON inline. |

---

## Estructura

```
.
├─ server.ts               # API Express (chat + estáticos en producción)
├─ firestore.rules         # Reglas de seguridad de Firestore
├─ firebase-blueprint.json # Esquema lógico
├─ scripts/
│   └─ bootstrap-admin.cjs # Crear el primer admin
├─ src/
│   ├─ App.tsx
│   ├─ AppContext.tsx      # Estado global + sync Firestore
│   ├─ firebase.ts         # Inicialización Firebase Web SDK
│   ├─ types.ts            # Tipos compartidos
│   ├─ components/         # UI compartida + chat Solgramia
│   ├─ hooks/
│   ├─ lib/                # Drive, Calendar, PDF, utils
│   └─ modules/            # Pantallas (Dashboard, Gantt, etc.)
└─ backend/
    └─ upload_report.php   # Subida de imágenes a Drive (legacy)
```
