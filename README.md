# JeremyAI (Beta)

> ⚠️ **This is a BETA release, not a general release.** Expect bugs, rough edges and changes. Answers may be inaccurate. Conversations are stored only in your browser.

JeremyAI is a web-based AI chat assistant powered by Claude. It runs in any modern browser, **including Chromebooks**, with nothing to install.

---

## 🟢 Chromebook / browser-only setup (no terminal needed)

Everything below happens in Chrome. You don't need Linux, a terminal, or any software.

### 1. Put the code on GitHub
1. Unzip `jeremyai.zip`: double-click it in the **Files** app and copy the `jeremyai` folder out.
2. Go to **github.com** and sign in (or make a free account).
3. Click **＋ → New repository**. Name it `jeremyai`, choose **Public**, and click **Create repository**.
4. On the next page, click **"uploading an existing file"**.
5. Open the `jeremyai` folder in the Files app, select everything inside it, and drag it into the GitHub page. Make sure the `docs` folder is included.
6. Click **Commit changes**.

### 2. Turn it into a website (GitHub Pages)
1. In your repository, go to **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Set **Branch** to `main` and the folder to **`/docs`**, then click **Save**.
4. Wait about a minute and refresh. Your site's address will show at the top, like
   `https://YOUR-USERNAME.github.io/jeremyai/`

Open that link on your Chromebook (or any device). That's JeremyAI.

### 3. Turn on real AI answers
Until you add a key, JeremyAI runs in **demo mode** and gives sample replies.
1. Create an API key at **console.anthropic.com → API keys**. This needs an Anthropic account with billing set up.
2. In JeremyAI, click **⚙️ Settings (API key)** in the sidebar (on a narrow screen, tap ☰ first).
3. Paste the key and click **Save**.

🔒 The key is stored only in that browser on that device and is sent only to Anthropic. It is never put on GitHub or in the code. Each person who uses the site needs their own key, and you should only enter a key on a device you trust.

---

## Features (beta)
- Replies stream in live, with formatting and code blocks (each with a Copy button)
- Multiple conversations, saved in the browser
- Stop button, copy reply, 👍/👎 ratings, "Send beta feedback" form
- Beta banner, BETA badge, disclaimer and version number
- Light/dark theme and a phone-friendly layout
- Demo mode when no API key is set

## Two ways to run it

| | **Browser-only** (GitHub Pages, Chromebook) | **With a server** (Node.js) |
|---|---|---|
| Install anything? | No | Node.js 20.6+ |
| Who provides the API key | Each user, in ⚙️ Settings | You, once, on the server |
| Feedback goes to | Saved on the user's device (download it from Settings) | `feedback.jsonl` on the server |
| Rate limits | None of its own | 20 messages/min per visitor |

The same `docs/` web app works both ways. It checks for a server and uses browser-only mode if there isn't one.

### Server mode (optional, for computers with a terminal)
```bash
npm install
cp .env.example .env   # put ANTHROPIC_API_KEY=... in this file
npm start              # opens at http://localhost:3000
```
On a Chromebook, you can only use server mode if you turn on **Settings → Advanced → Developers → Linux development environment**. Browser-only mode doesn't need this. To host server mode online, use any Node.js host (Render, Railway, Fly.io) and set `ANTHROPIC_API_KEY` there.

## Project layout
```
docs/index.html      App page
docs/app.js          Chat logic (server mode + browser-only mode)
docs/config.js       Shared settings: model, system prompt, limits
docs/markdown.js     Small, HTML-safe formatting renderer
docs/style.css       Styles (light/dark, mobile)
docs/vendor/         Anthropic SDK bundled for the browser (rebuild: npm run build:sdk)
server.js            Optional Node.js server: /api/chat, /api/feedback, /api/status
```

## Known beta limitations
- No user accounts. Chats live in one browser and are lost if site data is cleared.
- Browser-only mode needs each user to bring their own API key.
- No file or image uploads yet.
