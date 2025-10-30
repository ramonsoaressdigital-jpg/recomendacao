window.CSVReader = (() => {

  // --- Normaliza cabeçalhos ---
  function normalizeHeader(h) {
    return String(h || "")
      .normalize("NFD").replace(/\p{Diacritic}+/gu, "")
      .replace(/\u00B9/g, "1").replace(/\u00B2/g, "2").replace(/\u00B3/g, "3")
      .replace(/[\u2013\u2014\u2212]/g, "-")
      .replace(/[^a-zA-Z0-9_\- ]/g, "")
      .trim().replace(/\s+/g, "_").toLowerCase();
  }

  // --- Detecta delimitador provável ---
  function detectDelimiter(text) {
    const sample = text.split(/\r?\n/).slice(0, 10).join("\n");
    const candidates = [",", ";", "\t", "|"];
    const counts = candidates.map(d => [d, (sample.match(new RegExp(escapeReg(d), "g")) || []).length]);
    counts.sort((a, b) => b[1] - a[1]);
    return counts[0][0] || ";";
  }

  function escapeReg(ch) {
    return ch.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  }

  // --- Parse de CSV com correção de decimais ---
  function parseCSV(text) {
    const delimiter = detectDelimiter(text);
    const lines = text.split(/\r?\n/).filter(l => l.trim());

    // separa primeira linha (cabeçalhos)
    const headersRaw = lines.shift().split(delimiter);
    const headers = headersRaw.map(normalizeHeader);

    const rows = lines.map(line => {
      const cols = line.split(delimiter).map(c => c.trim());
      // converte "5,6" -> "5.6" (mas sem alterar campos de texto)
      return cols.map(c => {
        if (/^-?\d+,\d+$/.test(c)) return c.replace(",", ".");
        return c;
      });
    });

    return { headers, rows, delimiter };
  }

  async function readFile(file) {
    const text = await file.text();
    return parseCSV(text);
  }

  // --- Renderiza tabela simples ---
  function renderTable(headers, rows, el) {
    const th = headers.map(h => `<th>${h}</th>`).join("");
    const body = rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("");
    el.innerHTML = `<table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
  }

  return { readFile, renderTable };
})();
