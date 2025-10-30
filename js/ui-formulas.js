import { DataStore } from "./data-store.js";

export function setupFormulasUI(containerId) {
  const el = document.getElementById(containerId);
  el.innerHTML = `
    <h3>Cadastro de Fórmulas</h3>
    <form id="form-formula">
      <input name="atributo" placeholder="Atributo (ex: P2O5_FOSFATAGEM)" required>
      <input name="nome" placeholder="Nome descritivo">
      <textarea name="formula" placeholder="Digite a fórmula (use #campo# e @variaveis@)" required></textarea>
      <button type="submit">Adicionar Fórmula</button>
    </form>
    <div id="lista-formulas"></div>
  `;

  const form = el.querySelector("#form-formula");
  const lista = el.querySelector("#lista-formulas");

  form.onsubmit = e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    DataStore.addFormula({
      atributo: data.atributo,
      nome: data.nome,
      formula: data.formula
    });
    renderFormulas(lista);
    form.reset();
  };

  renderFormulas(lista);
}

function renderFormulas(lista) {
  lista.innerHTML = DataStore.formulas.length
    ? `<ul>${DataStore.formulas.map(f => `<li><b>${f.atributo}</b>: ${f.nome || ""}</li>`).join("")}</ul>`
    : "<p>Nenhuma fórmula cadastrada.</p>";
}
