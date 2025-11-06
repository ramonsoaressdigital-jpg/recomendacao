// recommendation-engine.js

import { DataStore } from "./data-store.js";

// --- DEBUG SWITCH ---
// Ativa logs detalhados no console durante a execução do motor de recomendação.
const RECO_DEBUG = true;

// ===== Utils de normalização/placeholder ===================================================
/**
 * Normaliza o texto de profundidade para o formato "AA-BB" (ex.: "00-20").
 * - Aceita entradas como "0-20", "00 a 20", etc.
 * - Se não casar com o padrão de dois números, retorna o texto original aparado.
 * @param {any} s Valor textual da profundidade.
 * @returns {string}
 */
function normDepth(s) {
  if (!s) return "";
  const m = String(s).match(/(\d+)\D+(\d+)/);
  if (!m) return String(s).trim();
  const a = m[1].padStart(2, "0");
  const b = m[2].padStart(2, "0");
  return `${a}-${b}`;
}

/**
 * Constrói um mapa de fontes **primárias** por atributo, considerando as garantias dos produtos.
 * Regra: para cada produto, todos os atributos cujo valor de garantia é igual ao **máximo**
 * do próprio produto são marcados como primários (empates são permitidos).
 * Ex.: se um produto tem { N: 8, P2O5: 36, K2O: 6 }, o atributo primário será P2O5 (36).
 * @param {Array<any>} produtos Lista de produtos do catálogo.
 * @returns {Map<string, Set<string>>} Map<atributo(lowercase), Set<productIdString>>
 */
function buildPrimaryMap(produtos) {
  // retorna Map<atributo(lowercase), Set<productIdString>>
  const prim = new Map();
  for (const p of (produtos || [])) {
    const props = p?.props || {};
    // Determina o maior valor de garantia dentro deste produto
    let max = -Infinity;
    for (const v of Object.values(props)) {
      const n = parseFloat(v ?? "0");
      if (Number.isFinite(n)) max = Math.max(max, n);
    }
    if (!(max > -Infinity)) continue;

    // Atributos com valor == max (e > 0) são marcados como primários
    for (const [k, v] of Object.entries(props)) {
      const n = parseFloat(v ?? "0");
      if (n === max && n > 0) {
        const attr = String(k).toLowerCase();
        const set = prim.get(attr) ?? new Set();
        set.add(String(p.id));
        prim.set(attr, set);
      }
    }
  }
  return prim;
}

/**
 * Substitui placeholders de variáveis (@nome@) e colunas do dataset (#Coluna#) na string
 * de código/fórmula. Também normaliza vírgula decimal para ponto.
 * @param {string} code Expressão/fórmula contendo placeholders.
 * @param {Record<string, any>} vars Variáveis globais (ex.: metas) acessadas como @var@.
 * @param {Record<string, any>} soil Dicionário da linha (solo) acessado como #Coluna#.
 * @returns {string} Expressão pronta para avaliação numérica.
 */
function compilePlaceholders(code, vars, soil) {
  let out = String(code);

  // @variaveis@
  out = out.replace(/@([^@]+)@/g, (_, k) => {
    const v = vars[k.trim()];
    return Number.isFinite(+v) ? String(+v) : "0";
  });

  // #colunas#
  out = out.replace(/#([^#]+)#/g, (_, k) => {
    const val = soil[k.trim()];
    return Number.isFinite(+val) ? String(+val) : "0";
  });

  // vírgula decimal número,número -> número.número
  out = out.replace(/(\d+),(\d+)/g, "$1.$2");
  return out;
}

// ===== Execução de fórmulas (bloco if/else OU expressão simples) ===========================
/**
 * Converte um bloco de if/else (com returns) em uma expressão ternária equivalente.
 * Útil para permitir que o mecanismo de avaliação trate condições como expressão única.
 * @param {string} code Código contendo blocos if/else com "return".
 * @returns {string} Expressão ternária equivalente (ou o original se não houver blocos).
 */
function toTernaryFromIfElse(code) {
  const src = String(code);
  const blockRe = /(if|else\s+if|else)\s*(?:\(([^)]*)\))?\s*\{\s*return\s*([^;{}]+?)\s*;?\s*\}/gi;
  const parts = [...src.matchAll(blockRe)];
  if (!parts.length) return code;

  let out = "";
  for (let i = 0; i < parts.length; i++) {
    const kind = (parts[i][1] || "").toLowerCase();
    const cond = (parts[i][2] || "").trim();
    const ret = (parts[i][3] || "0").trim();

    if (kind === "if" || kind === "else if") {
      out += `(${cond}) ? (${ret}) : `;
      if (i === parts.length - 1) out += `0`;
    } else {
      out += `(${ret})`;
    }
  }
  return out;
}

