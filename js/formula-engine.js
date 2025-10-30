window.FormulaEngine = (() => {

  function compile(formula, vars, soil) {
    let expr = String(formula)
      .replace(/@([^@]+)@/g, (_, k) => vars[k.trim()] ?? 0)
      .replace(/#([^#]+)#/g, (_, k) => soil[k.trim()] ?? 0)
      .replace(/,/g, '.');

    // Suporte a if ... return ... else ... → converte em ternário
    const ifRe = /if\s*\(([^)]+)\)\s*\{\s*return\s*([^;{}]+)\s*\}\s*else\s*\{\s*return\s*([^;{}]+)\s*\}/i;
    const m = expr.match(ifRe);
    if (m) expr = `(${m[1]}) ? (${m[2]}) : (${m[3]})`;

    // Suporte a if simples → ternário com 0
    const ifSimple = /if\s*\(([^)]+)\)\s*\{\s*return\s*([^;{}]+)\s*\}/i;
    const n = expr.match(ifSimple);
    if (n) expr = `(${n[1]}) ? (${n[2]}) : 0`;

    return expr;
  }

  function safeEval(expr) {
    try {
      const fn = new Function(`return (${expr});`);
      const res = fn();
      if (isNaN(res)) throw new Error('Resultado não numérico');
      return res;
    } catch (err) {
      console.warn('Erro ao avaliar', expr, err);
      return null;
    }
  }

  function evaluateSingle(formula, vars, soil) {
    const expr = compile(formula, vars, soil);
    return safeEval(expr);
  }

  function evaluateAll(formula, vars, dataset) {
    if (!dataset?.headers || !dataset?.rows) return [];

    // Detecta coluna "ponto" (case-insensitive)
    const pontoColIndex = dataset.headers.findIndex(h =>
      ["ponto", "amostra", "id_ponto", "id"].includes(h.toLowerCase())
    );

    return dataset.rows.map((row, i) => {
      // monta dicionário { nome_coluna: valor }
      const soil = Object.fromEntries(
        dataset.headers.map((h, j) => [h, parseFloat(row[j]) || 0])
      );

      // tenta obter nome real do ponto
      const pontoLabel =
        pontoColIndex >= 0 ? (row[pontoColIndex] || `#${i + 1}`) : `#${i + 1}`;

      return { ponto: pontoLabel, valor: evaluateSingle(formula, vars, soil) };
    });
  }

  return { evaluateSingle, evaluateAll };
})();
