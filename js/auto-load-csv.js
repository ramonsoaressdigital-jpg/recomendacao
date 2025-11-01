// js/auto-load-csv.js
const AUTO_LOAD_CSV_PATH = "data/exemplos/laudo.csv";

async function autoLoadDefaultCSV() {
  try {
    // espera o DOM para garantir que #fileInput existe
    const fileInput = document.querySelector("#fileInput");
    if (!fileInput) return; // não quebra se a página não tiver o input

    // evita rodar 2x se já houver algo carregado previamente
    if (fileInput.dataset.autoLoaded === "1") return;

    const res = await fetch(AUTO_LOAD_CSV_PATH, { cache: "no-store" });
    if (!res.ok) throw new Error(`Falha ao buscar ${AUTO_LOAD_CSV_PATH}`);
    const csvText = await res.text();

    // cria um File em memória com o conteúdo do CSV
    const blob = new Blob([csvText], { type: "text/csv" });
    const file = new File([blob], "laudo.csv", { type: "text/csv" });

    // usa DataTransfer para preencher o input e disparar o change
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;

    // marca que já auto-carregou
    fileInput.dataset.autoLoaded = "1";

    // dispara o mesmo evento que o usuário geraria manualmente
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
  } catch (err) {
    console.error("[auto-load-csv] erro:", err);
  }
}

// roda após o load para garantir que tudo da UI está no lugar
window.addEventListener("load", autoLoadDefaultCSV);
