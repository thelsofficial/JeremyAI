// Shared settings for the server (server.js) and browser-only mode (app.js).

export const VERSION = "0.1.0-beta.2";
export const DEFAULT_MODEL = "claude-opus-5-5";
export const DEFAULT_EFFORT = "medium"; // low | medium | high | xhigh | max
export const MAX_MESSAGE_CHARS = 8000;
export const MAX_HISTORY_MESSAGES = 40;

export const SYSTEM_PROMPT = `You are JeremyAI, a friendly and capable AI assistant. You are currently in public beta.

- Be helpful, clear and concise. Use Markdown (headings, lists, code blocks) when it makes an answer easier to read.
- If you're unsure about something, say so rather than guessing.
- If asked what you are: you're JeremyAI (beta), built on Anthropic's Claude.`;

// Builds the Claude request; both modes send the same thing.
export function buildRequest(messages, { model = DEFAULT_MODEL, effort = DEFAULT_EFFORT } = {}) {
  return {
    model,
    max_tokens: 64000,
    system: SYSTEM_PROMPT,
    cache_control: { type: "ephemeral" },
    output_config: { effort },
    // If a safety classifier declines, retry on Anthropic's recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages,
  };
}

// Keeps the most recent turns; history must start with a user message.
export function trimHistory(messages) {
  let out = messages.slice(-MAX_HISTORY_MESSAGES).filter((m) => m.content.trim() !== "");
  while (out.length && out[0].role !== "user") out = out.slice(1);
  return out;
}

export function demoReply(question, browserOnly) {
  const howTo = browserOnly
    ? "To get real answers, click **⚙️ Settings** in the sidebar and paste your Anthropic API key."
    : "To get real answers, set `ANTHROPIC_API_KEY` on the server and restart it.";
  return `👋 Hi! I'm **JeremyAI** (beta), running in **demo mode**, so this is a sample reply. You asked:

> ${question.slice(0, 300).replace(/\n/g, " ")}

${howTo}

Everything else (conversations, formatting, feedback, themes) works the same.`;
}
