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
        if (!resp.ok) {
            console.error(`Erro ao buscar snippets do GitHub: ${resp.status}`);
            // Tenta notificar o usuário sobre a falha na sincronização
            chrome.notifications.create({
                type: "basic",
                iconUrl: "icon.png",
                title: "Erro de Sincronização",
                message: `Não foi possível buscar os snippets do GitHub. Status: ${resp.status}`
            });
            return false;
        }
        const data = await resp.json();
        await chrome.storage.local.set({ [STORAGE_KEY]: data });
        console.log("Snippets sincronizados e salvos:", data);

        // Atualiza/Inicializa categoria profissional e linhas de cuidado habilitadas
        await updateEnabledCareLinesOnSnippetsChange(data);

        // Adicional: Se nenhuma categoria profissional estiver definida, define a primeira como padrão.
        const professionalCategories = Object.keys(data || {});
        if (professionalCategories.length > 0) {
            const currentProfCatResult = await chrome.storage.local.get(PROFESSIONAL_CATEGORY_KEY);
            if (!currentProfCatResult[PROFESSIONAL_CATEGORY_KEY]) {
                await chrome.storage.local.set({ [PROFESSIONAL_CATEGORY_KEY]: professionalCategories[0] });
            }
        }

        // Notifica o usuário sobre o sucesso da sincronização (opcional, mas bom para manual sync)
        chrome.notifications.create({
            type: "basic",
            iconUrl: "icon.png",
            title: "Sincronização Concluída",
            message: "Os snippets foram sincronizados com sucesso!"
        });
        return true;
    } catch (e) {
        console.error("Erro ao sincronizar:", e);
        chrome.notifications.create({
            type: "basic",
            iconUrl: "icon.png",
            title: "Erro de Sincronização",
            message: `Ocorreu um erro: ${e.message}`
        });
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
    if (msg.action === "manualSync") {
        fetchSnippetsAndSave().then(success => respond({ success })).catch(err => respond({ success: false, error: err.message }));
        return true;
    }
    if (msg.action === "getProfessionalCategory") {
        chrome.storage.local.get([PROFESSIONAL_CATEGORY_KEY], (result) => {
            if (chrome.runtime.lastError) respond({ error: chrome.runtime.lastError.message });
            else respond({ category: result[PROFESSIONAL_CATEGORY_KEY] });
        });
        return true;
    }
    if (msg.action === "setProfessionalCategory") {
        chrome.storage.local.set({ [PROFESSIONAL_CATEGORY_KEY]: msg.category }, () => {
            if (chrome.runtime.lastError) respond({ success: false, error: chrome.runtime.lastError.message });
            else respond({ success: true });
        });
        return true;
    }
    if (msg.action === "getEnabledCareLines") {
        chrome.storage.local.get([ENABLED_CARE_LINES_KEY], (result) => {
            if (chrome.runtime.lastError) respond({ error: chrome.runtime.lastError.message });
            else respond({ enabledCareLines: result[ENABLED_CARE_LINES_KEY] || {} });
        });
        return true;
    }
    if (msg.action === "setEnabledCareLines") {
        chrome.storage.local.set({ [ENABLED_CARE_LINES_KEY]: msg.enabledCareLines }, () => {
            if (chrome.runtime.lastError) respond({ success: false, error: chrome.runtime.lastError.message });
            else respond({ success: true });
        });
        return true;
    }
    if (msg.action === "getLastSelectedCareLine") {
        chrome.storage.local.get([LAST_SELECTED_CARE_LINE_KEY], (result) => {
            if (chrome.runtime.lastError) respond({ error: chrome.runtime.lastError.message });
            else respond({ careLine: result[LAST_SELECTED_CARE_LINE_KEY] });
        });
        return true;
    }
    if (msg.action === "setLastSelectedCareLine") {
        chrome.storage.local.get([LAST_SELECTED_CARE_LINE_KEY], localResult => {
            if (chrome.runtime.lastError) {
                respond({ success: false, error: chrome.runtime.lastError.message });
                return;
            }
            const allLastSelected = localResult[LAST_SELECTED_CARE_LINE_KEY] || {};
            allLastSelected[msg.category] = msg.careLine;
            chrome.storage.local.set({ [LAST_SELECTED_CARE_LINE_KEY]: allLastSelected }, () => {
                if (chrome.runtime.lastError) respond({ success: false, error: chrome.runtime.lastError.message });
                else respond({ success: true });
            });
        });
        return true;
    }
    if (msg.action === "getSnippetsDataForInPageMenu") {
        chrome.storage.local.get([STORAGE_KEY, PROFESSIONAL_CATEGORY_KEY, ENABLED_CARE_LINES_KEY, LAST_SELECTED_CARE_LINE_KEY], (result) => {
            if (chrome.runtime.lastError) {
                respond({ error: chrome.runtime.lastError.message });
                return;
            }
            const professionalCategory = result[PROFESSIONAL_CATEGORY_KEY];
            const snippets = result[STORAGE_KEY];
            const enabledCareLinesForCategory = (result[ENABLED_CARE_LINES_KEY] && result[ENABLED_CARE_LINES_KEY][professionalCategory]) ? result[ENABLED_CARE_LINES_KEY][professionalCategory] : [];
            const lastSelectedCareLineForCategory = (result[LAST_SELECTED_CARE_LINE_KEY] && result[LAST_SELECTED_CARE_LINE_KEY][professionalCategory]) ? result[LAST_SELECTED_CARE_LINE_KEY][professionalCategory] : null;

            if (!professionalCategory || !snippets || !snippets[professionalCategory]) {
                respond({
                    professionalCategory: professionalCategory,
                    careLines: [],
                    lastSelectedCareLine: null,
                    snippetsForCareLine: {}
                });
                return;
            }
            const careLinesForMenu = Object.keys(snippets[professionalCategory]).filter(cl => enabledCareLinesForCategory.includes(cl));
            respond({
                professionalCategory: professionalCategory,
                careLines: careLinesForMenu,
                lastSelectedCareLine: lastSelectedCareLineForCategory,
                snippetsForCareLine: snippets[professionalCategory] // O menu irá filtrar os tipos de snippet da linha selecionada
            });
        });
        return true;
    }
    if (msg.action === "getSnippetsForEditor") {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
            if (chrome.runtime.lastError) respond({ error: chrome.runtime.lastError.message });
            else respond({ snippets: result[STORAGE_KEY] || {} });
        });
        return true;
    }
    if (msg.action === "saveSnippetsToEditor") {
        chrome.storage.local.set({ [STORAGE_KEY]: msg.snippets }, async () => {
            if (chrome.runtime.lastError) {
                respond({ success: false, error: chrome.runtime.lastError.message });
                return;
            }
            // Atualiza as linhas de cuidado habilitadas com base nos novos snippets
            await updateEnabledCareLinesOnSnippetsChange(msg.snippets);
            respond({ success: true });
        });
        return true;
    }
    if (msg.action === "getSnippetByCommandName") {
        const commandName = msg.commandName;
        const professionalCategory = msg.professionalCategory;

        chrome.storage.local.get([STORAGE_KEY, LAST_SELECTED_CARE_LINE_KEY], (result) => {
            if (chrome.runtime.lastError) {
                respond({ found: false, reason: `Erro ao ler storage: ${chrome.runtime.lastError.message}` });
                return;
            }
            const snippets = result[STORAGE_KEY];
            const lastSelectedCareLines = result[LAST_SELECTED_CARE_LINE_KEY] || {};
            
            if (!snippets) {
                respond({ found: false, reason: "Snippets não carregados." });
                return;
            }
            if (!professionalCategory || !snippets[professionalCategory]) {
                respond({ found: false, reason: `Categoria profissional '${professionalCategory}' não encontrada nos snippets.` });
                return;
            }

            let foundSnippetContent = null;
            let foundInCareLine = null;
            let foundSnippetType = null; 

            const categorySnippets = snippets[professionalCategory];
            const careLinesToSearch = Object.keys(categorySnippets);

            const lastUsedCareLine = lastSelectedCareLines[professionalCategory];
            if (lastUsedCareLine && categorySnippets[lastUsedCareLine]) {
                const index = careLinesToSearch.indexOf(lastUsedCareLine);
                if (index > -1) {
                    careLinesToSearch.splice(index, 1);
                    careLinesToSearch.unshift(lastUsedCareLine);
                }
            }

            for (const careLine of careLinesToSearch) {
                const types = categorySnippets[careLine];
                for (const type in types) {
                    const snippetData = types[type];
                    if (typeof snippetData === 'object' && snippetData.command && snippetData.command.toLowerCase() === commandName.toLowerCase()) {
                        foundSnippetContent = snippetData.content;
                        foundInCareLine = careLine;
                        foundSnippetType = type;
                        break; 
                    }
                }
                if (foundSnippetContent) break; 
            }

            if (!foundSnippetContent) {
                for (const careLine of careLinesToSearch) {
                    const types = categorySnippets[careLine];
                    for (const type in types) {
                        if (type.toLowerCase() === commandName.toLowerCase()) {
                            const snippetData = types[type];
                            foundSnippetContent = (typeof snippetData === 'object' && snippetData.content !== undefined) ? snippetData.content : snippetData;
                            foundInCareLine = careLine;
                            foundSnippetType = type;
                            break; 
                        }
                    }
                    if (foundSnippetContent) break; 
                }
            }

            if (foundSnippetContent) {
                respond({ found: true, content: foundSnippetContent, careLine: foundInCareLine, snippetType: foundSnippetType });
            } else {
                respond({ found: false, reason: `Comando ou tipo '${commandName}' não encontrado para a categoria '${professionalCategory}'.` });
            }
        });
        return true; 
    }

    // Ações para modo de inserção
    if (msg.action === "getInsertionMode") {
        chrome.storage.local.get(["insertionMode"], (result) => {
            if (chrome.runtime.lastError) {
                console.error("Background: Error getting insertion mode:", chrome.runtime.lastError.message);
                respond({ error: chrome.runtime.lastError.message });
            } else {
                // Retorna o modo ou undefined se não estiver definido, options.js aplicará o padrão "both"
                respond({ mode: result.insertionMode });
            }
        });
        return true;
    }
    if (msg.action === "setInsertionMode") {
        chrome.storage.local.set({ insertionMode: msg.mode }, () => {
            if (chrome.runtime.lastError) {
                console.error("Background: Error setting insertion mode:", chrome.runtime.lastError.message);
                respond({ success: false, error: chrome.runtime.lastError.message });
            } else {
                respond({ success: true });
            }
        });
        return true;
    }

    /* // Ação openPopup comentada por enquanto
    if (msg.action === "openPopup") {
        // chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
        // respond({success: true}); // Exemplo se fosse assíncrono
    }
    */

    // Se a mensagem não foi tratada por nenhum dos 'if' acima e uma resposta é esperada,
    // o remetente pode receber um erro de "message port closed".
    // É importante garantir que todos os tipos de mensagem que esperam resposta sejam tratados.
});

