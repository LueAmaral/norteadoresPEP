const STORAGE_KEY = "snippets";
const ENABLED_CATEGORIES_KEY = "enabledCategories";

document.addEventListener("DOMContentLoaded", async () => {
    const selCat = document.getElementById("categories");
    const listEl = document.getElementById("snippetsList");

    function sendMessage(message) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(message, resolve);
        });
    }

    const [storageData, lastSelectedCategory] = await Promise.all([
        chrome.storage.local.get([STORAGE_KEY, ENABLED_CATEGORIES_KEY]),
        sendMessage({ action: "getLastSelectedCategory" })
    ]);

    const data = storageData[STORAGE_KEY] || { categorias: {} };
    const enabled = storageData[ENABLED_CATEGORIES_KEY] || [];

    Object.keys(data.categorias || {}).forEach((cat) => {
        const opt = document.createElement("option");
        opt.value = cat;
        opt.textContent = cat;
        if (!enabled.includes(cat)) {
            opt.disabled = true;
            opt.style.color = "#aaa";
        }
        selCat.appendChild(opt);
    });

    let initialCategoryToRender = null;

    if (lastSelectedCategory && enabled.includes(lastSelectedCategory) && data.categorias && data.categorias[lastSelectedCategory]) {
        selCat.value = lastSelectedCategory;
        initialCategoryToRender = lastSelectedCategory;
    } else {
        const firstEnabledOption = Array.from(selCat.options).find(opt => !opt.disabled && data.categorias && data.categorias[opt.value]);
        if (firstEnabledOption) {
            selCat.value = firstEnabledOption.value;
            initialCategoryToRender = firstEnabledOption.value;
            if (!lastSelectedCategory || !enabled.includes(lastSelectedCategory) || !(data.categorias && data.categorias[lastSelectedCategory])) {
                sendMessage({ action: "setLastSelectedCategory", category: initialCategoryToRender });
            }
        }
    }

    if (initialCategoryToRender) {
        renderSnippets(data, initialCategoryToRender);
    } else {
        listEl.innerHTML = "<li>Nenhuma categoria habilitada ou snippets disponíveis. Verifique as Opções.</li>";
    }

    selCat.addEventListener("change", () => {
        const selectedCategoryValue = selCat.value;
        renderSnippets(data, selectedCategoryValue);
        sendMessage({ action: "setLastSelectedCategory", category: selectedCategoryValue });
    });

    function renderSnippets(data, categoria) {
        listEl.innerHTML = "";
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
