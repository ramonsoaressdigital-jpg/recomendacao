// ui-formulas.js
import { DataStore } from "./data-store.js";

// Lista de props possíveis dadas pelo tipo do produto
// (espelha o que você já usa no ProductStore; serve para preencher o select dinamicamente)
const PRODUCT_TEMPLATES = {
  "fertilizante": ["n", "p2o5", "k2o", "s", "b", "zn"],
  "fertilizante_fosfatagem": ["p2o5_total", "p2o5_sol", "cao"],
  "corretivo": ["cao", "mgo", "pn", "prnt"],
  "condicionador": ["mo", "umidade"],
  "gesso": ["s", "caso4"],
  "outros": []
};

function detectDepthsFrom(dataset) {
  if (!dataset?.headers?.length) return [];
  const idx = dataset.headers.findIndex(h => h.toLowerCase().includes("profundidade"));
  if (idx < 0) return [];
  const set = new Set(
    dataset.rows.map(r => String(r[idx] ?? "").trim()).filter(Boolean)
  );
  return Array.from(set);
}

export function setupFormulasUI(containerId) {
  const root = document.getElementById(containerId);
  if (!root) return;

  // 

  root.innerHTML = `
    <h2>3️⃣ Fórmulas</h2>
    <div class="card" style="margin-bottom:12px">
      <div class="controls" style="grid-template-columns:1fr 1fr 1fr 1fr; gap:12px">
        <div>
          <label>Nome</label>
          <input id="fxName" class="pill" placeholder="Ex.: Fosfatagem P2O5" />
        </div>
        <div>
          <label>Produto alvo</label>
          <select id="fxProduct" class="pill"></select>
        </div>
        <div>
          <label>Atributo do produto</label>
          <select id="fxPropKey" class="pill"><option value="">—</option></select>
        </div>
        <div>
          <label>Profundidades</label>
          <select id="fxDepths" class="pill" multiple size="3"></select>
        </div>
      </div>

      <!-- 🔹 editor (esquerda) + elementos do laudo (direita) -->
      <div class="controls" style="grid-template-columns:2fr 1fr; gap:12px; align-items:start; margin-top:8px">
        <div>
          <label>Expressão</label>
          <textarea id="fxExpr" class="pill" rows="6"
            placeholder="Ex.: if(#p_meh_00_20# < @P_alvo@){ return (@P_alvo@ - #p_meh_00_20#) * 12 } else { return 0 }"></textarea>
          <div class="small" style="color:var(--muted);margin-top:6px">
            Use <code>#coluna#</code> para valores do laudo e <code>@nome@</code> para variáveis globais.
          </div>
        </div>

        <div>
          <label>Elementos do laudo</label>
          <input id="soilSearch" class="pill" placeholder="Filtrar colunas..." style="margin-bottom:8px"/>
          <div id="soilKeys" class="controls"
               style="grid-template-columns:1fr; max-height:230px; overflow:auto; gap:6px"></div>
          <div class="small" style="color:var(--muted); margin-top:6px">
            Clique para inserir <code>#coluna#</code> na expressão.
          </div>
        </div>
      </div>

      <div class="toolbar">
        <button id="fxSave" class="btn">💾 Salvar fórmula</button>
        <button id="fxClear" class="btn">🧹 Limpar</button>
      </div>
    </div>

    <div class="tableWrap">
      <table>
        <thead>
          <tr>
            <th>Ordem</th><th>Nome</th><th>Produto</th><th>Atributo</th><th>Profundidades</th><th>Ativa</th><th>Ações</th>
          </tr>
        </thead>
        <tbody id="fxList"></tbody>
      </table>
    </div>
  `;


  const elName = root.querySelector("#fxName");
  const elProduct = root.querySelector("#fxProduct");
  const elPropKey = root.querySelector("#fxPropKey");
  const elDepths = root.querySelector("#fxDepths");
  const elExpr = root.querySelector("#fxExpr");
  const btnSave = root.querySelector("#fxSave");
  const btnClear = root.querySelector("#fxClear");
  const elList = root.querySelector("#fxList");
  const elSoilKeys = root.querySelector("#soilKeys");
  const elSoilSearch = root.querySelector("#soilSearch");


  let editingId = null; // quando ≠ null, estamos editando essa fórmula

  function startEdit(f) {
    editingId = f.id;

    // Nome
    elName.value = f.name ?? "";

    // Produto: selecionar e preparar atributos do tipo correto
    const produtos = window.ProductStore?.load?.() ?? [];
    const prod = produtos.find(p => p.id === f.productId);
    elProduct.value = f.productId || "";
    // popula atributos conforme tipo do produto selecionado
    const tipo = (elProduct.selectedOptions[0]?.dataset?.type) || prod?.tipo || "outros";
    const keys = (PRODUCT_TEMPLATES[tipo] ?? []);
    elPropKey.innerHTML = `<option value="">—</option>` + keys.map(k => `<option value="${k}">${k}</option>`).join("");
    elPropKey.value = f.targetPropKey || "";

    // Profundidades
    Array.from(elDepths.options).forEach(o => {
      o.selected = (f.depths ?? []).includes(o.value);
    });

    // Expressão
    elExpr.value = f.expression ?? "";

    // Ajusta rótulo do botão
    btnSave.textContent = "✅ Atualizar fórmula";

    // Scroll suave até o editor (opcional)
    elName.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function cancelEdit() {
    editingId = null;
    btnClear.click();
    btnSave.textContent = "💾 Salvar fórmula";
  }

  // insere texto no caret do textarea, preservando scroll/cursor
  function insertAtCursor(textarea, text) {
    textarea.focus();
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    const before = textarea.value.slice(0, start);
    const after = textarea.value.slice(end);
    textarea.value = before + text + after;
    const caret = start + text.length;
    textarea.selectionStart = textarea.selectionEnd = caret;
    textarea.scrollTop = scrollTop; // 👈 mantém a posição
    textarea.dispatchEvent(new Event("input"));
  }

  // algumas colunas não fazem sentido na expressão
  const IGNORE_HEADERS = new Set(["ponto", "amostra", "id_ponto", "id", "profundidade"]);


  // renderiza as colunas do laudo como chips clicáveis
  function renderSoilKeys(filter = "") {
    const ds = DataStore.dataset;
    const headers = ds?.headers ?? [];
    const f = filter.trim().toLowerCase();

    const items = headers
      .filter(h => !IGNORE_HEADERS.has(h.toLowerCase()))
      .filter(h => !f || h.toLowerCase().includes(f));

    if (!items.length) {
      elSoilKeys.innerHTML = `<div class="small" style="color:var(--muted)">Nenhuma coluna encontrada.</div>`;
      return;
    }

    elSoilKeys.innerHTML = items
      .map(h => `
        <button class="pill" data-key="${h}"
          style="text-align:left; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
          ${h}
        </button>
      `).join("");

    // click → insere #coluna#
    elSoilKeys.querySelectorAll("button[data-key]").forEach(btn => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.key;
        insertAtCursor(elExpr, `#${key}#`);
      });
    });
  }

  // busca incremental
  elSoilSearch?.addEventListener("input", (e) => {
    renderSoilKeys(e.target.value || "");
  });


  // Preenche produtos
  const produtos = window.ProductStore?.load?.() ?? [];
  elProduct.innerHTML = `<option value="">— Selecione —</option>` + produtos.map(p =>
    `<option value="${p.id}" data-type="${p.tipo}">${p.nome}</option>`
  ).join("");


  function refreshDepths() {
    const ds = DataStore.dataset;             // ✅ fonte única da verdade
    const depths = detectDepthsFrom(ds);
    if (!depths.length) {
      elDepths.innerHTML = `<option value="">(nenhuma detectada — importe um laudo)</option>`;
      return;
    }
    elDepths.innerHTML = depths.map(d => `<option value="${d}">${d}</option>`).join("");
  }


  renderSoilKeys("");
  refreshDepths();

  // quando o laudo for importado / alterado
  window.addEventListener("dataset:changed", () => {
    elSoilSearch.value = "";
    renderSoilKeys("");
    refreshDepths();
  });
  // Ao escolher produto, popular atributos do tipo correspondente
  elProduct.addEventListener("change", () => {
    const opt = elProduct.selectedOptions[0];
    const tipo = opt?.dataset?.type || "outros";
    const keys = PRODUCT_TEMPLATES[tipo] ?? [];
    elPropKey.innerHTML = `<option value="">—</option>` + keys.map(k => `<option value="${k}">${k}</option>`).join("");
  });

  // Salvar
  btnSave.addEventListener("click", () => {
    const name = elName.value.trim();
    const productId = elProduct.value;
    const targetPropKey = elPropKey.value;
    const expression = elExpr.value.trim();
    const depths = Array.from(elDepths.selectedOptions).map(o => o.value).filter(Boolean);

    if (!name || !productId || !targetPropKey || !expression) {
      alert("Preencha: Nome, Produto, Atributo e Expressão.");
      return;
    }

    if (editingId) {
      // atualizar
      DataStore.updateFormula(editingId, { name, productId, targetPropKey, depths, expression });
      cancelEdit();            // volta para modo criação
      renderList();            // refaz a tabela
      return;
    }

    // criar
    DataStore.addFormula({ name, productId, targetPropKey, depths, expression });
    renderList();
    btnClear.click();
  });

  btnClear.addEventListener("click", () => {
    elName.value = "";
    elProduct.value = "";
    elPropKey.innerHTML = `<option value="">—</option>`;
    elExpr.value = "";
    Array.from(elDepths.options).forEach(o => o.selected = false);
    editingId = null;
    btnSave.textContent = "💾 Salvar fórmula";
  });

  function renderList() {
    const formulas = DataStore.formulas.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
    if (!formulas.length) {
      elList.innerHTML = `<tr><td colspan="7" style="color:var(--muted)">Nenhuma fórmula cadastrada.</td></tr>`;
      return;
    }
    elList.innerHTML = formulas.map(f => {
      const prod = produtos.find(p => p.id === f.productId);
      return `
        <tr>
          <td>${f.priority ?? 100}</td>
          <td>${f.name ?? "-"}</td>
          <td>${prod?.nome ?? f.productId}</td>
          <td>${f.targetPropKey}</td>
          <td>${(f.depths ?? []).join(", ") || "—"}</td>
          <td>
            <label class="small"><input type="checkbox" data-id="${f.id}" class="fxToggle" ${f.enabled !== false ? "checked" : ""}> ativa</label>
          </td>
            <td>
              <button class="btn fxUp"   data-id="${f.id}">⬆️</button>
              <button class="btn fxDown" data-id="${f.id}">⬇️</button>
              <button class="btn fxEdit" data-id="${f.id}">✏️</button>
              <button class="btn fxDel"  data-id="${f.id}">🗑️</button>
            </td>
        </tr>
      `;
    }).join("");

    // Ações
    elList.querySelectorAll(".fxDel").forEach(btn => {
      btn.addEventListener("click", () => {
        DataStore.removeFormula(btn.dataset.id);
        renderList();
      });
    });
    elList.querySelectorAll(".fxToggle").forEach(chk => {
      chk.addEventListener("change", () => {
        DataStore.updateFormula(chk.dataset.id, { enabled: chk.checked });
      });
    });
    elList.querySelectorAll(".fxUp,.fxDown").forEach(btn => {
      btn.addEventListener("click", () => {
        const f = DataStore.formulas.find(x => x.id === btn.dataset.id);
        if (!f) return;
        const cur = f.priority ?? 100;
        const delta = btn.classList.contains("fxUp") ? -1 : 1;
        DataStore.updateFormula(f.id, { priority: Math.max(0, cur + delta) });
        renderList();
      });
    });

    elList.querySelectorAll(".fxEdit").forEach(btn => {
      btn.addEventListener("click", () => {
        const f = DataStore.formulas.find(x => x.id === btn.dataset.id);
        if (f) startEdit(f);
      });
    });
  }

  renderList();
}
