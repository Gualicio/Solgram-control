import express, { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import admin from "firebase-admin";

dotenv.config({ override: true });

// ---------------------------------------------------------------------------
// Firebase Admin SDK initialization (used to verify ID tokens of clients).
// Looks for credentials in this order:
//   1) GOOGLE_APPLICATION_CREDENTIALS env (path to JSON key)
//   2) FIREBASE_SERVICE_ACCOUNT env (raw JSON string)
//   3) Application Default Credentials (e.g. on Cloud Run / GCE)
// If none is available, the server still starts but /api/chat will refuse
// requests because there is no way to verify users.
// ---------------------------------------------------------------------------
let adminInitialized = false;
function initFirebaseAdmin() {
  if (adminInitialized) return;
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } else {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
    }
    adminInitialized = true;
    console.log("Firebase Admin SDK initialized.");
  } catch (err) {
    console.warn(
      "Firebase Admin SDK could not be initialized. " +
        "Authenticated endpoints will reject all requests until credentials " +
        "are provided (GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT).",
      err instanceof Error ? err.message : err
    );
  }
}

interface AuthedRequest extends Request {
  user?: admin.auth.DecodedIdToken;
}

// Verifies the Bearer token sent by the client.  Refuses the request if the
// token is missing, invalid or the Admin SDK is not configured.
async function verifyFirebaseToken(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  if (!adminInitialized) {
    return res
      .status(503)
      .json({ error: "Servidor no configurado para autenticar peticiones." });
  }
  const authHeader = req.header("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ error: "Falta token de autenticación." });
  }
  try {
    req.user = await admin.auth().verifyIdToken(match[1]);
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Token inválido o expirado." });
  }
}

async function startServer() {
  initFirebaseAdmin();

  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Body limits intentionally low: chat payloads are small.
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));

  // Rate limit specifically for /api/chat to avoid burning Gemini quota.
  const chatLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20,             // 20 requests / minute / IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Demasiadas solicitudes. Intenta en un momento." },
  });

  // -------------------------------------------------------------------------
  // /api/chat — Solgramia (Gemini) chatbot.  Requires Firebase auth + RL.
  // -------------------------------------------------------------------------
  app.post(
    "/api/chat",
    chatLimiter,
    verifyFirebaseToken,
    async (req: AuthedRequest, res: Response) => {
      try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          return res.status(500).json({
            error:
              "GEMINI_API_KEY no está configurada en el servidor. Configúrala en las variables de entorno.",
          });
        }

        const ai = new GoogleGenAI({
          apiKey: apiKey,
          httpOptions: {
            headers: { "User-Agent": "solgram-control" },
          },
        });

        const { message, chatHistory, appStateContext } = req.body || {};

        if (typeof message !== "string" || message.trim().length === 0) {
          return res.status(400).json({ error: "Mensaje vacío." });
        }
        if (message.length > 4000) {
          return res.status(400).json({ error: "Mensaje demasiado largo." });
        }

        const systemInstruction = `Eres 'Solgramia', un asistente experto en gestión de proyectos de construcción y minería.
Tu objetivo es analizar los datos del proyecto proporcionados y responder consultas sobre:
1. Carta Gantt (Cronograma): Fechas, duraciones, estados de tareas.
2. Control de Personal: Trabajadores en turno, asistencia, cargos.
3. Reportabilidad: Avances diarios, HH (Horas Hombre) reportadas, desviaciones.

REGLAS CRÍTICAS:
- Responde siempre en ESPAÑOL.
- Sé conciso, profesional y basado estrictamente en los datos del contexto proporcionado.
- Si no encuentras un dato específico, indícalo cortésmente.
- Los 'dailyReports' son la fuente de la verdad para el avance real.
- LÓGICA DE TURNOS (14x14): El app proporciona un 'shiftConfig' con 'anchorDate' (fecha inicio) y 'anchorShift' (quien inicia). La rotación es de 14 días.
  Si anchorShift es 'A', el Grupo A trabaja los primeros 14 días desde anchorDate, mientras B descansa. Luego B trabaja 14 días y A descansa.
  Calcula esto para cualquier fecha preguntada.

CONTEXTO ACTUAL DEL PROYECTO (JSON):
${JSON.stringify(appStateContext || {})}`;

        // Limit history length to keep prompt size bounded.
        const recentHistory = Array.isArray(chatHistory)
          ? chatHistory.slice(-30)
          : [];

        const history = recentHistory.map((msg: any) => ({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: String(msg.message || "") }],
        }));

        const chatWithHistory = ai.chats.create({
          model: "gemini-2.5-flash",
          config: { systemInstruction },
          history,
        });

        const response = await chatWithHistory.sendMessage({ message });

        if (!response.text) {
          throw new Error("La IA no devolvió texto.");
        }

        return res.json({ text: response.text });
      } catch (error: any) {
        console.error("Chat Error:", error?.message || error);
        let errorMessage =
          error?.message || "Error al procesar el chat con Solgramia";
        if (
          typeof errorMessage === "string" &&
          (errorMessage.includes("API key not valid") ||
            errorMessage.includes("API_KEY_INVALID"))
        ) {
          errorMessage =
            "La API Key de Gemini es inválida. Actualízala en las variables de entorno del servidor.";
        }
        return res.status(500).json({ error: errorMessage });
      }
    }
  );

  // Healthcheck (público, no expone información sensible).
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  // -------------------------------------------------------------------------
  // Vite middleware (dev) o estáticos del build (prod).
  // -------------------------------------------------------------------------
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    if (!fs.existsSync(distPath)) {
      console.warn(
        `dist/ no existe en ${distPath}. ¿Olvidaste correr "npm run build"?`
      );
    }
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
