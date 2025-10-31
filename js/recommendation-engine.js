// recommendation-engine.js
import { DataStore } from "./data-store.js";

// --- DEBUG SWITCH ---
const RECO_DEBUG = true;

// ===== Utils de normalização/placeholder ===================================================
function normDepth(s) {
  if (!s) return "";
  const m = String(s).match(/(\d+)\D+(\d+)/);
  if (!m) return String(s).trim();
  const a = m[1].padStart(2, "0");
  const b = m[2].padStart(2, "0");
  return `${a}-${b}`;
}

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

function safeEval(expr) {
  try {
    const fn = new Function(`return (${expr});`);
    const res = fn();
    return Number.isFinite(res) ? res : 0;
  } catch {
    return 0;
  }
}

// tenta FormulaEngine primeiro, depois fallback
function evaluateNeed(expression, vars, soil) {
  if (window.FormulaEngine?.evaluateSingle) {
    const v = window.FormulaEngine.evaluateSingle(expression, vars, soil);
    if (Number.isFinite(v)) return v;
  }
  const expr = compileExpression(expression, vars, soil);
  return safeEval(expr);
}

// ===== Dataset helpers ====================================================================
function findDepthIndex(headers) {
  return headers.findIndex(h => h.toLowerCase().includes("profundidade"));
}
function findPointIndex(headers) {
  const aliases = ["ponto", "amostra", "id_ponto", "id"];
  return headers.findIndex(h => aliases.includes(h.toLowerCase()));
}
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

// ===== Políticas de arredondamento e dose ==================================================
function roundStep(x, step, mode = "nearest") {
  const n = Number(x), s = Number(step);
  if (!Number.isFinite(n) || !Number.isFinite(s) || s <= 0) return n;
  if (mode === "up") return Math.ceil(n / s) * s;
  if (mode === "down") return Math.floor(n / s) * s;
  return Math.round(n / s) * s;
}

function applyDoseRules(doseRaw, regras) {
  let d = Math.max(0, Number(doseRaw) || 0);

  if (regras?.arredonda) {
    d = roundStep(d, regras.arredonda, regras?.arredondaModo || "nearest");
  }

  const min = Number(regras?.doseMin) || 0;
  const max = Number(regras?.doseMax) || Infinity;
  const permiteZero = regras?.permiteZero === true;

  if (d === 0) {
    d = permiteZero ? 0 : (min > 0 ? min : 0);
  } else {
    if (min > 0 && d < min) d = min;
  }

  if (Number.isFinite(max)) d = Math.min(d, max);

  if (regras?.arredonda) {
    d = roundStep(d, regras.arredonda, regras?.arredondaModo || "nearest");
  }

  return d;
}

// ====== PRECEDÊNCIA DE ATRIBUTOS (espelha a trait) =========================================
// Execute primeiro quem costuma “dirigir” formulações e que tem produtos multinutrientes.
const ATTRIBUTE_PRECEDENCE = [
  "p2o5", "p2o5_fosfatagem",
  "n", "n_fosfatagem",
  "k2o", "k2o_fosfatagem",
  "s", "cao", "mgo", "prnt",
  "b", "fe", "cu", "mn", "zn"
];

function attributeOrder(a, b) {
  const ia = ATTRIBUTE_PRECEDENCE.indexOf(String(a).toLowerCase());
  const ib = ATTRIBUTE_PRECEDENCE.indexOf(String(b).toLowerCase());
  const sa = ia < 0 ? 999 : ia;
  const sb = ib < 0 ? 999 : ib;
  return sa - sb;
}

// ====== MOTOR PRINCIPAL ====================================================================
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
        const ids = (f.productIds && f.productIds.length)
          ? f.productIds
          : produtos
              .filter(p => p?.props && Number.isFinite(parseFloat(p.props[attrKey])))
              .map(p => p.id);

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

          // Dose p/ cobrir o restante do atributo alvo:
          const doseRaw = restante / (garantiaTarget / 100);
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