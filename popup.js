const STORAGE_KEY = "snippets";
const ENABLED_CATEGORIES_KEY = "enabledCategories";

document.addEventListener("DOMContentLoaded", () => {
    const selCat = document.getElementById("categories");
    const listEl = document.getElementById("snippetsList");

    // Carrega snippets e categorias habilitadas
    chrome.storage.local.get([STORAGE_KEY, ENABLED_CATEGORIES_KEY]).then((res) => {
        const data = res[STORAGE_KEY] || { categorias: {} };
        const enabled = res[ENABLED_CATEGORIES_KEY] || [];

        // Preenche dropdown com categorias habilitadas
        Object.keys(data.categorias || {}).forEach((cat) => {
            const opt = document.createElement("option");
            opt.value = cat;
            opt.textContent = cat;
            if (!enabled.includes(cat)) opt.disabled = true;
            selCat.appendChild(opt);
        });

        // Quando mudar categoria, mostra snippets dela
        selCat.addEventListener("change", () => renderSnippets(data, selCat.value));
        // Se existir pelo menos uma, seleciona a primeira
        if (selCat.options.length) {
            selCat.selectedIndex = 0;
            renderSnippets(data, selCat.value);
        }
    });

    // Função para exibir lista de snippets
    function renderSnippets(data, categoria) {
        listEl.innerHTML = "";
        const itens = data.categorias[categoria] || [];
        itens.forEach((item) => {
            const li = document.createElement("li");
            li.textContent = item.nome;
            li.addEventListener("click", () => {
                // Ao clicar, envia mensagem ao content script com o conteúdo
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    chrome.tabs.sendMessage(tabs[0].id, { action: "pasteSnippet", content: item.conteudo });
                });
                window.close();
            });
            listEl.appendChild(li);
        });
    }
});
