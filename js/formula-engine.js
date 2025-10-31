// window.FormulaEngine – suporta if/else com return OU expressão simples.
window.FormulaEngine = (() => {
  // Coerção segura p/ número
  function toNum(v) {
    if (v === null || v === undefined) return 0;
    const s = String(v).replace(',', '.').trim();
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  // Compila placeholders para números (nunca string vazia)
  function compilePlaceholders(src, vars, soil) {
    let expr = String(src);

    // @variaveis@
    expr = expr.replace(/@([^@]+)@/g, (_, k) => {
      const key = k.trim();
      return String(toNum(vars?.[key]));
    });

    // #colunas#
    expr = expr.replace(/#([^#]+)#/g, (_, k) => {
      const key = k.trim();
      return String(toNum(soil?.[key]));
    });

    // vírgula decimal genérica → ponto
    expr = expr.replace(/(\d),(\d)/g, '$1.$2');

    return expr;
  }

  // Avalia EXPRESSION (ex.: "(a+b)/c")
  function safeEvalExpr(expr) {
    try {
      const fn = new Function(`"use strict"; return (${expr});`);
      const res = fn();
      return Number.isFinite(res) ? res : 0;
    } catch (err) {
      console.warn('[FormulaEngine] Erro ao avaliar expressão:', expr, err);
      return 0;
    }
  }

  // Avalia BLOCK (if/else com return dentro)
  function safeEvalBlock(block) {
    try {
      // Envolve o bloco numa IIFE para permitir 'return' internamente
      const fn = new Function(`"use strict"; return (function(){ ${block} })();`);
      const res = fn();
      return Number.isFinite(res) ? res : 0;
    } catch (err) {
      console.warn('[FormulaEngine] Erro ao avaliar bloco:', block, err);
      return 0;
    }
  }

  // Decide o modo automaticamente
  function evaluateSingle(formula, vars = {}, soil = {}) {
    const compiled = compilePlaceholders(formula, vars, soil);

    // Se o usuário usou if/else/return, tratamos como BLOCO
    if (/\bif\b|\belse\b|\breturn\b/.test(compiled)) {
      return safeEvalBlock(compiled);
    }

    // Caso contrário, como expressão simples
    return safeEvalExpr(compiled);
  }

  // Avalia para todas as linhas do dataset (mantém seu comportamento)
  function evaluateAll(formula, vars, dataset) {
    if (!dataset?.headers || !dataset?.rows) return [];
    const pontoIdx = dataset.headers.findIndex(h =>
      ['ponto', 'amostra', 'id_ponto', 'id'].includes(String(h).toLowerCase())
    );

    return dataset.rows.map((row, i) => {
      const soil = Object.fromEntries(
        dataset.headers.map((h, j) => [h, toNum(row[j])])
      );
      const ponto =
        pontoIdx >= 0 ? (row[pontoIdx] || `#${i + 1}`) : `#${i + 1}`;
      return { ponto, valor: evaluateSingle(formula, vars, soil) };
    });
  }

  return { evaluateSingle, evaluateAll };
})();
