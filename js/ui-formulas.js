// ui-formulas.js
import { DataStore } from "./data-store.js";

// --- MIGRA UMA VEZ application.equations -> formulas, se necessário ---
(function migrateEquationsOnce() {
  try {
    const existing = JSON.parse(localStorage.getItem("formulas") || "[]");
    if (Array.isArray(existing) && existing.length) return; // já tem

    const app = JSON.parse(localStorage.getItem("application") || "null");
    const eqs = app?.equations;
    if (Array.isArray(eqs) && eqs.length) {
      localStorage.setItem("formulas", JSON.stringify(eqs));
      // avisa a UI (outras partes) que mudou
      window.dispatchEvent(new CustomEvent("formulas:updated", { detail: eqs }));
    }
  } catch (e) { /* silencia */ }
})();

// Templates de atributos por tipo (base)
const PRODUCT_TEMPLATES = {
  "fertilizante": ["n", "p2o5", "k2o", "s", "b", "zn"],
  "fertilizante_fosfatagem": ["n_f", "p2o5_f", "k2o_f"],
  "corretivo": ["cao", "mgo", "pn", "prnt"],
  "condicionador": ["mo", "umidade"],
  "gesso": ["s", "caso4"],
  "outros": []
};

function detectDepthsFrom(dataset) {
  if (!dataset?.headers?.length) return [];
  const idx = dataset.headers.findIndex(h => h.toLowerCase().includes("profundidade"));
  if (idx < 0) return [];
  const set = new Set(dataset.rows.map(r => String(r[idx] ?? "").trim()).filter(Boolean));
  return Array.from(set);
}

