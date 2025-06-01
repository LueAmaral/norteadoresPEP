const STORAGE_KEY = "snippets";
const ENABLED_CATEGORIES_KEY = "enabledCategories";

document.addEventListener("DOMContentLoaded", async () => {
    const selCat = document.getElementById("categories");
    const listEl = document.getElementById("snippetsList");

    // Função para enviar mensagem e retornar uma promessa
    function sendMessage(message) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(message, resolve);
        });
    }

    // Carrega snippets, categorias habilitadas e última categoria selecionada
    const [storageData, lastSelectedCategory] = await Promise.all([
        chrome.storage.local.get([STORAGE_KEY, ENABLED_CATEGORIES_KEY]),
        sendMessage({ action: "getLastSelectedCategory" })
    ]);

    const data = storageData[STORAGE_KEY] || { categorias: {} };
    const enabled = storageData[ENABLED_CATEGORIES_KEY] || [];

    // Preenche dropdown com categorias habilitadas
    Object.keys(data.categorias || {}).forEach((cat) => {
        const opt = document.createElement("option");
        opt.value = cat;
        opt.textContent = cat;
        if (!enabled.includes(cat)) {
            opt.disabled = true;
            opt.style.color = "#aaa"; // Adiciona um estilo para melhor feedback visual
        }
        selCat.appendChild(opt);
    });

    let initialCategoryToRender = null;

    // Se existir uma última categoria selecionada, ela estiver habilitada e existir nos dados, seleciona-a
    if (lastSelectedCategory && enabled.includes(lastSelectedCategory) && data.categorias && data.categorias[lastSelectedCategory]) {
        selCat.value = lastSelectedCategory;
        initialCategoryToRender = lastSelectedCategory;
    } else {
        // Caso contrário, tenta selecionar a primeira opção habilitada e válida
        const firstEnabledOption = Array.from(selCat.options).find(opt => !opt.disabled && data.categorias && data.categorias[opt.value]);
        if (firstEnabledOption) {
            selCat.value = firstEnabledOption.value;
            initialCategoryToRender = firstEnabledOption.value;
            // Salva esta como a última selecionada se nenhuma válida existia ou a anterior não é mais válida
            if (!lastSelectedCategory || !enabled.includes(lastSelectedCategory) || !(data.categorias && data.categorias[lastSelectedCategory])) {
                sendMessage({ action: "setLastSelectedCategory", category: initialCategoryToRender });
            }
        }
    }

    // Renderiza snippets para a categoria atualmente selecionada (se houver uma válida)
    if (initialCategoryToRender) {
        renderSnippets(data, initialCategoryToRender);
    } else {
        listEl.innerHTML = "<li>Nenhuma categoria habilitada ou snippets disponíveis. Verifique as Opções.</li>";
    }

    // Quando mudar categoria, mostra snippets dela e salva a seleção
    selCat.addEventListener("change", () => {
        const selectedCategoryValue = selCat.value;
        renderSnippets(data, selectedCategoryValue);
        sendMessage({ action: "setLastSelectedCategory", category: selectedCategoryValue });
    });

    // Função para exibir lista de snippets
    function renderSnippets(data, categoria) {
        listEl.innerHTML = "";
        // Verifica se a categoria existe e tem dados
        if (!categoria || !data.categorias || !data.categorias[categoria]) {
            listEl.innerHTML = "<li>Selecione uma categoria válida.</li>";
            return;
        }
        const itens = data.categorias[categoria] || [];
        if (itens.length === 0) {
            listEl.innerHTML = "<li>Nenhum snippet nesta categoria.</li>";
            return;
        }
        itens.forEach((item) => {
            const li = document.createElement("li");
            li.textContent = item.nome;
            li.addEventListener("click", () => {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs[0] && tabs[0].id) {
                        chrome.tabs.sendMessage(tabs[0].id, { action: "pasteSnippet", content: item.conteudo });
                    }
                });
                window.close();
            });
            listEl.appendChild(li);
        });
    }
});
