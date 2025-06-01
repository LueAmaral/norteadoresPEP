const GITHUB_RAW_URL = "https://raw.githubusercontent.com/LueAmaral/norteadoresPEP/refs/heads/main/snippets.json";
const STORAGE_KEY = "snippets";
const ENABLED_CATEGORIES_KEY = "enabledCategories"; // Será substituído/adaptado
const LAST_SELECTED_CATEGORY_KEY = "lastSelectedCategory"; // Será substituído/adaptado

const PROFESSIONAL_CATEGORY_KEY = "professionalCategory";
const ENABLED_CARE_LINES_KEY = "enabledCareLines"; // Novo: obj { profCat: [careLines] }
const LAST_SELECTED_CARE_LINE_KEY = "lastSelectedCareLine"; // Novo: obj { profCat: careLine }

// Função genérica para buscar e salvar no storage
async function fetchSnippetsAndSave() {
    try {
        const resp = await fetch(GITHUB_RAW_URL);
        if (!resp.ok) throw new Error(`Falha ao buscar JSON: ${resp.statusText}`); // Adicionado statusText para melhor erro
        const data = await resp.json();
        await chrome.storage.local.set({ [STORAGE_KEY]: data });

        // Inicializa categoria profissional e linhas de cuidado habilitadas se necessário
        const professionalCategories = Object.keys(data || {});
        if (professionalCategories.length > 0) {
            const currentProfCatStorage = await chrome.storage.local.get(PROFESSIONAL_CATEGORY_KEY);
            const currentProfCat = currentProfCatStorage[PROFESSIONAL_CATEGORY_KEY];

            if (!currentProfCat && professionalCategories.length > 0) {
                // Define a primeira categoria profissional como padrão se nenhuma estiver definida
                await chrome.storage.local.set({ [PROFESSIONAL_CATEGORY_KEY]: professionalCategories[0] });
            }

            let { [ENABLED_CARE_LINES_KEY]: enabledCareLines } = await chrome.storage.local.get(ENABLED_CARE_LINES_KEY);
            if (!enabledCareLines) enabledCareLines = {};

            let needsUpdate = false;
            for (const profCat of professionalCategories) {
                if (data[profCat] && typeof data[profCat] === 'object') {
                    const careLinesForProfCat = Object.keys(data[profCat]);
                    if (!enabledCareLines[profCat]) {
                        enabledCareLines[profCat] = careLinesForProfCat; // Habilita todas as linhas de cuidado por padrão para novas categorias prof.
                        needsUpdate = true;
                    } else {
                        // Opcional: Sincronizar para remover linhas de cuidado que não existem mais no JSON
                        // enabledCareLines[profCat] = enabledCareLines[profCat].filter(line => careLinesForProfCat.includes(line));
                        // if (enabledCareLines[profCat].length !== Object.keys(data[profCat]).length) needsUpdate = true;
                    }
                }
            }
            if (needsUpdate) {
                await chrome.storage.local.set({ [ENABLED_CARE_LINES_KEY]: enabledCareLines });
            }
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
        // Esta ação pode ser removida se o popup.html não for mais usado para seleção
        chrome.action.openPopup();
        return false;
    }
    if (msg.action === "manualSync") {
        fetchSnippetsAndSave().then(ok => respond({ success: ok }));
        return true; // para indicar que responderemos async
    }
    // Ações para categoria profissional
    if (msg.action === "getProfessionalCategory") {
        chrome.storage.local.get(PROFESSIONAL_CATEGORY_KEY).then(res => respond(res[PROFESSIONAL_CATEGORY_KEY]));
        return true;
    }
    if (msg.action === "setProfessionalCategory") {
        chrome.storage.local.set({ [PROFESSIONAL_CATEGORY_KEY]: msg.category })
            .then(() => respond({ success: true }))
            .catch(err => respond({ success: false, error: err.message }));
        return true;
    }

    // Ações para linhas de cuidado habilitadas (agora por categoria profissional)
    if (msg.action === "getEnabledCareLines") { // Espera msg.professionalCategory
        chrome.storage.local.get(ENABLED_CARE_LINES_KEY).then(res => {
            const allEnabled = res[ENABLED_CARE_LINES_KEY] || {};
            respond(allEnabled[msg.professionalCategory] || []);
        });
        return true;
    }
    if (msg.action === "setEnabledCareLines") { // Espera msg.professionalCategory e msg.careLines
        chrome.storage.local.get(ENABLED_CARE_LINES_KEY).then(res => {
            let allEnabled = res[ENABLED_CARE_LINES_KEY] || {};
            allEnabled[msg.professionalCategory] = msg.careLines;
            chrome.storage.local.set({ [ENABLED_CARE_LINES_KEY]: allEnabled })
                .then(() => respond({ success: true }))
                .catch(err => respond({ success: false, error: err.message }));
        });
        return true;
    }

    // Ações para última linha de cuidado selecionada (agora por categoria profissional)
    if (msg.action === "getLastSelectedCareLine") { // Espera msg.professionalCategory
        chrome.storage.local.get(LAST_SELECTED_CARE_LINE_KEY).then(res => {
            const allLastSelected = res[LAST_SELECTED_CARE_LINE_KEY] || {};
            respond(allLastSelected[msg.professionalCategory]);
        });
        return true;
    }
    if (msg.action === "setLastSelectedCareLine") { // Espera msg.careLine (a profCat será buscada aqui)
        chrome.storage.local.get(PROFESSIONAL_CATEGORY_KEY).then(profCatStorage => {
            const currentProfCat = profCatStorage[PROFESSIONAL_CATEGORY_KEY];
            if (currentProfCat) {
                chrome.storage.local.get(LAST_SELECTED_CARE_LINE_KEY).then(res => {
                    let allLastSelected = res[LAST_SELECTED_CARE_LINE_KEY] || {};
                    allLastSelected[currentProfCat] = msg.careLine;
                    chrome.storage.local.set({ [LAST_SELECTED_CARE_LINE_KEY]: allLastSelected })
                        .then(() => respond({ success: true }))
                        .catch(err => respond({ success: false, error: err.message }));
                });
            } else {
                respond({ success: false, error: "Categoria profissional não definida." });
            }
        }).catch(err => respond({ success: false, error: err.message }));
        return true;
    }

    // Nova ação para fornecer dados completos para o menu na página
    if (msg.action === "getSnippetsDataForInPageMenu") {
        Promise.all([
            chrome.storage.local.get(STORAGE_KEY),
            chrome.storage.local.get(PROFESSIONAL_CATEGORY_KEY),
            chrome.storage.local.get(ENABLED_CARE_LINES_KEY),
            chrome.storage.local.get(LAST_SELECTED_CARE_LINE_KEY)
        ]).then(([snippetsStorage, profCatStorage, enabledCareLinesStorage, lastSelectedCareLineStorage]) => {
            const allSnippets = snippetsStorage[STORAGE_KEY] || {};
            const profCat = profCatStorage[PROFESSIONAL_CATEGORY_KEY];
            const allEnabledCareLines = enabledCareLinesStorage[ENABLED_CARE_LINES_KEY] || {};
            const allLastSelectedCareLines = lastSelectedCareLineStorage[LAST_SELECTED_CARE_LINE_KEY] || {};

            if (!profCat || !allSnippets[profCat]) {
                respond({
                    snippetsForProfCat: {},
                    enabledCareLinesForProfCat: [],
                    lastSelectedCareLineForProfCat: null,
                    error: "Categoria profissional não definida ou sem snippets."
                });
                return;
            }

            const snippetsForProfCat = allSnippets[profCat];
            // Se enabledCareLinesForProfCat[profCat] não existir, pega todas as chaves de snippetsForProfCat
            const enabledCareLinesForProfCat = allEnabledCareLines[profCat] || Object.keys(snippetsForProfCat || {});
            const lastSelectedCareLineForProfCat = allLastSelectedCareLines[profCat];

            respond({
                snippetsForProfCat: snippetsForProfCat || {},
                enabledCareLinesForProfCat: enabledCareLinesForProfCat,
                lastSelectedCareLineForProfCat: lastSelectedCareLineForProfCat
            });
        }).catch(error => {
            console.error("Erro ao buscar dados para o menu in-page:", error);
            respond({ error: error.message });
        });
        return true; // Resposta assíncrona
    }
    return false; // Indica que a mensagem não foi tratada e não haverá resposta assíncrona
});
