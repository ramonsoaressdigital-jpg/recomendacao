// recommendation-engine.js
import { DataStore } from "./data-store.js";

// --- DEBUG SWITCH ---
const RECO_DEBUG = true;

// Normaliza profundidade para um formato único: "00-20" etc.
function normDepth(s) {
  if (!s) return "";
  const m = String(s).match(/(\d+)\D+(\d+)/);
  if (!m) return String(s).trim();
  const a = m[1].padStart(2, "0");
  const b = m[2].padStart(2, "0");
  return `${a}-${b}`;
}

// --- Placeholder → valores numéricos (vars e soil) + vírgula decimal -> ponto
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

  // vírgula decimal apenas em padrões número,número -> número.número
  out = out.replace(/(\d+),(\d+)/g, "$1.$2");

  return out;
}

// --- Executa SEMPRE como "corpo de função" (aceita if/else e returns)
function safeEvalIfElseBlock(compiledBody) {
  try {
    // compiledBody deve ser algo como:
    // if (...) { return 120 } else if (...) { return 80 } else { return 0 }
    const fn = new Function(`"use strict"; ${compiledBody}`);
    const res = fn();
    return Number.isFinite(res) ? res : 0;
  } catch (e) {
    // Se quiser silenciar completamente, comente a linha abaixo
    // console.warn("[RECO] Erro ao avaliar bloco if/else:", e.message, "\n---\n", compiledBody, "\n---");
    return 0;
  }
}

// --- Avalia necessidade (somente if/else; sem “expressão simples”)
function evaluateNeed_IFELSE_ONLY(expression, vars, soil) {
  const compiled = compilePlaceholders(expression, vars, soil);
  return safeEvalIfElseBlock(compiled);
}


// --- Utils de dataset ---
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


// --- Converte cadeia if/else-if/else → ternário (tolerante a ; e quebras de linha) ---
function toTernaryFromIfElse(code) {
  // Normaliza quebras exageradas de espaço (sem alterar operadores):
  const src = String(code);

  // Captura blocos: if (...) { return X } | else if (...) { return Y } | else { return Z }
  const blockRe = /(if|else\s+if|else)\s*(?:\(([^)]*)\))?\s*\{\s*return\s*([^;{}]+?)\s*;?\s*\}/gi;
  const parts = [...src.matchAll(blockRe)];
  if (!parts.length) return code;

  // Monta ternário aninhado
  let out = "";
  for (let i = 0; i < parts.length; i++) {
    const kind = (parts[i][1] || "").toLowerCase();
    const cond = (parts[i][2] || "").trim();
    const ret = (parts[i][3] || "0").trim();

    if (kind === "if" || kind === "else if") {
      out += `(${cond}) ? (${ret}) : `;
      if (i === parts.length - 1) out += `0`; // fallback se não houver else
    } else {
      // else final
      out += `(${ret})`;
    }
  }
  return out;
}

// --- Substitui @var@ e #col# e converte vírgula decimal; garante conversão de if/else ---
function compileExpression(expr, vars, soil) {
  let out = String(expr)
    .replace(/@([^@]+)@/g, (_, k) => vars[k.trim()] ?? 0)
    .replace(/#([^#]+)#/g, (_, k) => soil[k.trim()] ?? 0)
    .replace(/,/g, '.'); // vírgula → ponto

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
  } catch (e) {
    console.warn("[RECO] Erro ao avaliar expressão:", expr, e.message);
    return 0;
  }
}

// --- SEMPRE compila localmente; se o FormulaEngine existir e funcionar, a gente usa ele primeiro ---
function evaluateNeed(expression, vars, soil) {
  // 1) tenta com FormulaEngine (se estiver disponível e conseguir avaliar)
  if (window.FormulaEngine?.evaluateSingle) {
    const v = window.FormulaEngine.evaluateSingle(expression, vars, soil);
    if (Number.isFinite(v)) return v;
  }
  // 2) fallback garantido: compila + ternário + eval local
  const expr = compileExpression(expression, vars, soil);
  return safeEval(expr);
}



// --- Arredondamento da dose ---
function applyRounding(val, arredonda) {
  if (!arredonda || arredonda === "none") return val;
  const step = parseFloat(arredonda);
  if (!Number.isFinite(step) || step <= 0) return val;
  return Math.round(val / step) * step;
}

