// js/seed-defaults.js

// ── AJUSTE SEUS KEYS, SE PRECISAR ──────────────────────────────────────────────
// Se o seu product-crud.js já persiste em localStorage com chaves próprias,
// deixe como está. Estes são "fallbacks" para ambientes simples.
const LS_PRODUCTS_KEY = "mvp_products";
const LS_FORMULAS_KEY = "mvp_formulas_v1";

// ── DADOS QUE VOCÊ QUER PRÉ-CARREGAR ───────────────────────────────────────────
const DEFAULT_PRODUCTS = [
  {
    "id": "p_goyxq34msmcc",
    "nome": "KCL",
    "tipo": "fertilizante",
    "unidade": "kg/ha",
    "regras": { "permiteZero": false, "doseMin": 50, "doseMax": 2000, "arredonda": "10" },
    "props": { "n": 0, "p2o5": 0, "k2o": 57, "s": 0, "b": 0, "zn": 0 }
  },
  {
    "id": "p_7vve2dn41nfc",
    "nome": "08-36-06",
    "tipo": "fertilizante",
    "unidade": "kg/ha",
    "regras": { "permiteZero": false, "doseMin": 50, "doseMax": 2000, "arredonda": "10" },
    "props": { "n": 8, "p2o5": 36, "k2o": 6, "s": 0, "b": 0, "zn": 0 }
  }
];

