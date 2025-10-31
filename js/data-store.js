// data-store.js
const LS_KEY_FORMULAS = "mvp_formulas_v1";
const LS_KEY_VARS = "mvp_vars_v1";
let _dataset = null;

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function saveJSON(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}
function uuid() {
  return 'f_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export const DataStore = {
  // ============ FÓRMULAS ============
  get formulas() { return loadJSON(LS_KEY_FORMULAS, []); },
  addFormula(f) {
    const all = DataStore.formulas;
    all.push({ id: uuid(), enabled: true, priority: 100, ...f });
    saveJSON(LS_KEY_FORMULAS, all);
  },
  updateFormula(id, patch) {
    const all = DataStore.formulas.map(f => f.id === id ? { ...f, ...patch } : f);
    saveJSON(LS_KEY_FORMULAS, all);
  },
  removeFormula(id) {
    const all = DataStore.formulas.filter(f => f.id !== id);
    saveJSON(LS_KEY_FORMULAS, all);
  },
  clearFormulas() { saveJSON(LS_KEY_FORMULAS, []); },

  // ============ VARIÁVEIS (@nome@) ============
  get variaveis() { return loadJSON(LS_KEY_VARS, {}); },
  setVariavel(key, val) {
    const vars = DataStore.variaveis;
    vars[key] = val;
    saveJSON(LS_KEY_VARS, vars);
  },
  removeVariavel(key) {
    const vars = DataStore.variaveis;
    delete vars[key];
    saveJSON(LS_KEY_VARS, vars);
  },

  get dataset() {
    return _dataset;
  },
  setDataset(ds) {
    _dataset = ds;
    // Notifica qualquer UI interessada (Formulas, Editor, etc.)
    window.dispatchEvent(new CustomEvent("dataset:changed", { detail: ds }));
  },

  // se quiser limpar:
  clearDataset() {
    _dataset = null;
    window.dispatchEvent(new CustomEvent("dataset:changed", { detail: null }));
  },
};
