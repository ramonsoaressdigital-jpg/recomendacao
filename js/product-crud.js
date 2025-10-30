window.ProductStore = (() => {

  const LS_KEY = "mvp_products_v2";

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
      { key: "p2o5_total", label: "P₂O₅ total (%)" },
      { key: "p2o5_sol", label: "P₂O₅ solúvel (%)" },
      { key: "cao", label: "CaO (%)" }
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

  function uuid() {
    return 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  function load() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY)) || [];
    } catch {
      return [];
    }
  }

  function save(list) {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  }

  function renderForm(container) {
    container.innerHTML = `
      <div class="controls" style="grid-template-columns:1fr 1fr 1fr 1fr; gap:12px">
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
        <div>
          <label>&nbsp;</label>
          <button id="btnSalvarProduto" class="btn">💾 Salvar</button>
        </div>
      </div>

      <div class="controls small" style="margin-top:8px; grid-template-columns:repeat(auto-fit, minmax(160px,1fr))">
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
            <option value="25">Múltiplos de 25</option>
            <option value="50">Múltiplos de 50</option>
            <option value="100">Múltiplos de 100</option>
          </select>
        </div>
      </div>

      <div id="propsWrap" class="card" style="margin-top:12px; background:#0f1830">
        <div class="small" style="color:var(--muted); margin-bottom:8px">Parâmetros técnicos</div>
        <div id="propsGrid" class="controls" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px"></div>
      </div>
    `;
  }

  function renderPropsGrid(type) {
    const propsGrid = document.getElementById("propsGrid");
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
      id: uuid(),
      nome, tipo, unidade,
      regras: { permiteZero, doseMin, doseMax, arredonda },
      props
    };
  }

  function renderTable(list, el) {
  if (!list.length) {
    el.innerHTML = `<p class="small" style="color:var(--muted)">Nenhum produto cadastrado.</p>`;
    return;
  }

  el.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Nome</th>
          <th>Categoria</th>
          <th>Unidade</th>
          <th>Regras</th>
          <th>Principais parâmetros</th>
          <th>Ações</th>
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
              <td><button class="btn-del" data-id="${p.id}" title="Remover produto">🗑️</button></td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

/**
 * Remove um produto pelo ID e atualiza a tabela + storage.
 */
function removeProduct(id, el) {
  let produtos = load();
  const novo = produtos.filter(p => p.id !== id);
  save(novo);
  renderTable(novo, el);
}


  return { load, save, renderForm, renderPropsGrid, collectProduct, renderTable, removeProduct };
})();
