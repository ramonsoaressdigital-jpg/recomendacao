// js/main.js (ESM)
import { setupFormulasUI } from "./ui-formulas.js";
import { executarRecomendacao, aggregatePorProduto } from "./recommendation-engine.js";
import { DataStore } from "./data-store.js";

// === Helpers de agregação e estatísticas =====================================
function roundStep(n, step = 10, mode = "nearest") {
  const x = Number(n), s = Number(step);
  if (!Number.isFinite(x) || !Number.isFinite(s) || s <= 0) return x;
  if (mode === "up") return Math.ceil(x / s) * s;
  if (mode === "down") return Math.floor(x / s) * s;
  return Math.round(x / s) * s;
}

// 1) Soma dose por ponto+produto (evita duplicidade de linhas por fórmula)
function aggregateDoseByPointProduct(recoOut, { roundToStep = 10 } = {}) {
  // recoOut = { [ponto]: Array<{produto, dose, unidade, ...}> }
  const rows = [];
  for (const ponto of Object.keys(recoOut)) {
    const byProd = new Map();
    for (const r of recoOut[ponto]) {
      const key = r.produto;
      const prev = byProd.get(key) || { produto: r.produto, unidade: r.unidade || "kg/ha", dose: 0 };
      prev.dose += Number(r.dose) || 0;
      byProd.set(key, prev);
    }
    // opcional: arredondar a dose total por ponto/produto (ex.: de 184.99 → 180)
    for (const v of byProd.values()) {
      v.dose = roundToStep ? roundStep(v.dose, roundToStep, "nearest") : v.dose;
      rows.push({ ponto, produto: v.produto, dose_total: v.dose, unidade: v.unidade });
    }
  }
  return rows;
}

// 2) Estatísticas por produto (min / média / máx). Mantém unidade do primeiro visto.
function computeProductStats(aggRows) {
  // aggRows = [{ponto, produto, dose_total, unidade}]
  const map = new Map();
  for (const r of aggRows) {
    const key = r.produto + "||" + (r.unidade || "kg/ha");
    if (!map.has(key)) map.set(key, { produto: r.produto, unidade: r.unidade || "kg/ha", doses: [] });
    map.get(key).doses.push(Number(r.dose_total) || 0);
  }

  const out = [];
  for (const { produto, unidade, doses } of map.values()) {
    if (!doses.length) continue;
    let min = Infinity, max = -Infinity, sum = 0;
    for (const d of doses) {
      if (d < min) min = d;
      if (d > max) max = d;
      sum += d;
    }
    const avg = sum / doses.length;
    out.push({
      produto,
      unidade,
      pontos: doses.length,
      min: min,
      media: avg,
      max: max
    });
  }
  // ordenar por produto
  out.sort((a, b) => a.produto.localeCompare(b.produto, "pt-BR"));
  return out;
}