const DEFAULT_FORMULAS = [
  {
    "id": "f_rmhkditlvxei",
    "enabled": true,
    "priority": 100,
    "name": "K2O Soja 5000 kg - K Adequado - 2024 - EDITADO",
    "productIds": [],
    "targetPropKey": "k2o",
    "depths": ["00-20"],
    "expression": "if (#k_mgdm-#<= 80) {\n  return (((100+(80-#k_mgdm-#)*2,40916)))-6,6;\n}\nelse {\n  return ((100-((#k_mgdm-#-80)*2,40916)))-6,6;\n}"
  },
  {
    "id": "f_3wdlaexw37yw",
    "enabled": true,
    "priority": 100,
    "name": "P2O5 Soja 5000 kg - 2022 pH alto ou pH baixo - Desconto Base",
    "productIds": [],
    "targetPropKey": "p2o5",
    "depths": ["00-20"],
    "expression":
"if (#ph_cacl2# >= 5,8 && #argila# < 15 && #p_meh-_mgdm-# < 6) { return (110 - 40); }\
else if (#ph_cacl2# >= 5,8 && #argila# < 15 && #p_meh-_mgdm-# < 12) { return (100 - 40); }\
else if (#ph_cacl2# >= 5,8 && #argila# < 15 && #p_meh-_mgdm-# < 18) { return (90 - 40); }\
else if (#ph_cacl2# >= 5,8 && #argila# < 15 && #p_meh-_mgdm-# < 20) { return (80 - 40); }\
else if (#ph_cacl2# >= 5,8 && #argila# < 15 && #p_meh-_mgdm-# < 25) { return (60 - 40); }\
else if (#ph_cacl2# >= 5,8 && #argila# < 15 && #p_meh-_mgdm-# < 30) { return (40 - 40); }\
else if (#ph_cacl2# >= 5,8 && #argila# < 15 && #p_meh-_mgdm-# < 35) { return (30 - 40); }\
else if (#ph_cacl2# >= 5,8 && #argila# < 15 && #p_meh-_mgdm-# >= 35) { return (0 - 40); }\
else if (#ph_cacl2# >= 5,8 && #argila# < 35 && #p_meh-_mgdm-# < 5) { return (105 - 40); }\
else if (#ph_cacl2# >= 5,8 && #argila# < 35 && #p_meh-_mgdm-# < 8) { return (100 - 40); }\
else if (#ph_cacl2# >= 5,8 && #argila# < 35 && #p_meh-_mgdm-# < 12) { return (95 - 40); }\
else if (#ph_cacl2# >= 5,8 && #argila# < 35 && #p_meh-_mgdm-# < 18) { return (80 - 40); }\
else if (#ph_cacl2# >= 5,8 && #argila# < 35 && #p_meh-_mgdm-# < 30) { return (60 - 40); }\
else if (#ph_cacl2# >= 5,8 && #argila# < 35 && #p_meh-_mgdm-# < 35) { return (50 - 40); }\
else if (#ph_cacl2# >= 5,8 && #argila# < 35 && #p_meh-_mgdm-# < 40) { return (30 - 40); }\
else if (#ph_cacl2# >= 5,8 && #argila# < 35 && #p_meh-_mgdm-# >= 40) { return (0 - 40); }\
else if (#ph_cacl2# >= 5,8 && #argila# < 60 && #p_meh-_mgdm-# < 3) { return (130 - 40); }\
else if (#ph_cacl2# >= 5,8 && #argila# < 60 && #p_meh-_mgdm-# < 5) { return (115 - 40); }\
else if (#ph_cacl2# >= 5,8 && #argila# < 60 && #p_meh-_mgdm-# < 8) { return (100 - 40); }\
else if (#ph_cacl2# >= 5,8 && #argila# < 60 && #p_meh-_mgdm-# < 10) { return (85 - 40); }\
else if (#ph_cacl2# >= 5,8 && #argila# < 60 && #p_meh-_mgdm-# < 12) { return (65 - 40); }\
else if (#ph_cacl2# >= 5,8 && #argila# < 60 && #p_meh-_mgdm-# < 18) { return (40 - 40); }\
else if (#ph_cacl2# >= 5,8 && #argila# < 60 && #p_meh-_mgdm-# < 20) { return (30 - 40); }\
else if (#ph_cacl2# >= 5,8 && #argila# < 60 && #p_meh-_mgdm-# >= 20) { return (0 - 40); }\
else if (#ph_cacl2# >= 5,8 && #argila# >= 60 && #p_meh-_mgdm-# < 2) { return (135 - 40); }\
else if (#ph_cacl2# >= 5,8 && #argila# >= 60 && #p_meh-_mgdm-# < 3) { return (120 - 40); }\
else if (#ph_cacl2# >= 5,8 && #argila# >= 60 && #p_meh-_mgdm-# < 4) { return (100 - 40); }\
else if (#ph_cacl2# >= 5,8 && #argila# >= 60 && #p_meh-_mgdm-# < 5) { return (95 - 40); }\
else if (#ph_cacl2# >= 5,8 && #argila# >= 60 && #p_meh-_mgdm-# < 6) { return (80 - 40); }\
else if (#ph_cacl2# >= 5,8 && #argila# >= 60 && #p_meh-_mgdm-# < 9) { return (60 - 40); }\
else if (#ph_cacl2# >= 5,8 && #argila# >= 60 && #p_meh-_mgdm-# < 10) { return (40 - 40); }\
else if (#ph_cacl2# >= 5,8 && #argila# >= 60 && #p_meh-_mgdm-# >= 10) { return (0 - 40); }\
else if (#ph_cacl2# >= 5,5 && #argila# < 15 && #p_meh-_mgdm-# < 6) { return (115 - 40); }\
else if (#ph_cacl2# >= 5,5 && #argila# < 15 && #p_meh-_mgdm-# < 12) { return (105 - 40); }\
else if (#ph_cacl2# >= 5,5 && #argila# < 15 && #p_meh-_mgdm-# < 18) { return (95 - 40); }\
else if (#ph_cacl2# >= 5,5 && #argila# < 15 && #p_meh-_mgdm-# < 20) { return (75 - 40); }\
else if (#ph_cacl2# >= 5,5 && #argila# < 15 && #p_meh-_mgdm-# < 25) { return (60 - 40); }\
else if (#ph_cacl2# >= 5,5 && #argila# < 15 && #p_meh-_mgdm-# < 30) { return (45 - 40); }\
else if (#ph_cacl2# >= 5,5 && #argila# < 15 && #p_meh-_mgdm-# < 35) { return (35 - 40); }\
else if (#ph_cacl2# >= 5,5 && #argila# < 15 && #p_meh-_mgdm-# >= 35) { return (0 - 40); }\
else if (#ph_cacl2# >= 5,5 && #argila# < 35 && #p_meh-_mgdm-# < 5) { return (115 - 40); }\
else if (#ph_cacl2# >= 5,5 && #argila# < 35 && #p_meh-_mgdm-# < 8) { return (110 - 40); }\
else if (#ph_cacl2# >= 5,5 && #argila# < 35 && #p_meh-_mgdm-# < 12) { return (100 - 40); }\
else if (#ph_cacl2# >= 5,5 && #argila# < 35 && #p_meh-_mgdm-# < 18) { return (85 - 40); }\
else if (#ph_cacl2# >= 5,5 && #argila# < 35 && #p_meh-_mgdm-# < 30) { return (70 - 40); }\
else if (#ph_cacl2# >= 5,5 && #argila# < 35 && #p_meh-_mgdm-# < 35) { return (60 - 40); }\
else if (#ph_cacl2# >= 5,5 && #argila# < 35 && #p_meh-_mgdm-# < 40) { return (35 - 40); }\
else if (#ph_cacl2# >= 5,5 && #argila# < 35 && #p_meh-_mgdm-# >= 40) { return (0 - 40); }\
else if (#ph_cacl2# >= 5,5 && #argila# < 60 && #p_meh-_mgdm-# < 3) { return (135 - 40); }\
else if (#ph_cacl2# >= 5,5 && #argila# < 60 && #p_meh-_mgdm-# < 5) { return (120 - 40); }\
else if (#ph_cacl2# >= 5,5 && #argila# < 60 && #p_meh-_mgdm-# < 8) { return (105 - 40); }\
else if (#ph_cacl2# >= 5,5 && #argila# < 60 && #p_meh-_mgdm-# < 10) { return (95 - 40); }\
else if (#ph_cacl2# >= 5,5 && #argila# < 60 && #p_meh-_mgdm-# < 12) { return (75 - 40); }\
else if (#ph_cacl2# >= 5,5 && #argila# < 60 && #p_meh-_mgdm-# < 18) { return (55 - 40); }\
else if (#ph_cacl2# >= 5,5 && #argila# < 60 && #p_meh-_mgdm-# < 20) { return (40 - 40); }\
else if (#ph_cacl2# >= 5,5 && #argila# < 60 && #p_meh-_mgdm-# >= 20) { return (0 - 40); }\
else if (#ph_cacl2# >= 5,5 && #argila# >= 60 && #p_meh-_mgdm-# < 2 ) { return (140 - 40); }\
else if (#ph_cacl2# >= 5,5 && #argila# >=60 && #p_meh-_mgdm-# < 3 ) { return (125 - 40); }\
else if (#ph_cacl2# >= 5,5 && #argila# >=60 && #p_meh-_mgdm-# < 4 ) { return (110 - 40); }\
else if (#ph_cacl2# >= 5,5 && #argila# >= 60 && #p_meh-_mgdm-# < 5 ) { return (95 - 40); }\
else if (#ph_cacl2# >= 5,5 && #argila# >= 60 && #p_meh-_mgdm-# < 6) { return (70 - 40); }\
else if (#ph_cacl2# >= 5,5 && #argila# >= 60 && #p_meh-_mgdm-# < 9 ) { return (65 - 40); }\
else if (#ph_cacl2# >= 5,5 && #argila# >=60 && #p_meh-_mgdm-# < 10 ) { return (40 - 40); }\
else if (#ph_cacl2# >= 5,5 && #argila# >=60 && #p_meh-_mgdm-# >= 10 ) { return (0 - 40); }\
else if (#ph_cacl2# < 5,5 && #argila# < 15 && #p_meh-_mgdm-# < 6 ) { return (120 - 40); }\
else if (#ph_cacl2# < 5,5 && #argila# < 15 && #p_meh-_mgdm-# < 12 ) { return (110 - 40); }\
else if (#ph_cacl2# < 5,5 && #argila# < 15 && #p_meh-_mgdm-# < 18 ) { return (100 - 40); }\
else if (#ph_cacl2# < 5,5 && #argila# < 15 && #p_meh-_mgdm-# < 20 ) { return (90 - 40); }\
else if (#ph_cacl2# < 5,5 && #argila# < 15 && #p_meh-_mgdm-# < 25 ) { return (70 - 40); }\
else if (#ph_cacl2# < 5,5 && #argila# < 15 && #p_meh-_mgdm-# < 30) { return (50 - 40); }\
else if (#ph_cacl2# < 5,5 && #argila# < 15 && #p_meh-_mgdm-# < 35) { return (40 - 40); }\
else if (#ph_cacl2# < 5,5 && #argila# < 15 && #p_meh-_mgdm-# >= 35) { return (0 - 40); }\
else if (#ph_cacl2# < 5,5 && #argila# < 35 && #p_meh-_mgdm-# < 5 ) { return (120 - 40); }\
else if (#ph_cacl2# < 5,5 && #argila# < 35 && #p_meh-_mgdm-# < 8 ) { return (115 - 40); }\
else if (#ph_cacl2# < 5,5 && #argila# < 35 && #p_meh-_mgdm-# < 12 ) { return (105 - 40); }\
else if (#ph_cacl2# < 5,5 && #argila# < 35 && #p_meh-_mgdm-# < 18 ) { return (90 - 40); }\
else if (#ph_cacl2# < 5,5 && #argila# < 35 && #p_meh-_mgdm-# < 30 ) { return (65 - 40); }\
else if (#ph_cacl2# < 5,5 && #argila# < 35 && #p_meh-_mgdm-# < 35) { return (50 - 40); }\
else if (#ph_cacl2# < 5,5 && #argila# < 35 && #p_meh-_mgdm-# < 40) { return (40 - 40); }\
else if (#ph_cacl2# < 5,5 && #argila# < 35 && #p_meh-_mgdm-# >= 40) { return (0 - 40); }\
else if (#ph_cacl2# < 5,5 && #argila# < 60 && #p_meh-_mgdm-# < 3 ) { return (140 - 40); }\
else if (#ph_cacl2# < 5,5 && #argila# < 60 && #p_meh-_mgdm-# < 5 ) { return (125 - 40); }\
else if (#ph_cacl2# < 5,5 && #argila# < 60 && #p_meh-_mgdm-# < 8 ) { return (110 - 40); }\
else if (#ph_cacl2# < 5,5 && #argila# < 60 && #p_meh-_mgdm-# < 10 ) { return (100 - 40); }\
else if (#ph_cacl2# < 5,5 && #argila# < 60 && #p_meh-_mgdm-# < 12 ) { return (80 - 40); }\
else if (#ph_cacl2# < 5,5 && #argila# < 60 && #p_meh-_mgdm-# < 18 ) { return (60 - 40); }\
else if (#ph_cacl2# < 5,5 && #argila# < 60 && #p_meh-_mgdm-# < 20) { return (40 - 40); }\
else if (#ph_cacl2# < 5,5 && #argila# < 60 && #p_meh-_mgdm-# >= 20) { return (0 - 40); }\
else if (#ph_cacl2# < 5,5 && #argila# >= 60 && #p_meh-_mgdm-# < 2 ) { return (145 - 40); }\
else if (#ph_cacl2# < 5,5 && #argila# >= 60 && #p_meh-_mgdm-# < 3 ) { return (130 - 40); }\
else if (#ph_cacl2# < 5,5 && #argila# >= 60 && #p_meh-_mgdm-# < 4 ) { return (115 - 40); }\
else if (#ph_cacl2# < 5,5 && #argila# >= 60 && #p_meh-_mgdm-# < 5 ) { return (100 - 40); }\
else if (#ph_cacl2# < 5,5 && #argila# >= 60 && #p_meh-_mgdm-# < 6 ) { return (70 - 40); }\
else if (#ph_cacl2# < 5,5 && #argila# >= 60 && #p_meh-_mgdm-# < 9 ) { return (60 - 40); }\
else if (#ph_cacl2# < 5,5 && #argila# >= 60 && #p_meh-_mgdm-# < 10) { return (50 - 40); }\
else if (#ph_cacl2# < 5,5 && #argila# >= 60 && #p_meh-_mgdm-# >= 10) { return (0 - 40); }\
else { return (0); }"
  }
];