// --- Normalização de uma fórmula vinda do DataStore (compatível com formatos antigos/novos) ---
function normalizeFormula(f) {
  // Campos suportados:
  // - f.expression  | f.formula          → expressão
  // - f.productId   | f.produtoId        → id do produto
  // - f.productName | f.produtoNome      → nome do produto (fallback)
  // - f.targetPropKey | f.atributo       → chave do atributo no produto (ex: "p2o5", "s", "cao", "prnt")
  // - f.depths (array) | f.profundidades (string "00-20,20-40")
  // - f.priority, f.enabled, f.name
  const expression = f.expression ?? f.formula ?? "";
  const targetPropKey = (f.targetPropKey ?? f.atributo ?? "").toString().trim().toLowerCase();

  // normaliza profundidades
  let depths = Array.isArray(f.depths) ? f.depths : undefined;
  if (!depths && typeof f.profundidades === "string") {
    depths = f.profundidades.split(",").map(s => s.trim()).filter(Boolean);
  }

  return {
    id: f.id,
    name: f.name ?? f.nome ?? f.atributo ?? "(sem nome)",
    expression,
    productId: f.productId ?? f.produtoId,
    productName: f.productName ?? f.produtoNome,
    targetPropKey,
    depths,
    priority: f.priority ?? 100,
    enabled: f.enabled !== false,
    _raw: f
  };
}




// export function executarRecomendacao(dataset) {
//   if (!dataset?.headers?.length || !dataset?.rows?.length) {
//     throw new Error("Dataset inválido/ausente");
//   }

//   const formulas = (DataStore.formulas ?? [])
//     .map(normalizeFormula)
//     .filter(f => f.enabled && f.expression);

//   formulas.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));

//   const produtos = window.ProductStore?.load?.() ?? [];
//   const vars = DataStore.variaveis ?? {};

//   // Mapa rápido de produtos p/ conferência
//   const produtosById = Object.fromEntries(produtos.map(p => [p.id, p]));
//   const produtosByName = Object.fromEntries(produtos.map(p => [String(p.nome || "").trim().toLowerCase(), p]));

//   // DEBUG: inventário inicial
//   if (RECO_DEBUG) {
//     console.group("[RECO] Inventário inicial");
//     console.log("headers:", dataset.headers);
//     console.log("rows:", dataset.rows.length);
//     console.log("produtos:", produtos.map(p => ({ id: p.id, nome: p.nome, props: p.props, regras: p.regras })));
//     console.log("formulas (normalizadas):", formulas);
//     const depthsCSV = [...new Set(dataset.rows.map(r => r[findDepthIndex(dataset.headers)]))].map(normDepth);
//     console.log("depths no CSV (normalizadas):", depthsCSV);
//     console.groupEnd();
//   }

//   const depthIdx = findDepthIndex(dataset.headers);
//   const pointIdx = findPointIndex(dataset.headers);

//   const out = {};
//   const delivered = {};

//   dataset.rows.forEach((row, i) => {
//     const soil = rowToSoilDict(dataset.headers, row);
//     const ponto = pointIdx >= 0 ? (row[pointIdx] || `#${i + 1}`) : `#${i + 1}`;
//     const depthValueRaw = depthIdx >= 0 ? String(row[depthIdx] || "").trim() : "";
//     const depthValue = normDepth(depthValueRaw);

//     out[ponto] = out[ponto] || [];
//     delivered[ponto] = delivered[ponto] || {};

//     for (const f of formulas) {
//       // Profundidade
//       if (f.depths?.length) {
//         const targets = f.depths.map(normDepth);
//         if (depthValue && !targets.includes(depthValue)) {
//           if (RECO_DEBUG) console.debug(`[SKIP depth] ponto=${ponto} depthCSV=${depthValue} depthFormula=${targets} formula=${f.name}`);
//           continue;
//         }
//       }

//       // Produto
//       let prod = null;
//       if (f.productId && produtosById[f.productId]) {
//         prod = produtosById[f.productId];
//       } else if (f.productName && produtosByName[f.productName.trim().toLowerCase()]) {
//         prod = produtosByName[f.productName.trim().toLowerCase()];
//       }
//       if (!prod) {
//         if (RECO_DEBUG) console.debug(`[SKIP produto] ponto=${ponto} formula=${f.name} productId=${f.productId} productName=${f.productName}`);
//         continue;
//       }

