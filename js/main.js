// js/main.js (ESM)
import { setupFormulasUI } from "./ui-formulas.js";
import { executarRecomendacao } from "./recommendation-engine.js";
import { DataStore } from "./data-store.js";

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

  const runBtn = document.getElementById("run-all");
  const resultadosEl = document.getElementById("resultados");

  // function renderResultados(resultados) {
  //   resultadosEl.innerHTML = "";
  //   const pontos = Object.keys(resultados);
  //   if (!pontos.length) {
  //     resultadosEl.innerHTML = `<p style="color:var(--muted)">Sem resultados (verifique fórmulas e produtos).</p>`;
  //     return;
  //   }

  //   // Tabela única com cabeçalho único
  //   const rows = [];
  //   for (const ponto of pontos) {
  //     const linhas = resultados[ponto] || [];
  //     if (!linhas.length) continue;
  //     // linha de separador por ponto
  //     rows.push(
  //       `<tr><td colspan="7" style="background:#0f1830;color:#9fb; font-weight:600">Ponto ${ponto}</td></tr>`
  //     );
  //     for (const r of linhas) {
  //       rows.push(`<tr>
  //       <td>${r.produto}</td>
  //       <td>${(r.necessidade ?? 0).toFixed(2)}</td>
  //       <td>${(r.entregue ?? 0).toFixed(2)}</td>
  //     </tr>`);
  //     }
  //   }

  //   resultadosEl.innerHTML = `
  //   <table>
  //     <thead>
  //       <tr>
  //         <th>Produto</th>
  //         <th>Necessidade</th>
  //         <th>Entregue</th>
  //       </tr>
  //     </thead>
  //     <tbody>${rows.join("")}</tbody>
  //   </table>`;
  // }
  function renderResultados(resultados) {
    resultadosEl.innerHTML = "";
    const pontos = Object.keys(resultados);

    if (!pontos.length) {
      resultadosEl.innerHTML = `<p style="color:var(--muted)">Sem resultados (verifique fórmulas e produtos).</p>`;
      return;
    }

    const rows = [];

    for (const ponto of pontos) {
      const linhas = resultados[ponto] || [];

      // Cabeçalho por ponto
      rows.push(
        `<tr><td colspan="7" style="background:#0f1830;color:#9fb; font-weight:600">Ponto ${ponto}</td></tr>`
      );

      if (!linhas.length) {
        // ✅ Ponto sem nenhum resultado → mostra “—”
        rows.push(
          `<tr>
          <td colspan="7" style="color:#9fb; opacity:.85">—</td>
        </tr>`
        );
        continue;
      }

      // Renderiza cada linha; zeros também aparecem
      for (const r of linhas) {
        rows.push(`<tr>
        <td>${r.produto ?? "—"}</td>
        <td>${Number.isFinite(r.necessidade) ? r.necessidade.toFixed(2) : "0.00"}</td>
        <td>${Number.isFinite(r.entregue) ? r.entregue.toFixed(2) : "0.00"}</td>
      </tr>`);
      }
    }

    resultadosEl.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Produto</th>

          <th>Necessidade</th>
          <th>Entregue</th>
    
        </tr>
      </thead>
      <tbody>${rows.join("")}</tbody>
    </table>`;
  }

  runBtn.addEventListener("click", () => {
    console.log("[RUN] clicado");
    try {
      // Checks básicos pra evitar “nada acontece”
      if (!DataStore.dataset) {
        alert("Importe um laudo CSV primeiro.");
        console.warn("[RUN] dataset ausente");
        return;
      }
      const prods = window.ProductStore?.load?.() ?? [];
      if (!prods.length) {
        alert("Cadastre ao menos um produto.");
        console.warn("[RUN] sem produtos");
        return;
      }
      const formulas = DataStore.formulas ?? [];
      if (!formulas.length) {
        alert("Cadastre ao menos uma fórmula.");
        console.warn("[RUN] sem fórmulas");
        return;
      }

      console.log("[RUN] Iniciando recomendação", {
        headers: DataStore.dataset.headers,
        rows: DataStore.dataset.rows?.length,
        produtos: prods.length,
        formulas: formulas.length,
      });



      const resultados = executarRecomendacao(DataStore.dataset || window.dataset, { includeZeros: true });
      console.log("[RUN] Resultado bruto:", resultados);

      renderResultados(resultados);
    } catch (err) {
      console.error("[RUN] Falha ao executar recomendação:", err);
      alert("Falha ao executar recomendação. Veja o console para detalhes.");
    }
  });
});