// 3) Renderiza a tabela de estatísticas abaixo do seu #resultados
function renderProductStats(aggRows, { decimals = 0 } = {}) {
  const stats = computeProductStats(aggRows);
  const wrap = document.getElementById("resultados");
  if (!wrap) return;

  // remove bloco anterior (se reexecutar)
  const old = wrap.querySelector("#product-stats");
  if (old) old.remove();

  const el = document.createElement("div");
  el.id = "product-stats";
  el.className = "tableWrap";
  if (!stats.length) {
    el.innerHTML = `<p style="color:var(--muted)">Sem estatísticas de produtos.</p>`;
    wrap.appendChild(el);
    return;
  }

  const fmt = (n) => Number(n).toFixed(decimals);

  el.innerHTML = `
    <h3 style="margin-top:16px">📊 Estatística por produto (mín / média / máx)</h3>
    <table>
      <thead>
        <tr>
          <th>Produto</th>
          <th>Unidade</th>
          <th>Pontos</th>
          <th>Mín</th>
          <th>Média</th>
          <th>Máx</th>
        </tr>
      </thead>
      <tbody>
        ${stats.map(s => `
          <tr>
            <td>${s.produto}</td>
            <td>${s.unidade}</td>
            <td>${s.pontos}</td>
            <td>${fmt(s.min)}</td>
            <td>${fmt(s.media)}</td>
            <td>${fmt(s.max)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  wrap.appendChild(el);
}


window.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 MVP iniciado");

  // ====== IMPORTAÇÃO CSV ======
  const fileInput = document.getElementById("fileInput");
  const btnImport = document.getElementById("btnImportCSV");
  const tableWrap = document.getElementById("csvTableWrap");
  const depthSelect = document.getElementById("depthSelect");

  btnImport.addEventListener("click", async () => {
    if (!fileInput.files[0]) return alert("Selecione um arquivo CSV.");
    const dataset = await CSVReader.readFile(fileInput.files[0]);
    CSVReader.renderTable(dataset.headers, dataset.rows, tableWrap);
    // window.dataset = dataset;
    DataStore.setDataset(dataset);

    // atualizar as profundidades do módulo de fórmulas (recarrega UI)
    document.getElementById("formulas-panel").innerHTML = ""; // limpa
    setupFormulasUI("formulas-panel");
  });


  // ====== PRODUTOS ======
  const productFormWrap = document.getElementById("productFormWrap"); // <- é aqui que o form será injetado
  const prodTableWrap = document.getElementById("prodTableWrap");
  const produtos = window.ProductStore.load(); // IIFE exposto em window

  // 1) Injeta o formulário dentro de #productFormWrap
  window.ProductStore.renderForm(productFormWrap);

  // 2) Agora que o formulário existe no DOM, pegamos seus elementos
  const prodTipo = document.getElementById("prodTipo");
  const btnSalvarProduto = document.getElementById("btnSalvarProduto");

  // 3) Renderiza a grade de parâmetros técnicos baseada na categoria atual
  window.ProductStore.renderPropsGrid(prodTipo.value || "fertilizante");

  // 4) Troca de categoria -> refaz a grade de parâmetros
  prodTipo.addEventListener("change", () => {
    window.ProductStore.renderPropsGrid(prodTipo.value);
  });

  // 5) Salvar produto
  btnSalvarProduto.addEventListener("click", () => {
    const p = window.ProductStore.collectProduct();
    if (!p.nome) return alert("Informe o nome do produto.");
    produtos.push(p);
    window.ProductStore.save(produtos);
    window.ProductStore.renderTable(produtos, prodTableWrap);
    console.log("✅ Produto salvo:", p);
  });

  // 6) Renderizar a tabela inicial
  window.ProductStore.renderTable(produtos, prodTableWrap);

  // ====== UI DE FÓRMULAS (módulo novo) ======
  setupFormulasUI("formulas-panel");

  document.getElementById("clear-results").addEventListener("click", () => {
    const container = document.getElementById("resultados");
    container.innerHTML = `<p style="color:var(--muted)">Nenhuma recomendação executada ainda.</p>`;
  });



  // ——— UI: injeta controles no bloco de resultados ———
  const resultWrap = document.getElementById("recommendation-section");
  if (resultWrap && !document.getElementById("grp-toggle")) {
    const controlsBar = resultWrap.querySelector(".controls");
    const extra = document.createElement("div");
    extra.style.display = "flex";
    extra.style.gap = "12px";
    extra.style.alignItems = "center";
    extra.innerHTML = `
    <label class="small">
      <input id="grp-toggle" type="checkbox" />
      Agrupar por produto
    </label>
    <label class="small" title="Ocultar linhas com dose 0 na visão detalhada">
      <input id="zeros-toggle" type="checkbox" />
      Ocultar doses 0 (detalhe)
    </label>
  `;
    controlsBar?.appendChild(extra);
  }

  const elGrp = document.getElementById("grp-toggle");
  const elZeros = document.getElementById("zeros-toggle");
  const elOut = document.getElementById("resultados");

  // ——— Renderização de tabelas ———
  function renderTable(headers, rows) {
    if (!rows?.length) {
      elOut.innerHTML = `<p style="color:var(--muted)">Sem resultados.</p>`;
      return;
    }
    const thead = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>`;
    const tbody = `<tbody>${rows.map(r => `<tr>${headers.map(h => `<td>${r[h] ?? ""}</td>`).join("")
      }</tr>`).join("")}</tbody>`;
    elOut.innerHTML = `<div class="tableWrap"><table>${thead}${tbody}</table></div>`;
  }

  function detailedToAggRows(recoOut, { roundToStep = 10 } = {}) {
    return aggregateDoseByPointProduct(recoOut, { roundToStep });
  }
  // ——— Execução + escolha de visão ———
  async function runReco() {
    const includeZeros = !(elZeros?.checked);
    // resultado detalhado por atributo (sempre calculamos uma vez)
    const resDetalhado = executarRecomendacao(DataStore.dataset, { includeZeros: true });

    if (elGrp?.checked) {
      // VISÃO AGRUPADA POR PRODUTO
      const rowsAgg = aggregatePorProduto(resDetalhado, { decimals: 0 }); // <- já devolve [{ponto, produto, dose_total, unidade}]
      renderTable(["ponto", "produto", "dose_total", "unidade"], rowsAgg);

      // Estatísticas por produto (usa diretamente as linhas agregadas)
      renderProductStats(rowsAgg, { decimals: 0 });
    } else {
      // VISÃO DETALHADA (por atributo)
      const rowsDetalhe = [];
      Object.entries(resDetalhado).forEach(([ponto, linhas]) => {
        (linhas || []).forEach(l => {
          rowsDetalhe.push({
            ponto,
            produto: l.produto,
            atributo: l.atributo,
            garantia_percent: l.garantia_percent,
            necessidade: +((+l.necessidade || 0).toFixed(2)),
            entregue: +((+l.entregue || 0).toFixed(2)),
            dose: +((+l.dose || 0).toFixed(2)),
            unidade: l.unidade,
            formula: l.formula
          });
        });
      });
      renderTable(
        ["ponto", "produto", "atributo", "garantia_percent", "necessidade", "entregue", "dose", "unidade", "formula"],
        rowsDetalhe
      );

      // Estatísticas por produto a partir do DETALHADO
      const rowsAggFromDetalhe = detailedToAggRows(resDetalhado, { roundToStep: 10 });
      renderProductStats(rowsAggFromDetalhe, { decimals: 0 });
    }
  }

  // ——— Liga botões existentes ———
  document.getElementById("run-all")?.addEventListener("click", runReco);

  document.getElementById("clear-results")?.addEventListener("click", () => {
    elOut.innerHTML = `<p style="color:var(--muted)">Nenhuma recomendação executada ainda.</p>`;
    document.getElementById("product-stats")?.remove(); // remove a tabela de stats, se existir
  });
  elGrp?.addEventListener("change", runReco);
  elZeros?.addEventListener("change", runReco);
});
