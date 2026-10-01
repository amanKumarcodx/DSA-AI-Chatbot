const { applicationDefault, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const cors = require("cors");
const express = require("express");
const mongoose = require("mongoose");
const { rateLimit } = require("express-rate-limit");
const { createHash } = require("node:crypto");
const { GoogleGenAI } = require("@google/genai");
const DSA_SYSTEM_INSTRUCTION = require("./dsaSystemInstruction.cjs");
const Chat = require("./models/Chat.cjs");
const { redis } = require("./redis.cjs");
const GEMINI_GENERATION_CONFIG = {
  max_output_tokens: 2000,
  thinking_level: "low",
};

const projectId = process.env.FIREBASE_PROJECT_ID;
if (!projectId) {
  throw new Error("FIREBASE_PROJECT_ID is missing. Add it to your local .env file.");
}

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId,
  });
}

const app = express();
const configuredOrigins = (process.env.CLIENT_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      const isLocalDevelopment =
        origin && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
      callback(null, !origin || configuredOrigins.includes(origin) || isLocalDevelopment);
    },
  })
);
app.use(express.json({ limit: "24kb" }));

function getGeminiErrorDetails(error) {
  const isRateLimited =
    Number(error.status || error.code) === 429 || /\b429\b|rate limit|quota/i.test(error.message || "");
  if (isRateLimited) {
    console.warn("Gemini request was rate limited.");
    return {
      status: 429,
      message: "Gemini's request quota is exhausted. Wait for it to reset or check your Google AI Studio plan and limits.",
    };
  }

  console.error("Gemini request failed:", error.message);
  return {
    status: 502,
    message: "Gemini could not generate a reply. Check the server key, model name, and server log.",
  };
}

function sendGeminiError(response, error) {
  const details = getGeminiErrorDetails(error);
  return response.status(details.status).json({ error: details.message });
}

function beginEventStream(response) {
  response.status(200).set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  response.flushHeaders();
}

