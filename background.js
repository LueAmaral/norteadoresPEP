const GITHUB_RAW_URL = "https://raw.githubusercontent.com/SEU_USUARIO/SEU_REPO/main/snippets.json";
const STORAGE_KEY = "snippets";
const ENABLED_CATEGORIES_KEY = "enabledCategories";

// Função genérica para buscar e salvar no storage
async function fetchSnippetsAndSave() {
    try {
        const resp = await fetch(GITHUB_RAW_URL);
        if (!resp.ok) throw new Error("Falha ao buscar JSON");
        const data = await resp.json();
        await chrome.storage.local.set({ [STORAGE_KEY]: data });
        // Se for primeira vez, habilita todas as categorias
        const { enabledCategories } = await chrome.storage.local.get(ENABLED_CATEGORIES_KEY);
        if (!enabledCategories) {
            const cats = Object.keys(data.categorias || {});
            await chrome.storage.local.set({ [ENABLED_CATEGORIES_KEY]: cats });
        }
        return true;
    } catch (e) {
        console.error("Erro ao sincronizar:", e);
        return false;
    }
}

// Ao instalar, criar alarme diário de 24h
chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create("sync-snippets", { periodInMinutes: 1440 });
});

// Quando o alarme dispara, sincroniza
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "sync-snippets") {
        fetchSnippetsAndSave();
    }
});

// Recebe mensagens do content script ou options/popup
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (msg.action === "openPopup") {
        // Abre o popup da extensão
        chrome.action.openPopup();
    }
    if (msg.action === "manualSync") {
        fetchSnippetsAndSave().then(ok => respond({ success: ok }));
        return true; // para indicar que responderemos async
    }
    if (msg.action === "getEnabledCategories") {
        chrome.storage.local.get(ENABLED_CATEGORIES_KEY).then(res => respond(res.enabledCategories || []));
        return true;
    }
    if (msg.action === "setEnabledCategories") {
        chrome.storage.local.set({ [ENABLED_CATEGORIES_KEY]: msg.categories }).then(() => respond({ success: true }));
        return true;
    }
});