// ── HELPERS ────────────────────────────────────────────────────────────────────
function dedupeById(arr) {
  const map = new Map();
  for (const x of arr || []) map.set(String(x.id), x);
  return [...map.values()];
}

function getSavedProducts() {
  try {
    if (window.ProductStore?.load) {
      return window.ProductStore.load() || [];
    }
  } catch {}
  try {
    return JSON.parse(localStorage.getItem(LS_PRODUCTS_KEY) || "[]");
  } catch { return []; }
}

function saveProducts(list) {
  // preferir API do ProductStore, se existir
  if (window.ProductStore?.save) return window.ProductStore.save(list);
  localStorage.setItem(LS_PRODUCTS_KEY, JSON.stringify(list));
}

function getSavedFormulas() {
  // DataStore.formulas em memória OU localStorage, dependendo do seu fluxo
  try {
    if (window.DataStore && Array.isArray(window.DataStore.formulas)) {
      return window.DataStore.formulas;
    }
  } catch {}
  try {
    return JSON.parse(localStorage.getItem(LS_FORMULAS_KEY) || "[]");
  } catch { return []; }
}

function saveFormulas(list) {
  if (window.DataStore) window.DataStore.formulas = list;
  localStorage.setItem(LS_FORMULAS_KEY, JSON.stringify(list));
}

// ── SEED (só quando vazio) ────────────────────────────────────────────────────
(function seedIfEmpty() {
  // Produtos
  const existingProducts = getSavedProducts();
  if (!existingProducts.length) {
    saveProducts(dedupeById([...(existingProducts || []), ...DEFAULT_PRODUCTS]));
    console.log("[seed] Produtos pré-carregados.");
  }

  // Fórmulas
  const existingFormulas = getSavedFormulas();
  if (!existingFormulas.length) {
    saveFormulas(dedupeById([...(existingFormulas || []), ...DEFAULT_FORMULAS]));
    console.log("[seed] Fórmulas pré-carregadas.");
  }
})();
