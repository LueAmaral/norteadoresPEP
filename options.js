const STORAGE_KEY = "snippets";
const ENABLED_CATEGORIES_KEY = "enabledCategories";

document.addEventListener("DOMContentLoaded", () => {
    const cont = document.getElementById("categoriesContainer");
    const btnSync = document.getElementById("syncBtn");
    const statusEl = document.getElementById("syncStatus");

    // Carrega snippets e categorias atuais
    chrome.storage.local.get([STORAGE_KEY, ENABLED_CATEGORIES_KEY]).then((res) => {
        const data = res[STORAGE_KEY] || { categorias: {} };
        const enabled = res[ENABLED_CATEGORIES_KEY] || [];
        Object.keys(data.categorias || {}).forEach((cat) => {
            const lbl = document.createElement("label");
            const chk = document.createElement("input");
            chk.type = "checkbox";
            chk.value = cat;
            chk.checked = enabled.includes(cat);
            chk.addEventListener("change", updateEnabledCategories);
            lbl.appendChild(chk);
            lbl.appendChild(document.createTextNode(cat));
            cont.appendChild(lbl);
        });
    });

    // Atualiza storage quando uma categoria é marcada/desmarcada
    function updateEnabledCategories() {
        const checks = Array.from(document.querySelectorAll("#categoriesContainer input[type=checkbox]"));
        const cats = checks.filter(c => c.checked).map(c => c.value);
        chrome.runtime.sendMessage({ action: "setEnabledCategories", categories: cats });
    }

    // Ao clicar em “Sincronizar agora”, envia mensagem ao background
    btnSync.addEventListener("click", () => {
        statusEl.textContent = "Sincronizando…";
        chrome.runtime.sendMessage({ action: "manualSync" }, (resp) => {
            if (resp && resp.success) {
                statusEl.textContent = "Sincronização concluída.";
                setTimeout(() => statusEl.textContent = "", 2000);
            } else {
                statusEl.textContent = "Falha na sincronização.";
            }
        });
    });
});
