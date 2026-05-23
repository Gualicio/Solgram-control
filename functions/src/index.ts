/**
 * Cloud Functions de Solgram Control.
 *
 * Expone el endpoint `/api/chat` para el asistente Solgramia (Gemini).
 * Firebase Hosting reescribe `/api/**` hacia esta función, así que la app
 * web puede llamarla en su mismo dominio sin CORS.
 *
 * La función:
 *   - Verifica el Firebase ID Token enviado por el cliente.
 *   - Aplica rate limit de 20 req/min/IP.
 *   - Llama a Gemini con la API key cargada desde Secret Manager.
 */

import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { setGlobalOptions } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import express, { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { GoogleGenAI } from "@google/genai";

// Configuración global de las funciones (región, recursos, concurrencia).
setGlobalOptions({
  region: "us-central1",
  maxInstances: 10,
  memory: "512MiB",
  timeoutSeconds: 60,
});

// Secreto de Gemini, se inyecta como variable de entorno en runtime.
// Configurar con:  firebase functions:secrets:set GEMINI_API_KEY
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

admin.initializeApp();

interface AuthedRequest extends Request {
  user?: admin.auth.DecodedIdToken;
}

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ limit: "1mb", extended: true }));

// Rate limit por IP.  Nota: en Cloud Functions el contador es por instancia,
// así que con muchas instancias el throttle no es global.  Para tráfico
// pequeño (caso típico) es suficiente como protección anti-spam.
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes. Intenta en un momento." },
});

async function verifyFirebaseToken(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.header("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({ error: "Falta token de autenticación." });
    return;
  }
  try {
    req.user = await admin.auth().verifyIdToken(match[1]);
    next();
  } catch (err) {
    res.status(401).json({ error: "Token inválido o expirado." });
  }
}

app.post(
  "/api/chat",
  chatLimiter,
  verifyFirebaseToken,
  async (req: AuthedRequest, res: Response): Promise<void> => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        res.status(500).json({
          error:
            "GEMINI_API_KEY no está configurada en el servidor.  Ejecuta: firebase functions:secrets:set GEMINI_API_KEY",
        });
        return;
      }

      const { message, chatHistory, appStateContext } = req.body || {};

      if (typeof message !== "string" || message.trim().length === 0) {
        res.status(400).json({ error: "Mensaje vacío." });
        return;
      }
      if (message.length > 4000) {
        res.status(400).json({ error: "Mensaje demasiado largo." });
        return;
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { "User-Agent": "solgram-control" } },
      });

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

      // Limitar historia para acotar tamaño del prompt.
      const recentHistory = Array.isArray(chatHistory)
        ? chatHistory.slice(-30)
        : [];

      const history = recentHistory.map((msg: { role?: string; message?: string }) => ({
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

      res.json({ text: response.text });
    } catch (error) {
      const err = error as { message?: string };
      console.error("Chat Error:", err?.message || error);
      let errorMessage =
        err?.message || "Error al procesar el chat con Solgramia";
      if (
        typeof errorMessage === "string" &&
        (errorMessage.includes("API key not valid") ||
          errorMessage.includes("API_KEY_INVALID"))
      ) {
        errorMessage =
          "La API Key de Gemini es inválida. Actualízala en los secretos de Firebase Functions.";
      }
      res.status(500).json({ error: errorMessage });
    }
  }
);

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// 404 explícito para cualquier otra ruta bajo /api/**.
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

export const api = onRequest({ secrets: [GEMINI_API_KEY] }, app);
