# Vista previa interactiva

`preview.html` es un **demo offline 100% autocontenido** de la interfaz de Solgram Control. Está pensado para que cualquier persona pueda hacerse una idea de cómo se ve y se siente la app sin tener que instalar nada ni configurar Firebase.

## Cómo abrirlo

### Opción 1 — Doble clic
1. Descarga este archivo (botón "Raw" en GitHub o clona el repo).
2. Hazle doble clic. Se abrirá en tu navegador por defecto.

### Opción 2 — Servirlo localmente
```bash
npx serve demo
# luego abre http://localhost:3000/preview.html
```

### Opción 3 — En línea (GitHub Pages)
Si el workflow `.github/workflows/preview.yml` está activo y GitHub Pages habilitado en el repo, queda publicado en:
```
https://gualicio.github.io/Solgram-control/preview.html
```

## Qué incluye

- **Pantalla de Login** con dos roles (Supervisor / Administrador).
- **Dashboard** con KPIs, curva de avance y actividad reciente.
- **Carta Gantt** con barras y estados.
- **Calendario operativo** con turnos 14×14.
- **Reportes diarios** (tabla con acciones distintas según rol).
- **Control de Personal** con grupos y estados.
- **Chat de Solgramia** con respuestas simuladas.
- **Modo claro/oscuro**.

## Qué NO incluye

- No hay backend real: todos los datos son de muestra (estáticos).
- El chat NO consulta a Gemini, devuelve respuestas predefinidas.
- Los formularios no guardan nada (es una vista previa visual).
- Cualquier email/contraseña funciona en el login del admin (es demo).