//       // Atributo / garantia
//       const propKey = f.targetPropKey;
//       if (!propKey) {
//         if (RECO_DEBUG) console.debug(`[SKIP atributo] ponto=${ponto} formula=${f.name} motivo=targetPropKey vazio`);
//         continue;
//       }
//       const garantia = parseFloat(prod.props?.[propKey] ?? "0");
//       if (!Number.isFinite(garantia) || garantia <= 0) {
//         if (RECO_DEBUG) console.debug(`[SKIP garantia] ponto=${ponto} formula=${f.name} produto=${prod.nome} propKey=${propKey} garantia=${garantia}`);
//         continue;
//       }

//       // Necessidade
//       const necessidade = evaluateNeed(f.expression, vars, soil);
//       if (!(necessidade > 0)) {
//         if (RECO_DEBUG) console.debug(`[SKIP necessidade<=0] ponto=${ponto} formula=${f.name} necessidade=${necessidade}`);
//         continue;
//       }

//       // Entregas prévias do mesmo elemento
//       const ja = delivered[ponto][propKey] ?? 0;
//       const restante = Math.max(0, necessidade - ja);
//       if (!(restante > 0)) {
//         if (RECO_DEBUG) console.debug(`[SKIP suprido] ponto=${ponto} formula=${f.name} necessidade=${necessidade} entreguePrevio=${ja}`);
//         continue;
//       }

//       //dose
//       // === NOVO: arredondar o ENTREGUE (elemento), não a dose ===
//       const regras = prod.regras ?? {};

//       // 1) entregue bruto é o "restante" do elemento
//       let entregue = restante;

//       // 2) arredonda o ENTREGUE (nearest N)
//       entregue = applyRounding(entregue, regras.arredonda ?? 0, "nearest", true);

//       // (opcional) se você quiser permitir zerar quando muito pequeno:
//       if (regras.permiteZero === false && entregue <= 0) {
//         // Se não permite zero e arredondou pra 0, pula
//         continue;
//       }

//       // 3) dose passa a ser consequência (apenas informativa)
//       let dose = garantia > 0 ? (entregue / (garantia / 100)) : 0;

//       // (opcional) se ainda quiser limites na DOSE (apenas cosmético)
//       // if (regras.doseMin) dose = Math.max(dose, Number(regras.doseMin));
//       // if (regras.doseMax && dose > 0) dose = Math.min(dose, Number(regras.doseMax));

//       // atualiza o acumulado por elemento
//       delivered[ponto][propKey] = (delivered[ponto][propKey] ?? 0) + entregue;

//       out[ponto].push({
//         produto: prod.nome,
//         necessidade,
//         entregue,
//         unidade: prod.unidade || "kg/ha",
//       });

//       if (RECO_DEBUG) {
//         console.debug(`[OK] ponto=${ponto} prod=${prod.nome} attr=${propKey} nec=${necessidade} gar%=${garantia} dose=${dose} ent=${entregue} depth=${depthValue}`);
//       }
//     }
//   });

//   return out;
// }

// export function executarRecomendacao(dataset, opts = { includeZeros: true }) {
//   if (!dataset?.headers?.length || !dataset?.rows?.length) {
//     throw new Error("Dataset inválido/ausente");
//   }

//   const formulas = (DataStore.formulas ?? [])
//     .map(normalizeFormula)
//     .filter(f => f.enabled && f.expression)
//     .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));

//   const produtos = window.ProductStore?.load?.() ?? [];
//   const vars = DataStore.variaveis ?? {};

//   const produtosById = Object.fromEntries(produtos.map(p => [p.id, p]));
//   const produtosByName = Object.fromEntries(produtos.map(p => [String(p.nome || "").trim().toLowerCase(), p]));

//   const depthIdx = findDepthIndex(dataset.headers);
//   const pointIdx = findPointIndex(dataset.headers);

//   const out = {};
//   const delivered = {};

//   dataset.rows.forEach((row, i) => {
//     const soil = rowToSoilDict(dataset.headers, row);
//     const ponto = pointIdx >= 0 ? (row[pointIdx] || `#${i + 1}`) : `#${i + 1}`;
//     const depthValueRaw = depthIdx >= 0 ? String(row[depthIdx] || "").trim() : "";
//     const depthValue = normDepth(depthValueRaw);

