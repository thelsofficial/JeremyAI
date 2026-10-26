// JeremyAI — beta server.
// Serves the web app from ./docs and proxies chat requests to the Claude API,
// streaming replies back to the browser as Server-Sent Events.

import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  VERSION, DEFAULT_MODEL, DEFAULT_EFFORT, MAX_MESSAGE_CHARS,
  buildRequest, trimHistory, demoReply,
} from "./docs/config.js";

const here = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.JEREMYAI_MODEL || DEFAULT_MODEL;
const EFFORT = process.env.JEREMYAI_EFFORT || DEFAULT_EFFORT;

// Demo mode streams canned replies so the UI can be tried without credentials.
// Unset = auto: on when no API key / auth token is in the environment.
const DEMO_MODE =
  process.env.DEMO_MODE != null
    ? process.env.DEMO_MODE === "true"
    : !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN;

// Beta guardrails.
const RATE_LIMIT_PER_MINUTE = Number(process.env.RATE_LIMIT_PER_MINUTE) || 20;

const client = DEMO_MODE ? null : new Anthropic();
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(here, "docs")));

// --- Simple in-memory rate limiter (fine for a single-instance beta) ---
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT_PER_MINUTE;
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return "No messages sent.";
  for (const m of messages) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") {
      return "Malformed message.";
    }
    if (m.content.length > MAX_MESSAGE_CHARS) {
      return `Messages are limited to ${MAX_MESSAGE_CHARS} characters during the beta.`;
    }
  }
  if (messages[messages.length - 1].role !== "user") return "Last message must be from the user.";
  return null;
}

app.get("/api/status", (_req, res) => {
  res.json({ name: "JeremyAI", version: VERSION, beta: true, demo: DEMO_MODE });
});

app.post("/api/chat", async (req, res) => {
  if (rateLimited(req.ip)) {
    return res.status(429).json({ error: "You're sending messages too quickly. Please wait a moment." });
  }
  const error = validateMessages(req.body?.messages);
  if (error) return res.status(400).json({ error });

  const messages = trimHistory(req.body.messages);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  if (DEMO_MODE) return streamDemo(messages, send, res);

  const stream = client.beta.messages.stream(buildRequest(messages, { model: MODEL, effort: EFFORT }));

  // Stop generating if the user hits "Stop" or closes the tab.
  res.on("close", () => stream.abort());

  try {
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        send("delta", { text: event.delta.text });
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") {
      send("notice", { text: "JeremyAI can't help with that request." });
    } else if (final.stop_reason === "max_tokens") {
      send("notice", { text: "Reply was cut off because it reached the length limit." });
    }
    send("done", {});
  } catch (err) {
    if (err instanceof Anthropic.APIUserAbortError) return;
    console.error("Claude API error:", err);
    send("error", { error: friendlyError(err) });
  }
  res.end();
});

function friendlyError(err) {
  if (err instanceof Anthropic.AuthenticationError) return "Server isn't configured with a valid API key.";
  if (err instanceof Anthropic.RateLimitError) return "JeremyAI is busy right now. Please try again shortly.";
  if (err instanceof Anthropic.BadRequestError) return "That request couldn't be processed.";
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach the AI service. Please try again.";
  if (err instanceof Anthropic.APIError && err.status >= 500) return "The AI service had a hiccup. Please try again.";
  return "Something went wrong. Please try again.";
}

// --- Beta feedback: thumbs up/down + optional comment, appended to feedback.jsonl ---
app.post("/api/feedback", (req, res) => {
  const { rating, comment, messageText } = req.body || {};
  if (rating !== "up" && rating !== "down" && !comment) {
    return res.status(400).json({ error: "Nothing to submit." });
  }
  const entry = {
    at: new Date().toISOString(),
    version: VERSION,
    rating: rating ?? null,
    comment: typeof comment === "string" ? comment.slice(0, 2000) : null,
    messageText: typeof messageText === "string" ? messageText.slice(0, 4000) : null,
  };
  fs.appendFile(path.join(here, "feedback.jsonl"), JSON.stringify(entry) + "\n", (err) => {
    if (err) console.error("Failed to save feedback:", err);
  });
  res.json({ ok: true });
});

// --- Demo mode ---
async function streamDemo(messages, send, res) {
  const question = messages[messages.length - 1].content;
  const reply = demoReply(question, false);
  let closed = false;
  res.on("close", () => (closed = true));
  for (const chunk of reply.match(/[\s\S]{1,6}/g)) {
    if (closed) return;
    send("delta", { text: chunk });
    await new Promise((r) => setTimeout(r, 15));
  }
  send("done", {});
  res.end();
}

app.listen(PORT, () => {
  console.log(`JeremyAI v${VERSION} running at http://localhost:${PORT}`);
  console.log(DEMO_MODE ? "Mode: DEMO (no API key found)" : `Mode: LIVE — model ${MODEL}, effort ${EFFORT}`);
});