function writeStreamEvent(response, data) {
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

function watchClientDisconnect(request, response) {
  const controller = new AbortController();
  const abort = () => {
    if (!response.writableEnded && !controller.signal.aborted) controller.abort();
  };
  request.once("aborted", abort);
  response.once("close", abort);

  return {
    signal: controller.signal,
    dispose() {
      request.off("aborted", abort);
      response.off("close", abort);
    },
  };
}

async function streamGeminiText(response, stream, signal) {
  let answer = "";
  let completed = false;
  for await (const event of stream) {
    if (signal.aborted || response.destroyed) return null;
    if (event.event_type === "interaction.completed") {
      if (event.interaction?.status !== "completed") {
        throw new Error("Gemini ended the response before generation completed.");
      }
      completed = true;
      continue;
    }
    if (event.event_type !== "step.delta" || event.delta?.type !== "text") continue;
    answer += event.delta.text;
    writeStreamEvent(response, { text: event.delta.text });
  }
  if (!signal.aborted && !response.destroyed && !completed) {
    throw new Error("Gemini's response stream ended unexpectedly.");
  }
  return answer.trim();
}

function sendStreamGeminiError(response, error) {
  if (response.destroyed || response.writableEnded) return;
  const details = getGeminiErrorDetails(error);
  writeStreamEvent(response, { error: details.message });
  response.end();
}

async function requireFirebaseUser(request, response, next) {
  const authorization = request.get("authorization") || "";
  const match = authorization.match(/^Bearer (.+)$/);
  if (!match) {
    return response.status(401).json({ error: "Sign in to access chat history." });
  }

  try {
    const decodedToken = await getAuth().verifyIdToken(match[1]);
    request.firebaseUid = decodedToken.uid;
    next();
  } catch {
    response.status(401).json({ error: "Your sign-in token is invalid or expired." });
  }
}

app.get("/api/health", (_request, response) => {
  response.json({
    status: "ok",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

const guestMessageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Guest message limit reached. Sign in or try again later." },
});

app.post("/api/guest/message", guestMessageLimiter, async (request, response) => {
  const input = typeof request.body.input === "string" ? request.body.input.trim() : "";
  if (!input || input.length > 20000) {
    return response.status(400).json({ error: "Guest prompt must contain 1 to 20,000 characters." });
  }
  if (!process.env.GEMINI_API_KEY) {
    return response.status(503).json({ error: "Gemini is not configured on the server." });
  }

  try {
    const client = watchClientDisconnect(request, response);
    try {
    beginEventStream(response);
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const stream = await ai.interactions.create({
      model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
      input,
      system_instruction: DSA_SYSTEM_INSTRUCTION,
      generation_config: GEMINI_GENERATION_CONFIG,
      store: false,
      stream: true,
      }, { signal: client.signal });
      const answer = await streamGeminiText(response, stream, client.signal);
      if (client.signal.aborted || response.destroyed) return;
      if (!answer) {
        writeStreamEvent(response, { error: "Gemini returned an empty response." });
        return response.end();
      }
      writeStreamEvent(response, { answer });
      response.end();
    } catch (error) {
      if (client.signal.aborted || response.destroyed) return;
      if (response.headersSent) return sendStreamGeminiError(response, error);
      sendGeminiError(response, error);
    } finally {
      client.dispose();
    }
  } catch (error) {
    sendGeminiError(response, error);
  }
});

app.get("/api/chats", requireFirebaseUser, async (request, response, next) => {
  try {
    const chats = await Chat.find({ firebaseUid: request.firebaseUid })
      .select("title updatedAt createdAt")
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();
    response.json({ chats });
  } catch (error) {
    next(error);
  }
});

app.post("/api/chats", requireFirebaseUser, async (request, response, next) => {
  try {
    const title = typeof request.body.title === "string"
      ? request.body.title.trim().slice(0, 100)
      : "";
    const chat = await Chat.create({
      firebaseUid: request.firebaseUid,
      title: title || "New chat",
    });
    response.status(201).json({ chat });
  } catch (error) {
    next(error);
  }
});

app.get("/api/chats/:chatId", requireFirebaseUser, async (request, response, next) => {
  try {
    if (!mongoose.isValidObjectId(request.params.chatId)) {
      return response.status(400).json({ error: "Invalid chat ID." });
    }

    const cacheKey = `chat:${request.firebaseUid}:${request.params.chatId}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return response.json({ chat: JSON.parse(cached) });
    } catch {
      // Fall back to MongoDB when Redis is unavailable or the cache entry is invalid.
    }

    const chat = await Chat.findOne({
      _id: request.params.chatId,
      firebaseUid: request.firebaseUid,
    }).lean();
    if (!chat) return response.status(404).json({ error: "Chat not found." });

    try {
      await redis.setEx(cacheKey, 300, JSON.stringify(chat));
    } catch {
      // Return the MongoDB result if Redis is unavailable.
    }

    response.json({ chat });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/chats/:chatId", requireFirebaseUser, async (request, response, next) => {
  try {
    if (!mongoose.isValidObjectId(request.params.chatId)) {
      return response.status(400).json({ error: "Invalid chat ID." });
    }

    const result = await Chat.deleteOne({
      _id: request.params.chatId,
      firebaseUid: request.firebaseUid,
    });
    if (result.deletedCount === 0) {
      return response.status(404).json({ error: "Chat not found." });
    }

    try {
      await redis.del(`chat:${request.firebaseUid}:${request.params.chatId}`);
    } catch {
      // MongoDB deletion remains authoritative if Redis is unavailable.
    }

    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/chats/:chatId/messages",
  requireFirebaseUser,
  async (request, response, next) => {
    let client;
    try {
      if (!mongoose.isValidObjectId(request.params.chatId)) {
        return response.status(400).json({ error: "Invalid chat ID." });
      }
      const content = typeof request.body.content === "string"
        ? request.body.content.trim()
        : "";
      if (!content || content.length > 20000) {
        return response.status(400).json({
          error: "Message must contain 1 to 20,000 characters.",
        });
      }

      const chat = await Chat.findOne({
        _id: request.params.chatId,
        firebaseUid: request.firebaseUid,
      });
      if (!chat) return response.status(404).json({ error: "Chat not found." });

      const priorContext = chat.messages
        .slice(-16)
        .map((message) => `${message.role === "assistant" ? "Instructor" : "Student"}: ${message.content.slice(0, 6000)}`)
        .join("\n\n");
      const input = priorContext
        ? `${priorContext}\n\nStudent: ${content}`
        : content;

      const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
      const inputHash = createHash("sha256")
        .update(JSON.stringify({
          model,
          input,
          instruction: DSA_SYSTEM_INSTRUCTION,
          generationConfig: GEMINI_GENERATION_CONFIG,
        }))
        .digest("hex");
      const answerCacheKey = `gemini-answer:v2:${request.firebaseUid}:${chat.id}:${inputHash}`;
      let answer;
      try {
        answer = await redis.get(answerCacheKey);
        if (answer) console.log("Gemini answer cache hit.");
      } catch {
        // Continue to Gemini when Redis is unavailable.
      }

      if (!answer) {
        if (!process.env.GEMINI_API_KEY) {
          return response.status(503).json({
            error: "Gemini is not configured. Add a new GEMINI_API_KEY to the server .env file.",
          });
        }
      }

      client = watchClientDisconnect(request, response);
      beginEventStream(response);
      try {
        if (answer) {
          writeStreamEvent(response, { text: answer });
        } else {
          const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
          const stream = await ai.interactions.create({
            model,
            input,
            system_instruction: DSA_SYSTEM_INSTRUCTION,
            generation_config: GEMINI_GENERATION_CONFIG,
            store: false,
            stream: true,
          }, { signal: client.signal });
          answer = await streamGeminiText(response, stream, client.signal);
        }
      } catch (error) {
        if (client.signal.aborted || response.destroyed) return;
        return sendStreamGeminiError(response, error);
      }

      if (client.signal.aborted || response.destroyed) return;
      if (!answer) {
        writeStreamEvent(response, { error: "Gemini returned an empty response. Please try again." });
        return response.end();
      }

      try {
        await redis.setEx(answerCacheKey, 3600, answer);
      } catch {
        // Return the Gemini answer if Redis is unavailable.
      }

      chat.messages.push(
        { role: "user", content },
        { role: "assistant", content: answer }
      );
      if (chat.title === "New chat") chat.title = content.slice(0, 60);
      await chat.save();
      try {
        await redis.setEx(
          `chat:${request.firebaseUid}:${chat.id}`,
          300,
          JSON.stringify(chat.toObject())
        );
      } catch {
        // MongoDB remains authoritative if Redis is unavailable.
      }
      writeStreamEvent(response, { chat });
      response.end();
    } catch (error) {
      if (client?.signal.aborted || response.destroyed) return;
      if (response.headersSent) {
        console.error("Could not save streamed chat response:", error.message);
        writeStreamEvent(response, { error: "The reply was generated but could not be saved." });
        return response.end();
      }
      next(error);
    } finally {
      client?.dispose();
    }
  }
);

app.use((error, _request, response, _next) => {
  console.error("API request failed:", error.message);
  response.status(500).json({ error: "The server could not complete the request." });
});

module.exports = app;