//     out[ponto] = out[ponto] || [];
//     delivered[ponto] = delivered[ponto] || {};

//     for (const f of formulas) {
//       // filtro por profundidade
//       if (f.depths?.length) {
//         const targets = f.depths.map(normDepth);
//         if (depthValue && !targets.includes(depthValue)) continue;
//       }

//       // produto
//       let prod = null;
//       if (f.productId && produtosById[f.productId]) prod = produtosById[f.productId];
//       else if (f.productName && produtosByName[f.productName.trim().toLowerCase()]) prod = produtosByName[f.productName.trim().toLowerCase()];
//       if (!prod) continue;

//       // atributo/garantia
//       const propKey = f.targetPropKey;
//       if (!propKey) continue;
//       const garantia = parseFloat(prod.props?.[propKey] ?? "0");
//       if (!Number.isFinite(garantia) || garantia <= 0) continue;

//       // necessidade
//       const necessidade = evaluateNeed(f.expression, vars, soil);

//       // ✅ SE QUISER EXIBIR ZEROS: se necessidade === 0, ainda assim adiciona linha
//       if (opts?.includeZeros && necessidade === 0) {
//         out[ponto].push({
//           produto: prod.nome,
//           atributo: propKey,
//           garantia_percent: garantia,
//           necessidade: 0,
//           entregue: 0,
//           dose: 0,
//           unidade: prod.unidade || "kg/ha",
//           formula: f.name,
//           _status: "zero"
//         });
//         continue;
//       }

//       // se necessidade <= 0 e não queremos zeros → pula
//       if (!(necessidade > 0)) continue;

//       // saldo após entregas anteriores
//       const ja = delivered[ponto][propKey] ?? 0;
//       const restante = Math.max(0, necessidade - ja);

//       // ✅ “suprido” (restante === 0) também aparece como 0
//       if (opts?.includeZeros && !(restante > 0)) {
//         out[ponto].push({
//           produto: prod.nome,
//           atributo: propKey,
//           garantia_percent: garantia,
//           necessidade,
//           entregue: 0,
//           dose: 0,
//           unidade: prod.unidade || "kg/ha",
//           formula: f.name,
//           _status: "suprido"
//         });
//         continue;
//       }
//       if (!(restante > 0)) continue;

//       //dose
//       // === NOVO: arredondar o ENTREGUE (elemento), não a dose ===
//       const regras = prod.regras ?? {};

//       // 1) entregue bruto é o "restante" do elemento
//       let entregue = restante;

//       // 2) arredonda o ENTREGUE (nearest N)
//       entregue = applyRounding(entregue, regras.arredonda ?? 0, "nearest", true);

//       // (opcional) se você quiser permitir zerar quando muito pequeno:
//       if (regras.permiteZero === false && entregue <= 0) {
//         // Se não permite zero e arredondou pra 0, pula
//         continue;
//       }

//       // 3) dose passa a ser consequência (apenas informativa)
//       let dose = garantia > 0 ? (entregue / (garantia / 100)) : 0;

//       // (opcional) se ainda quiser limites na DOSE (apenas cosmético)
//       if (regras.doseMin) dose = Math.max(dose, Number(regras.doseMin));
//       if (regras.doseMax && dose > 0) dose = Math.min(dose, Number(regras.doseMax));

//       // atualiza o acumulado por elemento
//       delivered[ponto][propKey] = (delivered[ponto][propKey] ?? 0) + entregue;

//       // entregue
//       const entregue = dose * (garantia / 100);
//       delivered[ponto][propKey] = (delivered[ponto][propKey] ?? 0) + entregue;

//       out[ponto].push({
//         produto: prod.nome,
//         atributo: propKey,
//         garantia_percent: garantia,
//         necessidade,
//         entregue,
//         dose,
//         unidade: prod.unidade || "kg/ha",
//         formula: f.name
//       });
//     }
//   });

//   return out;
// }