export function setupFormulasUI(containerId) {
  const root = document.getElementById(containerId);
  if (!root) return;

  root.innerHTML = `
    <h2>3️⃣ Fórmulas</h2>
    <div class="card" style="margin-bottom:12px">
      <div class="controls" style="grid-template-columns:1fr 1fr 1fr 1fr; gap:12px">
        <div>
          <label>Nome</label>
          <input id="fxName" class="pill" placeholder="Ex.: Fosfatagem P2O5" />
        </div>
        <div>
          <label>Produtos (1..N)</label>
          <select id="fxProducts" class="pill" multiple size="4"></select>
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
            <th>Ordem</th>
            <th>Nome</th>
            <th>Produtos</th>
            <th>Atributo</th>
            <th>Profundidades</th>
            <th>Ativa</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody id="fxList"></tbody>
      </table>
    </div>
  `;

  const elName = root.querySelector("#fxName");
  const elProducts = root.querySelector("#fxProducts");
  const elPropKey = root.querySelector("#fxPropKey");
  const elDepths = root.querySelector("#fxDepths");
  const elExpr = root.querySelector("#fxExpr");
  const btnSave = root.querySelector("#fxSave");
  const btnClear = root.querySelector("#fxClear");
  const elList = root.querySelector("#fxList");
  const elSoilKeys = root.querySelector("#soilKeys");
  const elSoilSearch = root.querySelector("#soilSearch");

  let editingId = null;

  // --- Inserir no caret (corrigido: preserva scroll atual do textarea)
  function insertAtCursor(textarea, text) {
    textarea.focus();
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    const before = textarea.value.slice(0, start);
    const after = textarea.value.slice(end);
    const prevScroll = textarea.scrollTop;
    textarea.value = before + text + after;
    const caret = start + text.length;
    textarea.selectionStart = textarea.selectionEnd = caret;
    textarea.scrollTop = prevScroll;
    textarea.dispatchEvent(new Event("input"));
  }

  // Algumas colunas do laudo que não entram na expressão
  const IGNORE_HEADERS = new Set(["ponto", "amostra", "id_ponto", "id", "profundidade"]);

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

    elSoilKeys.innerHTML = items.map(h => `
      <button class="pill" data-key="${h}"
        style="text-align:left; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
        ${h}
      </button>
    `).join("");

    elSoilKeys.querySelectorAll("button[data-key]").forEach(btn => {
      btn.addEventListener("click", () => insertAtCursor(elExpr, `#${btn.dataset.key}#`));
    });
  }

  elSoilSearch?.addEventListener("input", (e) => renderSoilKeys(e.target.value || ""));

  // --- Carrega produtos e preenche multi-select
  const produtos = window.ProductStore?.load?.() ?? [];
  elProducts.innerHTML = produtos.map(p =>
    `<option value="${p.id}" data-type="${p.tipo}">${p.nome}</option>`
  ).join("");

  // --- Monta conjunto de atributos possíveis (união dos templates + props reais)
  const attrSet = new Set();
  // templates
  Object.values(PRODUCT_TEMPLATES).forEach(arr => arr.forEach(k => attrSet.add(k)));
  // props reais dos produtos
  for (const p of produtos) {
    Object.keys(p.props ?? {}).forEach(k => attrSet.add(k));
  }
  elPropKey.innerHTML = `<option value="">—</option>` +
    Array.from(attrSet).sort().map(k => `<option value="${k}">${k}</option>`).join("");

  // Ao escolher o atributo, habilita apenas produtos que têm esse atributo
  elPropKey.addEventListener("change", () => {
    const key = (elPropKey.value || "").toLowerCase();
    Array.from(elProducts.options).forEach(opt => {
      const prod = produtos.find(p => String(p.id) === String(opt.value));
      const hasAttr = !!prod?.props?.[key];
      opt.disabled = !hasAttr;
      if (!hasAttr) opt.selected = false;
    });
  });

  // Profundidades (vindas do dataset atual)
  function refreshDepths() {
    const ds = DataStore.dataset;
    const depths = detectDepthsFrom(ds);
    elDepths.innerHTML = depths.length
      ? depths.map(d => `<option value="${d}">${d}</option>`).join("")
      : `<option value="">(nenhuma detectada — importe um laudo)</option>`;
  }

  renderSoilKeys("");
  refreshDepths();

  window.addEventListener("dataset:changed", () => {
    elSoilSearch.value = "";
    renderSoilKeys("");
    refreshDepths();
  });

  // --- Edição
  function startEdit(f) {
    editingId = f.id || null;

    elName.value = f.name ?? "";

    // atributo
    elPropKey.value = f.targetPropKey || "";

    // selecionar produtos
    const ids = Array.isArray(f.productIds) ? f.productIds : (f.productId ? [f.productId] : []);
    Array.from(elProducts.options).forEach(o => o.selected = ids.includes(o.value));

    // Profundidades
    Array.from(elDepths.options).forEach(o => {
      o.selected = (f.depths ?? []).includes(o.value);
    });

    // Expressão
    elExpr.value = f.expression ?? f.formula ?? "";

    btnSave.textContent = "✅ Atualizar fórmula";
    elName.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function cancelEdit() {
    editingId = null;
    btnClear.click();
    btnSave.textContent = "💾 Salvar fórmula";
  }

  // --- Salvar / Atualizar
  btnSave.addEventListener("click", () => {
    const name = elName.value.trim();
    const productIds = Array.from(elProducts.selectedOptions).map(o => o.value);
    const targetPropKey = elPropKey.value;
    const expression = elExpr.value.trim();
    const depths = Array.from(elDepths.selectedOptions).map(o => o.value).filter(Boolean);

    if (!name || !targetPropKey || !expression) {
      alert("Preencha: Nome, Atributo e Expressão.");
      return;
    }

    if (!name || !targetPropKey || !expression) {
      alert("Preencha: Nome, Atributo e Expressão.");
      return;
    }

    if (editingId) {
      DataStore.updateFormula(editingId, { name, productIds, targetPropKey, depths, expression });
      cancelEdit();
      renderList();
      return;
    }
    DataStore.addFormula({ name, productIds, targetPropKey, depths, expression });
    window.dispatchEvent(new CustomEvent("formulas:updated"));

    renderList();

    window.addEventListener("formulas:updated", () => renderList());
    window.addEventListener("storage", (e) => {
      if (e.key === "formulas") renderList();
    });
    btnClear.click();
  });

  btnClear.addEventListener("click", () => {
    elName.value = "";
    elPropKey.value = "";
    elExpr.value = "";
    Array.from(elProducts.options).forEach(o => o.selected = false);
    Array.from(elDepths.options).forEach(o => o.selected = false);
    editingId = null;
    btnSave.textContent = "💾 Salvar fórmula";
  });

  // --- Tabela
  function renderList() {

    const formulas = [...(DataStore.formulas || [])]
  .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));

    if (!formulas.length) {
      elList.innerHTML = `<tr><td colspan="7" style="color:var(--muted)">Nenhuma fórmula cadastrada.</td></tr>`;
      return;
    }

    elList.innerHTML = formulas.map(f => {
      const ids = f.productIds ?? (f.productId ? [f.productId] : []);


      const nomes = ids.length
        ? ids.map(id => produtos.find(p => String(p.id) === String(id))?.nome || id).join(", ")
        : `(todos com '${f.targetPropKey}')`;

      return `
        <tr>
          <td>${f.priority ?? 100}</td>
          <td>${f.name ?? "-"}</td>
          <td>${nomes || "—"}</td>
          <td>${f.targetPropKey || "—"}</td>
          <td>${(f.depths ?? []).join(", ") || "—"}</td>
          <td>
            <label class="small">
              <input type="checkbox" data-id="${f.id}" class="fxToggle" ${f.enabled !== false ? "checked" : ""}> ativa
            </label>
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
        window.dispatchEvent(new CustomEvent("formulas:updated"));

        renderList();
      });
    });
    elList.querySelectorAll(".fxToggle").forEach(chk => {
      chk.addEventListener("change", () => {
        DataStore.updateFormula(chk.dataset.id, { enabled: chk.checked });
        window.dispatchEvent(new CustomEvent("formulas:updated"));

      });
    });
    elList.querySelectorAll(".fxUp,.fxDown").forEach(btn => {
      btn.addEventListener("click", () => {
        const f = DataStore.formulas.find(x => x.id === btn.dataset.id);
        if (!f) return;
        const cur = f.priority ?? 100;
        const delta = btn.classList.contains("fxUp") ? -1 : 1;
        DataStore.updateFormula(f.id, { priority: Math.max(0, cur + delta) });
        window.dispatchEvent(new CustomEvent("formulas:updated"));

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
