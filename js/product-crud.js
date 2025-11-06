// js/product-crud.js
window.ProductStore = (() => {
  const LS_KEY = "mvp_products_v2";

  // ==== Estado de edição ====
  let editingId = null; // null = criando; string = id em edição

  // 📦 Templates por categoria
  const PRODUCT_TEMPLATES = {
    "fertilizante": [
      { key: "n", label: "N (%)" },
      { key: "p2o5", label: "P₂O₅ (%)" },
      { key: "k2o", label: "K₂O (%)" },
      { key: "s", label: "S (%)" },
      { key: "b", label: "B (%)" },
      { key: "zn", label: "Zn (%)" }
    ],
    "fertilizante_fosfatagem": [
      { key: "n_f", label: "N (%)" },
      { key: "p2o5_f", label: "P₂O₅ (%)" },
      { key: "k2o_f", label: "K₂O (%)" },
      { key: "cao_f", label: "CaO (%)" }
    ],
    "corretivo": [
      { key: "cao", label: "CaO (%)" },
      { key: "mgo", label: "MgO (%)" },
      { key: "pn", label: "PN (%)" },
      { key: "prnt", label: "PRNT (%)" }
    ],
    "condicionador": [
      { key: "mo", label: "Matéria Orgânica (%)" },
      { key: "umidade", label: "Umidade (%)" }
    ],
    "gesso": [
      { key: "s", label: "S (%)" },
      { key: "caso4", label: "CaSO₄·2H₂O (%)" }
    ],
    "outros": []
  };

  // ==== Utilidades ====
  function uuid() {
    return 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; }
    catch { return []; }
  }
  function save(list) {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  }

  // ==== Form ====
  function renderForm(container) {
    container.innerHTML = `
      <div class="controls" style="grid-template-columns:1fr 1fr 1fr auto; gap:12px">
        <div>
          <label>Nome do produto</label>
          <input id="prodNome" class="pill" placeholder="Ex.: Superfosfato simples">
        </div>
        <div>
          <label>Categoria</label>
          <select id="prodTipo" class="pill">
            <option value="fertilizante">Fertilizante</option>
            <option value="fertilizante_fosfatagem">Fertilizante (Fosfatagem)</option>
            <option value="corretivo">Corretivo</option>
            <option value="condicionador">Condicionador</option>
            <option value="gesso">Gesso</option>
            <option value="outros">Outro</option>
          </select>
        </div>
        <div>
          <label>Unidade</label>
          <select id="prodUnidade" class="pill">
            <option value="kg/ha">kg/ha</option>
            <option value="t/ha">t/ha</option>
          </select>
        </div>
        <div class="flex items-end">
          <button id="btnSalvarProduto" class="btn">💾 Salvar</button>
        </div>
      </div>

      <div class="controls small" style="margin-top:8px; grid-template-columns:repeat(auto-fit, minmax(160px,1fr)); gap:12px">
        <label><input type="checkbox" id="permiteZero"> Permitir dose zero</label>
        <div>
          <label>Dose mínima</label>
          <input id="doseMin" type="number" class="pill" placeholder="ex.: 0">
        </div>
        <div>
          <label>Dose máxima</label>
          <input id="doseMax" type="number" class="pill" placeholder="ex.: 5000">
        </div>
        <div>
          <label>Arredondar</label>
          <select id="arredonda" class="pill">
            <option value="none">Não arredondar</option>
            <option value="5">Múltiplos de 5</option>
            <option value="10">Múltiplos de 10</option>
            <option value="20">Múltiplos de 20</option>
            <option value="25">Múltiplos de 25</option>
            <option value="50">Múltiplos de 50</option>
            <option value="100">Múltiplos de 100</option>
            <option value="250">Múltiplos de 250</option>
            <option value="500">Múltiplos de 500</option>
            <option value="1000">Múltiplos de 1000</option>
            <option value="2500">Múltiplos de 2500</option>
            <option value="5000">Múltiplos de 5000</option>
          </select>
        </div>
      </div>

      <div id="propsWrap" class="card" style="margin-top:12px; background:#0f1830">
        <div class="small" style="color:var(--muted); margin-bottom:8px">Parâmetros técnicos</div>
        <div id="propsGrid" class="controls" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px"></div>
      </div>
    `;

    // bind dinâmico do grid por tipo
    const tipoSelect = document.getElementById("prodTipo");
    renderPropsGrid(tipoSelect.value || "fertilizante");
    tipoSelect.addEventListener("change", () => {
      renderPropsGrid(tipoSelect.value);
    });

    // botão salvar → cria/atualiza
    document.getElementById("btnSalvarProduto").addEventListener("click", onSubmit);
  }

  function renderPropsGrid(type) {
    const propsGrid = document.getElementById("propsGrid");
    if (!propsGrid) return;
    propsGrid.innerHTML = "";
    const tpl = PRODUCT_TEMPLATES[type] || [];
    tpl.forEach(item => {
      const div = document.createElement("div");
      div.innerHTML = `
        <label>${item.label}</label>
        <input id="prop_${item.key}" class="pill" type="number" step="0.01" placeholder="0">
      `;
      propsGrid.appendChild(div);
    });
  }

  function collectProduct() {
    const nome = document.getElementById("prodNome").value.trim();
    const tipo = document.getElementById("prodTipo").value;
    const unidade = document.getElementById("prodUnidade").value;
    const permiteZero = document.getElementById("permiteZero").checked;
    const doseMin = parseFloat(document.getElementById("doseMin").value || "0");
    const doseMax = parseFloat(document.getElementById("doseMax").value || "0");
    const arredonda = document.getElementById("arredonda").value;

    const props = {};
    (PRODUCT_TEMPLATES[tipo] || []).forEach(item => {
      const v = parseFloat(document.getElementById(`prop_${item.key}`).value || "0");
      if (!isNaN(v)) props[item.key] = v;
    });

    return {
      id: editingId ?? uuid(),
      nome, tipo, unidade,
      regras: { permiteZero, doseMin, doseMax, arredonda },
      props
    };
  }

  function fillForm(product) {
    editingId = product.id;
    document.getElementById("prodNome").value = product.nome || "";
    document.getElementById("prodTipo").value = product.tipo || "fertilizante";
    document.getElementById("prodUnidade").value = product.unidade || "kg/ha";
    document.getElementById("permiteZero").checked = !!product.regras?.permiteZero;
    document.getElementById("doseMin").value = product.regras?.doseMin ?? "";
    document.getElementById("doseMax").value = product.regras?.doseMax ?? "";
    document.getElementById("arredonda").value = product.regras?.arredonda ?? "none";

    // re-render grid conforme o tipo e preencher props
    renderPropsGrid(product.tipo || "fertilizante");
    Object.entries(product.props || {}).forEach(([k, v]) => {
      const el = document.getElementById(`prop_${k}`);
      if (el) el.value = v;
    });

    // feedback no botão
    const btn = document.getElementById("btnSalvarProduto");
    if (btn) btn.textContent = "✅ Atualizar";
  }

  function clearForm() {
    editingId = null;
    document.getElementById("prodNome").value = "";
    document.getElementById("prodTipo").value = "fertilizante";
    document.getElementById("prodUnidade").value = "kg/ha";
    document.getElementById("permiteZero").checked = false;
    document.getElementById("doseMin").value = "";
    document.getElementById("doseMax").value = "";
    document.getElementById("arredonda").value = "none";
    renderPropsGrid("fertilizante");
    const btn = document.getElementById("btnSalvarProduto");
    if (btn) btn.textContent = "💾 Salvar";
  }

  function onSubmit() {
    const list = load();
    const p = collectProduct();
    if (!p.nome) return alert("Informe o nome do produto.");

    if (editingId) {
      // UPDATE
      const idx = list.findIndex(x => x.id === editingId);
      if (idx >= 0) list[idx] = p;
      save(list);
      renderTable(list, document.getElementById("prodTableWrap"));
      clearForm();
      console.log("✏️ Produto atualizado:", p);
    } else {
      // CREATE
      list.push(p);
      save(list);
      renderTable(list, document.getElementById("prodTableWrap"));
      clearForm();
      console.log("✅ Produto criado:", p);
    }
  }

  // ==== Tabela ====
  function renderTable(list, el) {
    if (!el) return;
    if (!list?.length) {
      el.innerHTML = `<p class="small" style="color:var(--muted)">Nenhum produto cadastrado.</p>`;
      return;
    }
    el.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Nome</th><th>Categoria</th><th>Unidade</th><th>Regras</th><th>Principais parâmetros</th><th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(p => {
            const regras = [
              p.regras?.doseMin ? `Min ${p.regras.doseMin}` : null,
              p.regras?.doseMax ? `Max ${p.regras.doseMax}` : null,
              (p.regras?.arredonda && p.regras.arredonda !== "none") ? `Arred ${p.regras.arredonda}` : null,
              p.regras?.permiteZero ? "Zero OK" : null
            ].filter(Boolean).join(" · ");

            const principais = Object.entries(p.props || {}).slice(0, 4)
              .map(([k, v]) => `${k}: ${v}`).join(", ");

            return `
              <tr data-id="${p.id}">
                <td>${p.nome}</td>
                <td>${p.tipo}</td>
                <td>${p.unidade}</td>
                <td>${regras}</td>
                <td>${principais}</td>
                <td>
                  <button class="btn btn-small js-edit">✏️ Editar</button>
                  <button class="btn btn-small js-del">🗑️ Excluir</button>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;

    // Delegação de eventos para Editar/Excluir
    el.querySelector("tbody").addEventListener("click", (ev) => {
      const btn = ev.target.closest("button");
      if (!btn) return;
      const tr = ev.target.closest("tr");
      const id = tr?.getAttribute("data-id");
      if (!id) return;

      const list = load();
      const prod = list.find(x => x.id === id);
      if (!prod) return;

      if (btn.classList.contains("js-edit")) {
        fillForm(prod);
      } else if (btn.classList.contains("js-del")) {
        if (!confirm(`Excluir o produto "${prod.nome}"?`)) return;
        const newList = list.filter(x => x.id !== id);
        save(newList);
        renderTable(newList, el);
        // se estava editando esse item, limpa form
        if (editingId === id) clearForm();
        console.log("🗑️ Produto excluído:", prod);
      }
    });
  }

  return {
    load, save,
    renderForm,
    renderPropsGrid,
    renderTable,
    // expõe utilitários úteis se precisar
    _debug: { get editingId() { return editingId; } }
  };
})();
