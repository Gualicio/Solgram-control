# Solgram Control

Suite unificada de control de proyectos de construcción/minería:

- **Dashboard**: indicadores principales del proyecto.
- **Gantt XER**: importa cronogramas de Primavera P6 (`.xer`).
- **Control de Personal**: dotación, turnos 14×14, licencias.
- **Reporte Diario**: avances, HH, fotografías.
- **Asistente IA "Solgramia"** (Gemini) para consultar el estado del proyecto.
- Sincronización en tiempo real con **Firestore** y respaldo a **Google Drive / Calendar**.

Stack: React 19 + TypeScript + Vite 6 + Tailwind 4 + Firebase 12 (Hosting + Firestore + Auth + Functions).

---

## Requisitos

- Node.js 20+
- Una cuenta de Firebase con Firestore + Authentication habilitados
- Una API Key de Gemini ([aistudio.google.com](https://aistudio.google.com/app/apikey))
- `firebase-tools` instalado: `npm install -g firebase-tools`

## 1) Setup inicial

```bash
git clone https://github.com/Gualicio/Solgram-control.git
cd Solgram-control
git checkout fix/security-hardening-and-cleanup
npm install
npm --prefix functions install
```

Inicia sesión en Firebase y selecciona el proyecto:

```bash
firebase login
firebase use --add        # elegir el projectId
```

Edita `firebase-applet-config.json` con la configuración pública de tu proyecto Firebase (apiKey, authDomain, etc.).

Crea un service-account en Firebase Console → "Configuración del proyecto" → "Cuentas de servicio" → "Generar nueva clave privada", guárdalo como `service-account.json` (ya está en `.gitignore`).

```bash
cp .env.example .env
# rellena GEMINI_API_KEY y GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
```

## 2) Habilitar el método de login en Firebase

En Firebase Console → **Authentication** → "Sign-in method":
- Habilita **Email/Password**.
- Habilita **Anonymous** (para los supervisores).

## 3) Subir las reglas de seguridad

```bash
npm run deploy:rules
```

## 4) Crear el primer administrador

Como `/admins` solo se administra desde el backend, hay que ejecutarlo manualmente:

```bash
# 1. En Firebase Console > Authentication crea el usuario admin@empresa.cl
# 2. Promueve ese usuario a admin:
BOOTSTRAP_ADMIN_EMAIL=admin@empresa.cl npm run bootstrap-admin
```

## 5) Probar en local

```bash
npm run dev
# http://localhost:3000
```

- "Supervisor" entra sin clave (sesión anónima).
- "Administrador de Obra" pide email + password (los del paso 4).

## 6) Desplegar a Firebase Hosting + Functions

Configura el secreto de Gemini en Firebase Functions:

```bash
firebase functions:secrets:set GEMINI_API_KEY
# pega tu API key cuando lo pida
```

Despliega todo:

```bash
npm run deploy
```

Cuando termine te dará una URL tipo `https://<tu-proyecto>.web.app`. Esa es tu app pública.

Despliegues parciales:

```bash
npm run deploy:hosting     # solo el frontend
npm run deploy:functions   # solo /api/chat
npm run deploy:rules       # solo Firestore rules
```

---

## Cómo funciona la arquitectura

```
┌─────────────────────────────────────┐
│  Firebase Hosting                   │
│  ─────────────────                  │
│  /                  → React SPA     │
│  /api/**            → Cloud Function│ "api"
└─────────────┬───────────────────────┘
              │
              ▼
        Cloud Function "api"
        ─────────────────────
        - Verifica Firebase ID Token
        - Rate limit 20 req/min/IP
        - Llama a Gemini con el secret
              │
              ▼
        ┌──────────────┐
        │  Firestore   │  ← reglas estrictas
        │   /admins    │     (admins solo Admin SDK)
        │   /reports   │     (escribir = autenticado)
        │   /workers   │     (escribir = admin)
        │   /config    │     (escribir = admin)
        └──────────────┘
```

## Modelo de seguridad

- **Supervisor (worker)**: sesión anónima de Firebase. Puede crear/editar reportes diarios y consultar datos. No puede borrar reportes ni modificar la configuración del proyecto.
- **Administrador**: inicia sesión con email + contraseña (Firebase Auth) y debe tener un documento en `/admins/{uid}`. Solo administradores pueden borrar reportes, editar el cronograma, modificar el personal y cambiar la configuración global.

Las **reglas de Firestore** son la única fuente de verdad: el cliente no puede saltárselas aunque modifique el código en el navegador.

El endpoint `/api/chat` exige un Firebase **ID Token** válido y aplica rate-limit (20 req/min por IP).

## Variables de entorno

Ver `.env.example`. Las críticas son:

| Variable | Para qué sirve |
| --- | --- |
| `GEMINI_API_KEY` | API Key de Gemini. En producción configurada con `firebase functions:secrets:set`. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Solo para `npm run dev` y el script de bootstrap. En Functions se inyecta automáticamente. |

## Estructura

```
.
├─ firebase.json           # Config de Hosting + Functions + Firestore + Emuladores
├─ firestore.rules         # Reglas de seguridad
├─ firestore.indexes.json  # Índices compuestos
├─ .firebaserc             # Alias del projectId
├─ server.ts               # Servidor Express SOLO para `npm run dev`
├─ functions/
│   └─ src/index.ts        # Cloud Function /api/chat
├─ scripts/
│   └─ bootstrap-admin.cjs # Crear el primer admin
├─ src/                    # Frontend React
│   ├─ App.tsx
│   ├─ AppContext.tsx
│   ├─ firebase.ts
│   ├─ components/
│   ├─ hooks/
│   ├─ lib/
│   └─ modules/
└─ backend/
    └─ upload_report.php   # Subida a Drive (legacy, opcional)
```

## Alternativas de despliegue

Si prefieres **Cloud Run** (un único servidor Express, sin Functions):

```bash
npm run build:cloudrun
# Sube la carpeta + Dockerfile a Cloud Run
```

Si prefieres correr todo localmente con emuladores Firebase:

```bash
npm run emulators
```