// Função auxiliar para atualizar enabledCareLines quando os snippets mudam (ex: via editor)
async function updateEnabledCareLinesOnSnippetsChange(newSnippetsData) {
    const { [PROFESSIONAL_CATEGORY_KEY]: currentProfCat, [ENABLED_CARE_LINES_KEY]: currentEnabledCareLines } = await chrome.storage.local.get([
        PROFESSIONAL_CATEGORY_KEY,
        ENABLED_CARE_LINES_KEY
    ]);

    const allProfCategoriesInNewData = Object.keys(newSnippetsData || {});
    let updatedEnabledCareLines = JSON.parse(JSON.stringify(currentEnabledCareLines || {})); // Deep copy
    let needsUpdate = false;

    for (const profCat of allProfCategoriesInNewData) {
        if (!updatedEnabledCareLines[profCat]) {
            updatedEnabledCareLines[profCat] = []; // Inicializa se a categoria profissional é nova
            needsUpdate = true;
        }
        const careLinesInJSONForProfCat = Object.keys(newSnippetsData[profCat] || {});
        for (const careLine of careLinesInJSONForProfCat) {
            if (!updatedEnabledCareLines[profCat].includes(careLine)) {
                updatedEnabledCareLines[profCat].push(careLine); // Adiciona e habilita por padrão novas linhas de cuidado
                needsUpdate = true;
            }
        }
    }
    // Opcional: remover linhas de cuidado de updatedEnabledCareLines que não existem mais em newSnippetsData
    // (Pode ser complexo se o usuário desabilitou intencionalmente algo que foi removido do JSON)

    if (needsUpdate) {
        await chrome.storage.local.set({ [ENABLED_CARE_LINES_KEY]: updatedEnabledCareLines });
    }
}
