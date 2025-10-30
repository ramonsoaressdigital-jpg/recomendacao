document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 MVP iniciado");

  // ======== PRODUTOS ========
  const produtos = ProductStore.load();
  const prodSection = document.getElementById("product-section");
  const prodTableWrap = document.getElementById("prodTableWrap");
  const formWrap = document.getElementById("productFormWrap");
  ProductStore.renderForm(formWrap);

  // Renderiza o formulário completo dentro da seção
  // ProductStore.renderForm(prodSection);

setTimeout(() => {
  const tipoSelect = document.getElementById("prodTipo");
  const btnSalvarProduto = document.getElementById("btnSalvarProduto");

  // Renderiza os parâmetros técnicos iniciais (categoria padrão)
  ProductStore.renderPropsGrid(tipoSelect.value || "fertilizante");

  // Atualiza os campos técnicos ao trocar de categoria
  tipoSelect.addEventListener("change", () => {
    ProductStore.renderPropsGrid(tipoSelect.value);
  });

  // Botão de salvar produto
  btnSalvarProduto.addEventListener("click", () => {
    const p = ProductStore.collectProduct();
    if (!p.nome) return alert("Informe o nome do produto.");
    produtos.push(p);
    ProductStore.save(produtos);
    ProductStore.renderTable(produtos, prodTableWrap); // ✅ renderiza novamente após salvar
    console.log("✅ Produto salvo:", p);
  });

  // Renderiza tabela inicial logo que a página carrega
  ProductStore.renderTable(produtos, prodTableWrap);

  // 🗑️ Remover produto (fica aqui, após a tabela inicial ser renderizada)
  prodTableWrap.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-del");
    if (!btn) return;
    const id = btn.dataset.id;
    if (!confirm("Deseja realmente remover este produto?")) return;
    ProductStore.removeProduct(id, prodTableWrap);
    console.log("❌ Produto removido:", id);
  });

}, 0);


  // ======== IMPORTAÇÃO CSV ========
  const fileInput = document.getElementById('fileInput');
  const btnImport = document.getElementById('btnImportCSV');
  const tableWrap = document.getElementById('csvTableWrap');
  const depthSelect = document.getElementById('depthSelect');
  let dataset = null;

  btnImport.addEventListener('click', async () => {
    if (!fileInput.files[0]) return alert('Selecione um arquivo CSV.');
    dataset = await CSVReader.readFile(fileInput.files[0]);
    CSVReader.renderTable(dataset.headers, dataset.rows, tableWrap);
    window.dataset = dataset;
    detectDepths(dataset);
  });

  function detectDepths(ds) {
    const depthColIndex = ds.headers.findIndex(h => h.toLowerCase().includes('profundidade'));
    depthSelect.innerHTML = '<option value="">— Todas —</option>';
    if (depthColIndex === -1) return (depthSelect.disabled = true);
    const uniqueDepths = [...new Set(ds.rows.map(r => (r[depthColIndex] || '').trim()))].filter(Boolean);
    uniqueDepths.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      depthSelect.appendChild(opt);
    });
    depthSelect.disabled = false;
  }

  // ======== FÓRMULAS TEMPORÁRIAS ========
  const DataStore = { formulas: [] };
  const form = document.getElementById("formFormulaTemp");
  const lista = document.getElementById("listaFormulasTemp");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const attr = document.getElementById("attrFormula").value.trim();
    const nome = document.getElementById("nameFormula").value.trim();
    const formula = document.getElementById("bodyFormula").value.trim();
    if (!attr || !formula) return alert("Informe atributo e fórmula.");

    DataStore.formulas.push({ atributo: attr, nome, formula });
    renderListaFormulas();
    form.reset();
  });

  function renderListaFormulas() {
    if (!DataStore.formulas.length) {
      lista.innerHTML = `<p style="color:var(--muted)">Nenhuma fórmula cadastrada.</p>`;
      return;
    }

    lista.innerHTML = `
      <table>
        <thead><tr><th>Atributo</th><th>Nome</th><th>Fórmula</th></tr></thead>
        <tbody>
          ${DataStore.formulas.map(f => `
            <tr>
              <td>${f.atributo}</td>
              <td>${f.nome || "-"}</td>
              <td><code>${f.formula}</code></td>
            </tr>`).join("")}
        </tbody>
      </table>`;
  }

  renderListaFormulas();

  // ======== EXECUTAR RECOMENDAÇÕES (placeholder) ========
  document.getElementById("run-all").addEventListener("click", () => {
    const produtos = ProductStore.load();
    if (!window.dataset) return alert("Importe um laudo primeiro!");
    if (!DataStore.formulas.length) return alert("Cadastre ao menos uma fórmula.");
    if (!produtos.length) return alert("Cadastre ao menos um produto.");
    alert(`Executaria recomendações com ${produtos.length} produtos e ${DataStore.formulas.length} fórmulas.`);
  });
});
