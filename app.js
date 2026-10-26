// JeremyAI beta — chat client.
// Works two ways:
//  - Server mode: talks to server.js (/api/chat), which holds the API key.
//  - Browser-only mode (e.g. GitHub Pages, Chromebooks): no server; the user pastes
//    their own API key in Settings and the browser calls Claude directly.
import { VERSION, MAX_MESSAGE_CHARS, buildRequest, trimHistory, demoReply } from "./config.js";

{
  const STORE_KEY = "jeremyai.chats.v1";
  const KEY_STORE = "jeremyai.apiKey";
  const FEEDBACK_STORE = "jeremyai.feedback";
  const $ = (id) => document.getElementById(id);
  const els = {
    messages: $("messages"), welcome: $("welcome"), input: $("input"), composer: $("composer"),
    sendBtn: $("sendBtn"), stopBtn: $("stopBtn"), chatList: $("chatList"), chatTitle: $("chatTitle"),
    sidebar: $("sidebar"), toast: $("toast"), modePill: $("modePill"), version: $("version"),
  };

  // --- Storage (browser-only during beta) ---
  const storage = {
    load() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; } },
    save(chats) { try { localStorage.setItem(STORE_KEY, JSON.stringify(chats)); } catch {} },
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, v) { try { localStorage.setItem(key, v); } catch {} },
  };

  let chats = storage.load();
  let current = null; // active chat object
  let controller = null; // AbortController for the in-flight reply
  let browserOnly = false; // set once /api/status is checked
  const ready = fetch("/api/status")
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((s) => { els.modePill.hidden = !s.demo; })
    .catch(() => { browserOnly = true; updateModePill(); });
  els.version.textContent = "v" + VERSION;

  function updateModePill() {
    els.modePill.hidden = !browserOnly || !!storage.get(KEY_STORE);
    $("settingsBtn").hidden = !browserOnly;
  }

  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // --- Theme & banner ---
  const savedTheme = storage.get("jeremyai.theme");
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  $("themeBtn").onclick = () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    storage.set("jeremyai.theme", next);
  };
  if (storage.get("jeremyai.bannerDismissed")) $("betaBanner").hidden = true;
  $("dismissBanner").onclick = () => { $("betaBanner").hidden = true; storage.set("jeremyai.bannerDismissed", "1"); };

  function toast(text) {
    els.toast.textContent = text;
    els.toast.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => (els.toast.hidden = true), 2500);
  }

  // --- Sidebar ---
  function renderChatList() {
    els.chatList.innerHTML = "";
    for (const chat of chats) {
      const row = document.createElement("div");
      row.className = "chat-item" + (current && chat.id === current.id ? " active" : "");
      const open = document.createElement("button");
      open.className = "open";
      open.textContent = chat.title;
      open.onclick = () => { openChat(chat.id); els.sidebar.classList.remove("open"); };
      const del = document.createElement("button");
      del.className = "icon-btn delete";
      del.setAttribute("aria-label", "Delete chat");
      del.textContent = "🗑";
      del.onclick = () => deleteChat(chat.id);
      row.append(open, del);
      els.chatList.append(row);
    }
  }

  function deleteChat(id) {
    if (!confirm("Delete this conversation?")) return;
    chats = chats.filter((c) => c.id !== id);
    storage.save(chats);
    if (current && current.id === id) startNewChat();
    else renderChatList();
  }

  function startNewChat() {
    stopGenerating();
    current = null;
    els.chatTitle.textContent = "New chat";
    els.messages.innerHTML = "";
    els.messages.append(els.welcome);
    renderChatList();
    els.input.focus();
  }

  function openChat(id) {
    stopGenerating();
    current = chats.find((c) => c.id === id);
    if (!current) return startNewChat();
    els.chatTitle.textContent = current.title;
    els.messages.innerHTML = "";
    for (const m of current.messages) addMessage(m.role, m.content);
    renderChatList();
    scrollToBottom();
  }

  // --- Messages ---
  function addMessage(role, content) {
    els.welcome.remove();
    const wrap = document.createElement("div");
    wrap.className = "msg " + role;
    const body = document.createElement("div");
    body.className = "body";
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    body.append(bubble);
    if (role === "assistant") {
      const avatar = document.createElement("img");
      avatar.src = "favicon.svg"; avatar.alt = ""; avatar.className = "avatar";
      wrap.append(avatar);
    }
    wrap.append(body);
    els.messages.append(wrap);
    setContent(bubble, role, content);
    if (role === "assistant" && content) addActions(body, () => bubble.dataset.raw);
    return { wrap, body, bubble };
  }

  function setContent(bubble, role, content) {
    bubble.dataset.raw = content;
    if (role === "user") { bubble.textContent = content; return; }
    bubble.innerHTML = window.renderMarkdown(content);
    for (const pre of bubble.querySelectorAll("pre")) {
      const btn = document.createElement("button");
      btn.className = "copy-code";
      btn.textContent = "Copy";
      btn.onclick = () => copy(pre.querySelector("code").textContent);
      pre.append(btn);
    }
  }

  function addActions(body, getText) {
    const bar = document.createElement("div");
    bar.className = "actions";
    const mk = (label, title, fn) => {
      const b = document.createElement("button");
      b.className = "icon-btn"; b.textContent = label; b.title = title; b.setAttribute("aria-label", title);
      b.onclick = () => fn(b);
      bar.append(b);
      return b;
    };
    mk("📋", "Copy", () => copy(getText()));
    const rate = (rating) => (b) => {
      bar.querySelectorAll(".chosen").forEach((x) => x.classList.remove("chosen"));
      b.classList.add("chosen");
      sendFeedback({ rating, messageText: getText() });
    };
    mk("👍", "Good response", rate("up"));
    mk("👎", "Bad response", rate("down"));
    body.append(bar);
  }

  function copy(text) {
    navigator.clipboard.writeText(text).then(() => toast("Copied"), () => toast("Couldn't copy"));
  }

  function scrollToBottom() { els.messages.scrollTop = els.messages.scrollHeight; }

  // --- Sending ---
  async function send(text) {
    text = text.trim();
    if (!text || controller) return;

    if (!current) {
      current = { id: newId(), title: text.slice(0, 50), messages: [], created: Date.now() };
      chats.unshift(current);
      els.chatTitle.textContent = current.title;
    }
    current.messages.push({ role: "user", content: text });
    storage.save(chats);
    renderChatList();
    addMessage("user", text);
    els.input.value = "";
    autoGrow();

    const { body, bubble } = addMessage("assistant", "");
    bubble.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
    scrollToBottom();
    setBusy(true);

    const chat = current;
    let reply = "";
    let failed = null;
    let notice = null;
    controller = new AbortController();

    const onDelta = (text) => {
      reply += text;
      if (current === chat) { setContent(bubble, "assistant", reply); scrollToBottom(); }
    };

    try {
      await ready;
      const history = trimHistory(chat.messages);
      const result = browserOnly
        ? await streamFromBrowser(history, controller.signal, onDelta)
        : await streamFromServer(history, controller.signal, onDelta);
      notice = result.notice;
      failed = result.error;
    } catch (err) {
      if (err.name !== "AbortError") failed = err.message || "Network error.";
    } finally {
      controller = null;
      setBusy(false);
    }

    if (reply) {
      chat.messages.push({ role: "assistant", content: reply });
      storage.save(chats);
    } else {
      // Nothing came back: drop the user turn so history stays valid, and offer it for retry.
      chat.messages.pop();
      storage.save(chats);
      if (current === chat && !els.input.value) els.input.value = text;
    }

    if (current !== chat) return;
    if (reply) addActions(body, () => bubble.dataset.raw);
    else bubble.innerHTML = "";
    if (failed) appendNote(bubble, "⚠️ " + failed, true);
    else if (notice) appendNote(bubble, notice);
    else if (!reply) appendNote(bubble, "Stopped.");
    scrollToBottom();
  }

  // Server mode: read the Server-Sent Events stream from server.js.
  async function streamFromServer(messages, signal, onDelta) {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
      signal,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    const result = {};
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const raw = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const event = (raw.match(/^event: (.*)$/m) || [])[1];
        const data = JSON.parse((raw.match(/^data: (.*)$/m) || [, "{}"])[1]);
        if (event === "delta") onDelta(data.text);
        else if (event === "notice") result.notice = data.text;
        else if (event === "error") result.error = data.error;
      }
    }
    return result;
  }

  // Browser-only mode: call Claude straight from the page with the user's own key.
  let sdk = null;
  async function streamFromBrowser(messages, signal, onDelta) {
    const apiKey = storage.get(KEY_STORE);
    if (!apiKey) {
      const text = demoReply(messages[messages.length - 1].content, true);
      for (const chunk of text.match(/[\s\S]{1,6}/g)) {
        if (signal.aborted) return {};
        onDelta(chunk);
        await new Promise((r) => setTimeout(r, 15));
      }
      return {};
    }
    sdk ??= (await import("./vendor/anthropic-sdk.js")).default;
    const Anthropic = sdk;
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    const stream = client.beta.messages.stream(buildRequest(messages), { signal });
    try {
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          onDelta(event.delta.text);
        }
      }
      const final = await stream.finalMessage();
      if (final.stop_reason === "refusal") return { notice: "JeremyAI can't help with that request." };
      if (final.stop_reason === "max_tokens") return { notice: "Reply was cut off because it reached the length limit." };
      return {};
    } catch (err) {
      if (err instanceof Anthropic.APIUserAbortError) return {};
      console.error("Claude API error:", err);
      if (err instanceof Anthropic.AuthenticationError) return { error: "Your API key was rejected. Check it in ⚙️ Settings." };
      if (err instanceof Anthropic.PermissionDeniedError) return { error: "This API key isn't allowed to use this model." };
      if (err instanceof Anthropic.RateLimitError) return { error: "Rate limited by the API. Please wait a moment and try again." };
      if (err instanceof Anthropic.BadRequestError) return { error: "That request couldn't be processed." };
      if (err instanceof Anthropic.APIConnectionError) return { error: "Couldn't reach the AI service. Check your internet connection." };
      if (err instanceof Anthropic.APIError && err.status >= 500) return { error: "The AI service had a hiccup. Please try again." };
      return { error: "Something went wrong. Please try again." };
    }
  }

  function appendNote(bubble, text, isError) {
    const p = document.createElement("p");
    p.className = "notice" + (isError ? " error-text" : "");
    p.textContent = text;
    bubble.append(p);
  }

  function stopGenerating() { if (controller) controller.abort(); }

  function setBusy(busy) {
    els.sendBtn.hidden = busy;
    els.stopBtn.hidden = !busy;
  }

  // --- Feedback ---
  function sendFeedback(payload) {
    if (browserOnly) {
      // No server to send to: keep it on this device (downloadable from Settings).
      let saved = [];
      try { saved = JSON.parse(storage.get(FEEDBACK_STORE)) || []; } catch {}
      saved.push({ at: new Date().toISOString(), version: VERSION, ...payload });
      storage.set(FEEDBACK_STORE, JSON.stringify(saved));
      toast("Thanks! Feedback saved on this device.");
      return;
    }
    fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => toast(r.ok ? "Thanks for the feedback!" : "Couldn't send feedback"))
      .catch(() => toast("Couldn't send feedback"));
  }

  const dialog = $("feedbackDialog");
  $("feedbackBtn").onclick = () => { $("feedbackText").value = ""; dialog.showModal(); };
  dialog.addEventListener("close", () => {
    const text = $("feedbackText").value.trim();
    if (dialog.returnValue === "submit" && text) sendFeedback({ comment: text });
  });

  // --- Settings (browser-only mode) ---
  const settings = $("settingsDialog");
  $("settingsBtn").onclick = () => {
    $("apiKeyInput").value = storage.get(KEY_STORE) || "";
    settings.showModal();
  };
  settings.addEventListener("close", () => {
    if (settings.returnValue !== "save") return;
    const key = $("apiKeyInput").value.trim();
    try { key ? localStorage.setItem(KEY_STORE, key) : localStorage.removeItem(KEY_STORE); } catch {}
    updateModePill();
    toast(key ? "API key saved on this device." : "API key removed.");
  });
  $("downloadFeedback").onclick = () => {
    const data = storage.get(FEEDBACK_STORE) || "[]";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    a.download = "jeremyai-feedback.json";
    a.click();
  };

  // --- Composer ---
  function autoGrow() {
    els.input.style.height = "auto";
    els.input.style.height = Math.min(els.input.scrollHeight, 200) + "px";
  }
  els.input.addEventListener("input", autoGrow);
  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(els.input.value); }
  });
  els.composer.addEventListener("submit", (e) => { e.preventDefault(); send(els.input.value); });
  els.stopBtn.onclick = stopGenerating;
  $("newChat").onclick = () => { startNewChat(); els.sidebar.classList.remove("open"); };
  $("menuBtn").onclick = (e) => { e.stopPropagation(); els.sidebar.classList.toggle("open"); };
  // On narrow screens, tapping outside the open sidebar closes it.
  document.querySelector(".main").addEventListener("click", () => els.sidebar.classList.remove("open"));
  for (const b of document.querySelectorAll(".suggestion")) b.onclick = () => send(b.textContent);

  els.input.maxLength = MAX_MESSAGE_CHARS;
  renderChatList();
  els.input.focus();
}