export function executarRecomendacao(dataset, opts = { includeZeros: true }) {
  if (!dataset?.headers?.length || !dataset?.rows?.length) {
    throw new Error("Dataset inválido/ausente");
  }

  const formulas = (DataStore.formulas ?? [])
    .map(normalizeFormula)
    .filter(f => f.enabled && f.expression)
    .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));

  const produtos = window.ProductStore?.load?.() ?? [];
  const vars = DataStore.variaveis ?? {};

  const produtosById   = Object.fromEntries(produtos.map(p => [p.id, p]));
  const produtosByName = Object.fromEntries(produtos.map(p => [String(p.nome || "").trim().toLowerCase(), p]));

  const depthIdx = findDepthIndex(dataset.headers);
  const pointIdx = findPointIndex(dataset.headers);

  const out = {};
  const delivered = {};

  dataset.rows.forEach((row, i) => {
    const soil = rowToSoilDict(dataset.headers, row);
    const ponto = pointIdx >= 0 ? (row[pointIdx] || `#${i + 1}`) : `#${i + 1}`;
    const depthValueRaw = depthIdx >= 0 ? String(row[depthIdx] || "").trim() : "";
    const depthValue = normDepth(depthValueRaw);

    out[ponto] = out[ponto] || [];
    delivered[ponto] = delivered[ponto] || {};

    for (const f of formulas) {
      // Filtra por profundidade, se a fórmula restringe
      if (f.depths?.length) {
        const targets = f.depths.map(normDepth);
        if (depthValue && !targets.includes(depthValue)) continue;
      }

      // Resolve produto
      let prod = null;
      if (f.productId && produtosById[f.productId]) prod = produtosById[f.productId];
      else if (f.productName && produtosByName[f.productName.trim().toLowerCase()]) prod = produtosByName[f.productName.trim().toLowerCase()];
      if (!prod) continue;

      // Atributo/garantia
      const propKey = f.targetPropKey;
      if (!propKey) continue;
      const garantia = parseFloat(prod.props?.[propKey] ?? "0");
      if (!Number.isFinite(garantia) || garantia <= 0) continue;

      // Necessidade (em “elemento” – ex.: CaO, K2O, etc.)
      const necessidade = evaluateNeed(f.expression, vars, soil);

      // Exibir zeros explícitos, se pedido
      if (opts?.includeZeros && necessidade === 0) {
        out[ponto].push({
          produto: prod.nome,

          necessidade: 0,
          entregue: 0,

          _status: "zero"
        });
        continue;
      }

      // Se não queremos zeros e/ou necessidade <= 0, pula
      if (!(necessidade > 0)) continue;

      // Restante a entregar considerando entregas anteriores desse elemento nesse ponto
      const ja = delivered[ponto][propKey] ?? 0;
      const restante = Math.max(0, necessidade - ja);

      // Se já suprido, ainda assim podemos registrar linha 0 (se includeZeros=true)
      if (opts?.includeZeros && !(restante > 0)) {
        out[ponto].push({
          produto: prod.nome,
          atributo: propKey,
          garantia_percent: garantia,
          necessidade,
          entregue: 0,
          dose: 0,
          unidade: prod.unidade || "kg/ha",
          formula: f.name,
          _status: "suprido"
        });
        continue;
      }
      if (!(restante > 0)) continue;

      // === Regras de arredondamento no ENTREGUE (elemento) ===
      const regras = prod.regras ?? {};

      // 1) entregue bruto em elemento
      let entregue = restante;

      // 2) arredonda o ENTREGUE (nearest N) — step via regras.arredonda (ex.: 50)
      //    applyRounding(val, step, mode = "nearest", allowZero = true)
      entregue = applyRounding(entregue, regras.arredonda ?? 0, "nearest", true);

      // opcional: respeitar “permiteZero”
      if (regras.permiteZero === false && entregue <= 0) {
        continue;
      }

      // 3) dose é apenas informativa (derivada do entregue)
      //    dose (kg/ha do produto) = entregue (kg/ha do elemento) / (garantia%)
      const dose = garantia > 0 ? (entregue / (garantia / 100)) : 0;

      // NÃO aplique doseMin/doseMax se a dose é apenas informativa — para não distorcer “entregue”.
      // (Se quiser mostrar dose arredondada por estética, faça um arredondamento *apenas de exibição* no render.)

      // Atualiza acumulado entregue por elemento
      delivered[ponto][propKey] = (delivered[ponto][propKey] ?? 0) + entregue;

      // Registra a linha
      out[ponto].push({
        produto: prod.nome,
        necessidade,
        entregue,                 // <-- valor final arredondado em elemento
        unidade: prod.unidade || "kg/ha",
        formula: f.name
      });
    }
  });

  return out;
}