/**
 * Prepara uma expressão para avaliação numérica, injetando variáveis/soil e
 * convertendo vírgula decimal. Se detectar palavras-chave if/else, converte
 * para forma ternária com `toTernaryFromIfElse`.
 * @param {string} expr Expressão/fórmula do usuário.
 * @param {Record<string, any>} vars Variáveis globais.
 * @param {Record<string, any>} soil Valores da linha.
 * @returns {string} Expressão pronta para `safeEval`.
 */
function compileExpression(expr, vars, soil) {
  let out = String(expr)
    .replace(/@([^@]+)@/g, (_, k) => vars[k.trim()] ?? 0)
    .replace(/#([^#]+)#/g, (_, k) => soil[k.trim()] ?? 0)
    .replace(/,/g, '.');

  if (/\bif\b|\belse\s+if\b|\belse\b/i.test(out)) {
    out = toTernaryFromIfElse(out);
  }
  return out;
}

/**
 * Avaliador numérico seguro: tenta compilar e executar a expressão como JavaScript
 * em um escopo isolado. Retorna 0 em caso de erro ou resultado não-numérico finito.
 * @param {string} expr Expressão numérica.
 * @returns {number}
 */
function safeEval(expr) {
  try {
    const fn = new Function(`return (${expr});`);
    const res = fn();
    return Number.isFinite(res) ? res : 0;
  } catch {
    return 0;
  }
}

/**
 * Avalia a necessidade (resultado da fórmula) preferindo um `FormulaEngine` externo,
 * caso esteja disponível na página (window.FormulaEngine.evaluateSingle). Caso contrário,
 * compila e avalia localmente via `compileExpression` + `safeEval`.
 * @param {string} expression Fórmula original do usuário.
 * @param {Record<string, any>} vars Variáveis globais.
 * @param {Record<string, any>} soil Valores da linha.
 * @returns {number} Valor numérico finito (ou 0 se falhar).
 */
function evaluateNeed(expression, vars, soil) {
  if (window.FormulaEngine?.evaluateSingle) {
    const v = window.FormulaEngine.evaluateSingle(expression, vars, soil);
    if (Number.isFinite(v)) return v;
  }
  const expr = compileExpression(expression, vars, soil);
  return safeEval(expr);
}

// ===== Dataset helpers ====================================================================
/** Localiza o índice da coluna de profundidade (heurística por substring "profundidade"). */
function findDepthIndex(headers) {
  return headers.findIndex(h => h.toLowerCase().includes("profundidade"));
}
/** Localiza o índice do identificador do ponto (usa aliases comuns). */
function findPointIndex(headers) {
  const aliases = ["ponto", "amostra", "id_ponto", "id"];
  return headers.findIndex(h => aliases.includes(h.toLowerCase()));
}
/**
 * Converte uma linha do dataset em dicionário `soil`, preservando strings e
 * tentando normalizar números (suporta vírgula decimal).
 */
function rowToSoilDict(headers, row) {
  const o = {};
  headers.forEach((h, i) => {
    const v = typeof row[i] === "string" ? row[i].trim() : row[i];
    const num = parseFloat(String(v).replace(",", "."));
    o[h] = Number.isFinite(num) ? num : v;
  });
  return o;
}

// ===== Normalização de fórmulas ============================================================
/**
 * Uniformiza a estrutura de uma fórmula cadastrada, preservando campos originais
 * em `_raw`, definindo `expression`, `targetPropKey`, `productIds`, `depths` e
 * valores padrão de `priority`/`enabled`.
 */
function normalizeFormula(f) {
  const expression = f.expression ?? f.formula ?? "";
  const targetPropKey = (f.targetPropKey ?? f.atributo ?? "").toString().trim().toLowerCase();

  const productIds = Array.isArray(f.productIds)
    ? f.productIds
    : (f.productId ? [f.productId] : []);

  let depths = Array.isArray(f.depths) ? f.depths : undefined;
  if (!depths && typeof f.profundidades === "string") {
    depths = f.profundidades.split(",").map(s => s.trim()).filter(Boolean);
  }

  return {
    id: f.id,
    name: f.name ?? f.nome ?? f.atributo ?? "(sem nome)",
    expression,
    productIds,
    productName: f.productName ?? f.produtoNome,
    targetPropKey,
    depths,
    priority: f.priority ?? 100,
    enabled: f.enabled !== false,
    _raw: f
  };
}

// ===== Regras de arredondamento/dose =======================================================
/**
 * Arredonda um número `x` para o múltiplo de `step` conforme o modo:
 * - "nearest": arredonda para o múltiplo mais próximo
 * - "up": sempre para cima (ceil)
 * - "down": sempre para baixo (floor)
 * Caso `step` inválido ou não finito, retorna o valor original.
 */
function roundStep(x, step, mode = "nearest") {
  const n = Number(x), s = Number(step);
  if (!Number.isFinite(n) || !Number.isFinite(s) || s <= 0) return n;
  if (mode === "up")   return Math.ceil(n / s)  * s;
  if (mode === "down") return Math.floor(n / s) * s;
  return Math.round(n / s) * s; // nearest
}

/**
 * Aplica as políticas de dose, respeitando sua ordem definida:
 * 1) Pré-checagens SEM arredondar (limites e permiteZero)
 * 2) Arredondamento apenas se o valor está dentro de [min, max]
 * 3) Clamp final em [min, max]
 *
 * Regras específicas (conforme requisitos atuais):
 * - Se `permiteZero`:
 *    - raw <= 0  → retorna 0
 *    - 0 < raw < min → retorna min
 *    - raw > max → retorna max
 *    - min ≤ raw ≤ max → arredonda e clampa
 * - Se **não** `permiteZero`:
 *    - raw <= 0 → retorna min (ou 0 se min=0)
 *    - raw < min → retorna min
 *    - raw > max → retorna max
 *    - min ≤ raw ≤ max → arredonda e clampa
 */
function applyDoseRules(doseRaw, regras) {
  const raw = Number(doseRaw) || 0;
  const step = Number(regras?.arredonda) || 0;
  const mode = regras?.arredondaModo || "nearest";
  const min  = Number(regras?.doseMin) || 0;
  const max  = Number.isFinite(Number(regras?.doseMax)) ? Number(regras.doseMax) : Infinity;
  const permiteZero = regras?.permiteZero === true;

  // --- pré-checagens sem arredondar ---
  if (permiteZero) {
    if (raw <= 0) return 0;             // mantém 0/negativo
    if (raw < min) return min;          // joga direto pro mínimo
    if (raw > max) return max;          // corta no máximo
  } else {
    if (raw <= 0) return (min > 0 ? min : 0);
    if (raw < min) return min;
    if (raw > max) return max;
  }

  // --- dentro do intervalo [min, max]: arredonda e respeita limites ---
  let d = step > 0 ? roundStep(raw, step, mode) : raw;
  if (d < min) d = min;
  if (Number.isFinite(max) && d > max) d = max;
  return d;
}



// ====== PRECEDÊNCIA DE ATRIBUTOS  =========================================
// Tabela de prioridades para ordenar o processamento entre distintos atributos.
// Menor número = maior prioridade.
const PRIORITIES = {
  cao:1, mgo:2,
  p2o5:3, p2o5_fosfatagem:3,
  n:5,    n_fosfatagem:5,
  k2o:6,  k2o_fosfatagem:6,
  s:7,
  b:8, cu:9, mn:10, fe:11, zn:12,
  prnt:99
};

/** Compara nomes de atributos segundo a tabela de prioridade acima. */
function attributeOrder(a, b) {
  const pa = PRIORITIES[String(a).toLowerCase()] ?? 999;
  const pb = PRIORITIES[String(b).toLowerCase()] ?? 999;
  return pa - pb;
}

// ====== MOTOR PRINCIPAL ====================================================================
/**
 * Executa o pipeline de recomendação sobre o `dataset` (headers + rows).
 * Passos principais:
 * 1) Carrega e normaliza as fórmulas habilitadas; agrupa por atributo e ordena por prioridade.
 * 2) Carrega produtos e constrói mapa de fontes primárias por atributo.
 * 3) Para cada linha (ponto/profundidade), avalia fórmulas
 *    → calcula necessidade bruta do **atributo** (elemento)
 *    → desconta o que já foi entregue por produtos anteriores
 *    → escolhe produtos alvo (explícitos ou por presença de garantia)
 *    → prioriza produtos que são fonte primária do atributo
 *    → calcula doseRaw (nutriente→produto ou direto, conforme seu branch)
 *    → aplica regras (mín/máx/arredondamento/zero)
 *    → credita todos os atributos presentes no produto
 *    → atualiza o restante do atributo alvo e registra a linha de saída.
 * @param {{headers:string[], rows:any[][]}} dataset Conjunto tabular (laudo).
 * @param {{includeZeros?: boolean}} opts Se true, registra linhas informativas com dose 0 quando não há restante.
 * @returns {Record<string, Array<any>>} Mapa ponto -> linhas de recomendação.
 */
export function executarRecomendacao(dataset, opts = { includeZeros: true }) {
  if (!dataset?.headers?.length || !dataset?.rows?.length) {
    throw new Error("Dataset inválido/ausente");
  }

  // 1) Normaliza + filtra + ordena por prioridade
  const formulasAll = (DataStore.formulas ?? [])
    .map(normalizeFormula)
    .filter(f => f.enabled && f.expression);

  // 2) Agrupa por atributo e ordena cada grupo por prioridade
  const byAttr = new Map();
  for (const f of formulasAll) {
    const key = (f.targetPropKey || "").toLowerCase();
    if (!key) continue;
    if (!byAttr.has(key)) byAttr.set(key, []);
    byAttr.get(key).push(f);
  }
  for (const arr of byAttr.values()) {
    arr.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  }

  // 3) Lista de atributos em ordem de precedência
  const atributosOrdenados = Array.from(byAttr.keys()).sort(attributeOrder);

  // 4) Prepara produtos e aux
  const produtos = window.ProductStore?.load?.() ?? [];
  const primMap = buildPrimaryMap(produtos);   // mapeia fontes primárias por atributo

  const produtosById = Object.fromEntries(produtos.map(p => [String(p.id), p]));
  const vars = DataStore.variaveis ?? {};

  const depthIdx = findDepthIndex(dataset.headers);
  const pointIdx = findPointIndex(dataset.headers);

  // Saída + acumuladores
  const out = {};
  // deliveredAll[ponto][atributo] = total ENTREGUE (em elemento) por qualquer produto
  const deliveredAll = {};

  dataset.rows.forEach((row, i) => {
    const soil = rowToSoilDict(dataset.headers, row);
    const ponto = pointIdx >= 0 ? (row[pointIdx] || `#${i + 1}`) : `#${i + 1}`;
    const depthValueRaw = depthIdx >= 0 ? String(row[depthIdx] || "").trim() : "";
    const depthValue = normDepth(depthValueRaw);

    out[ponto] = out[ponto] || [];
    deliveredAll[ponto] = deliveredAll[ponto] || {};

    // Para cada atributo (em ordem), executa suas fórmulas
    for (const attrKey of atributosOrdenados) {
      const formulas = byAttr.get(attrKey) || [];
      if (!formulas.length) continue;

      for (const f of formulas) {
        // filtro por profundidade
        if (f.depths?.length) {
          const targets = f.depths.map(normDepth);
          if (depthValue && !targets.includes(depthValue)) continue;
        }

        // 1) necessidade bruta do ELEMENTO (ex.: K2O)
        const necessidadeBruta = evaluateNeed(f.expression, vars, soil);
        if (!Number.isFinite(necessidadeBruta)) continue;

        // 2) restante = necessidade - tudo que JÁ foi entregue desse atributo por outros produtos
        const jaEntregue = deliveredAll[ponto][attrKey] ?? 0;
        let restante = Math.max(0, necessidadeBruta - jaEntregue);

        // Determina os produtos-alvo: explicitamente escolhidos OU todos que tenham esse atributo
        const idsBrutos = (f.productIds && f.productIds.length)
          ? f.productIds
          : produtos
            .filter(p => p?.props && Number.isFinite(parseFloat(p.props[attrKey])))
            .map(p => p.id);

        // ✅ Filtro de FONTE PRIMÁRIA (empate permitido) — usa o primMap
        const primSet = primMap.get(String(attrKey).toLowerCase()) ?? new Set();
        let ids = idsBrutos.filter(pid => primSet.has(String(pid)));

        // (opcional) fallback se não houver primário mapeado para esse atributo
        if (!ids.length) ids = idsBrutos;
        // Se quer listar zeros e não há mais necessidade: registra zeros informativos (opcional)
        if (opts?.includeZeros && !(restante > 0) && ids.length) {
          for (const pid of ids) {
            const prod0 = produtosById[String(pid)];
            if (!prod0) continue;
            const g0 = parseFloat(prod0.props?.[attrKey] ?? "0");
            if (!(g0 > 0)) continue;
            out[ponto].push({
              produto: prod0.nome,
              atributo: attrKey,
              garantia_percent: g0,
              necessidade: necessidadeBruta,
              entregue: 0,
              dose: 0,
              unidade: prod0.unidade || "kg/ha",
              formula: f.name,
              _status: "suprido"
            });
          }
          continue;
        }

        if (!(restante > 0) || !ids.length) continue;

        // 3) DISTRIBUIÇÃO: produto a produto, **creditando TODOS os atributos do produto**
        for (const pid of ids) {
          if (!(restante > 0)) break;

          const prod = produtosById[String(pid)];
          if (!prod) continue;

          const garantiaTarget = parseFloat(prod.props?.[attrKey] ?? "0");
          if (!(garantiaTarget > 0)) continue;

          const regras = prod.regras ?? {};

          // Você assume que a fórmula produz “necessidade de nutriente” 
          // (ex.: kg/ha de K₂O) e converte para dose de produto dividindo pelo teor (%)
          let doseRaw;

          console.log(prod.tipo);
          
          // Dose p/ cobrir o restante do atributo alvo:
          if (prod.tipo == "gesso" || prod.tipo == "corretivo"  ) {
            // Para corretivos/gesso, trata a expressão como dose de PRODUTO (kg/ha)
            doseRaw = necessidadeBruta
            
          } else {
            // Para fertilizantes, converte necessidade de nutriente → dose de produto via garantia
            doseRaw = restante / (garantiaTarget / 100);

          }
          // Aplica regras comuns (arredondamento, min, max, zero)
          let dose = applyDoseRules(doseRaw, regras);

          // Se dose foi zerada e não queremos zeros, pula
          if (!opts?.includeZeros && dose === 0) continue;

          // ENTREGUE em cada atributo (CREDITA TUDO do produto)
          const entregasPorAtributo = {};
          const props = prod.props || {};
          for (const k of Object.keys(props)) {
            const g = parseFloat(props[k]);
            if (!(g > 0)) continue;
            entregasPorAtributo[k.toLowerCase()] = dose * (g / 100);
          }

          // Atualiza acumulador global (todos atributos)
          for (const k of Object.keys(entregasPorAtributo)) {
            deliveredAll[ponto][k] = (deliveredAll[ponto][k] ?? 0) + entregasPorAtributo[k];
          }

          // Atualiza restante do atributo-alvo
          const entregueTarget = entregasPorAtributo[attrKey] ?? 0;
          restante = Math.max(0, restante - entregueTarget);

          // Registra linha (focada no atributo-alvo para exibição)
          out[ponto].push({
            produto: prod.nome,
            atributo: attrKey,
            garantia_percent: garantiaTarget,
            necessidade: necessidadeBruta,
            entregue: entregueTarget,   // em ELEMENTO alvo
            dose,                       // em PRODUTO (após regras)
            unidade: prod.unidade || "kg/ha",
            formula: f.name
          });

          if (RECO_DEBUG) {
            console.debug(
              `[OK] ponto=${ponto} attr=${attrKey} prod=${prod.nome} ` +
              `nec=${necessidadeBruta.toFixed(2)} gar%=${garantiaTarget} ` +
              `doseRaw=${doseRaw.toFixed(2)} dose=${dose.toFixed(2)} ` +
              `entTarget=${entregueTarget.toFixed(2)} restante=${restante.toFixed(2)}`
            );
          }
        }
      }
    }
  });

  return out;
}

/**
 * Agrega o resultado por produto dentro de cada ponto, somando as doses finais.
 * Retorna linhas com (ponto, produto, dose_total, unidade) ordenadas por ponto e nome.
 * @param {Record<string, Array<any>>} resByPoint Saída do `executarRecomendacao`.
 * @param {{decimals?:number}} param1 Arredondamento para exibição (padrão 0 casas).
 * @returns {Array<{ponto:string, produto:string, dose_total:number, unidade:string}>}
 */
export function aggregatePorProduto(resByPoint, { decimals = 0 } = {}) {
  const totals = {};
  for (const [ponto, linhas] of Object.entries(resByPoint || {})) {
    for (const l of linhas || []) {
      const key = `${ponto}__${l.produto}`;
      if (!totals[key]) {
        totals[key] = { ponto, produto: l.produto, dose_total: 0, unidade: l.unidade || "kg/ha" };
      }
      totals[key].dose_total += Number(l.dose) || 0;
    }
  }
  // ordena por ponto (numérico se possível) e mantém a ordem de exibição amigável
  const rows = Object.values(totals).map(r => ({
    ponto: String(r.ponto),
    produto: r.produto,
    dose_total: +((+r.dose_total).toFixed(decimals)),
    unidade: r.unidade
  }));
  rows.sort((a, b) => (parseFloat(a.ponto) || 0) - (parseFloat(b.ponto) || 0) || a.produto.localeCompare(b.produto));
  return rows;
}
