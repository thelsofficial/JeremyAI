// Minimal, safe Markdown renderer for chat replies.
// All text is HTML-escaped before any formatting is applied.
(function () {
  const esc = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  function inline(text) {
    const codes = [];
    let s = esc(text).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
    s = s
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
  }

  function render(src) {
    const lines = src.replace(/\r\n/g, "\n").split("\n");
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      const fence = line.match(/^```\s*([\w+-]*)/);
      if (fence) {
        const code = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
        i++; // closing fence (may be missing while streaming)
        out.push(`<pre><code data-lang="${esc(fence[1])}">${esc(code.join("\n"))}</code></pre>`);
        continue;
      }

      const heading = line.match(/^(#{1,3})\s+(.*)/);
      if (heading) {
        const n = heading[1].length;
        out.push(`<h${n}>${inline(heading[2])}</h${n}>`);
        i++;
        continue;
      }

      if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
        const ordered = /^\s*\d+[.)]\s+/.test(line);
        const re = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/;
        const items = [];
        while (i < lines.length && re.test(lines[i])) items.push(lines[i++].replace(re, ""));
        const tag = ordered ? "ol" : "ul";
        out.push(`<${tag}>${items.map((it) => `<li>${inline(it)}</li>`).join("")}</${tag}>`);
        continue;
      }

      if (/^>\s?/.test(line)) {
        const quote = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ""));
        out.push(`<blockquote>${inline(quote.join(" "))}</blockquote>`);
        continue;
      }

      if (line.trim() === "") { i++; continue; }

      const para = [];
      while (
        i < lines.length && lines[i].trim() !== "" &&
        !/^(```|#{1,3}\s|>\s?|\s*[-*+]\s+|\s*\d+[.)]\s+)/.test(lines[i])
      ) para.push(lines[i++]);
      out.push(`<p>${para.map(inline).join("<br>")}</p>`);
    }
    return out.join("");
  }

  window.renderMarkdown = render;
})();
