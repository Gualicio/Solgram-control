# Vista previa de Solgram Control

Hay **dos versiones** de la vista previa, ambas funcionan offline (no necesitan Firebase ni servidor).

## 🟢 Versión completa (la app real en modo demo)

Es la app React entera, compilada con `VITE_DEMO_MODE=true`. Reemplaza Firebase por mocks en memoria + localStorage, así puedes:

- Crear, editar y borrar reportes diarios → se guardan en tu navegador.
- Importar archivos `.xer` de Primavera P6 (la importación corre 100% en el cliente).
- Editar el personal, asignar grupos y estados.
- Subir fotos a los reportes (se guardan como base64 en localStorage).
- Cambiar entre rol **Supervisor** y **Administrador**.
- Conversar con Solgramia (responde con datos reales del browser, sin Gemini).
- Recargar la página y ver que todo persiste.

### Cómo verla

**En línea (después del primer push a `main`):**
```
https://gualicio.github.io/Solgram-control/
```
Para activarlo una vez: en el repo de GitHub, **Settings → Pages → Source: "GitHub Actions"**. El workflow `.github/workflows/preview.yml` construye y publica automáticamente.

**En tu computador:**
```bash
npm install
npm run dev:demo                 # abre http://localhost:5173
# o
npm run preview:demo             # build + preview en :4173
```

### Cómo funciona internamente

- `src/demo/firestore-mock.ts` — Firestore en memoria con persistencia en `localStorage` (`solgram-demo-firestore-v1`).
- `src/demo/auth-mock.ts` — Auth simulada. Cualquier email/contraseña entra como admin; "Supervisor" entra anónimo.
- `src/demo/seed.ts` — datos iniciales (12 trabajadores, 5 reportes, schedule con WBS, licencias, horas extra).
- `vite.config.ts` aliasea `firebase/firestore`, `firebase/auth`, `firebase/app` y `firebase/analytics` a esos mocks cuando se construye con `VITE_DEMO_MODE=true`.
- `App.tsx` muestra un banner naranja "Modo demo · datos locales" arriba al centro y un botón **(reset)** para volver al estado inicial.

## 🟡 Versión "vistazo rápido" (preview.html)

`preview.html` es un único archivo HTML con datos completamente estáticos. No es la app real, es una maqueta visual liviana. Útil cuando solo quieres ver el estilo sin esperar la descarga del bundle.

```
https://gualicio.github.io/Solgram-control/preview.html
```

O bien doble clic sobre `demo/preview.html` desde tu disco.

---

## Diferencia con la app de producción

| | preview.html | demo bundle | producción |
|---|---|---|---|
| Backend | ❌ | mock | Firebase real |
| Persiste cambios | ❌ | localStorage | Firestore |
| Importar XER | ❌ | ✅ | ✅ |
| Editar reportes | ❌ | ✅ | ✅ |
| Chat Solgramia | canned | canned (datos del state) | Gemini real |
| Login email/password | demo | demo | Firebase Auth |
| Drive / Calendar | ❌ | ❌ (necesita OAuth real) | ✅ |
