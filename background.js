const GITHUB_RAW_URL = "https://raw.githubusercontent.com/LueAmaral/norteadoresPEP/refs/heads/main/snippets.json";
const STORAGE_KEY = "snippets";
const ENABLED_CATEGORIES_KEY = "enabledCategories"; // Será substituído/adaptado
const LAST_SELECTED_CATEGORY_KEY = "lastSelectedCategory"; // Será substituído/adaptado

const PROFESSIONAL_CATEGORY_KEY = "professionalCategory";
const ENABLED_CARE_LINES_KEY = "enabledCareLines"; // Novo: obj { profCat: [careLines] }
const LAST_SELECTED_CARE_LINE_KEY = "lastSelectedCareLine"; // Novo: obj { profCat: careLine }

// Função genérica para buscar e salvar no storage
async function fetchSnippetsAndSave() {
    console.log("Iniciando fetchSnippetsAndSave");
    try {
        const response = await fetch(GITHUB_RAW_URL);
        if (!response.ok) {
            throw new Error(`Erro HTTP: ${response.status}`);
        }
        const snippetsData = await response.json();
        await chrome.storage.local.set({ [STORAGE_KEY]: snippetsData });
        console.log("Snippets buscados e salvos com sucesso.");
        // Garante que as enabledCareLines sejam atualizadas após a sincronização
        await updateEnabledCareLinesOnSnippetsChange(snippetsData);
        chrome.notifications.create({
            type: "basic",
            iconUrl: "icon.png",
            title: "Sincronização Concluída",
            message: "Os snippets foram sincronizados com sucesso do GitHub."
        });
        return true;
    } catch (e) {
        console.error("Erro ao buscar ou salvar snippets:", e);
        chrome.notifications.create({
            type: "basic",
            iconUrl: "icon.png",
            title: "Falha na Sincronização",
            message: `Não foi possível sincronizar os snippets: ${e.message}`
        });
        return false;
    }
}

// Ao instalar ou atualizar a extensão
chrome.runtime.onInstalled.addListener((details) => {
    console.log("Extensão instalada ou atualizada:", details);
    // Cria o alarme para sincronização diária
    chrome.alarms.create("sync-snippets", { periodInMinutes: 1440 });
    console.log("Alarme 'sync-snippets' criado.");

    // Inicializa as enabledCareLines no momento da instalação se não existirem
    // Isso é importante para garantir que as categorias e linhas de cuidado do snippets.json padrão
    // sejam habilitadas por padrão na primeira vez que a extensão é usada.
    chrome.storage.local.get([STORAGE_KEY, ENABLED_CARE_LINES_KEY], async (result) => {
        if (chrome.runtime.lastError) {
            console.error("Erro ao ler storage na instalação:", chrome.runtime.lastError.message);
            return;
        }
        const snippets = result[STORAGE_KEY];
        const enabledCareLines = result[ENABLED_CARE_LINES_KEY];

        if (snippets && !enabledCareLines) { // Se snippets existem mas enabledCareLines não
            console.log("Inicializando enabledCareLines na instalação...");
            await updateEnabledCareLinesOnSnippetsChange(snippets, true); // true para forçar habilitação
        }
    });

    // Sincroniza imediatamente após a instalação/atualização
    // Isso garante que o usuário tenha os snippets mais recentes ao começar a usar
    fetchSnippetsAndSave();
});

// Quando o alarme dispara, sincroniza
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "sync-snippets") {
        fetchSnippetsAndSave();
    }
});

// Recebe mensagens do content script ou options/popup
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    console.log("[BackgroundScript] Mensagem recebida:", msg);
    if (msg.action === "manualSync") {
        fetchSnippetsAndSave().then(() => respond({ success: true })).catch(err => respond({ success: false, error: err.message }));
        return true; // Indica resposta assíncrona
    } else if (msg.action === "getProfessionalCategory") {
        chrome.storage.local.get(PROFESSIONAL_CATEGORY_KEY, (result) => {
            respond(result[PROFESSIONAL_CATEGORY_KEY]);
        });
        return true;
    } else if (msg.action === "setProfessionalCategory") {
        chrome.storage.local.set({ [PROFESSIONAL_CATEGORY_KEY]: msg.category }, () => {
            respond({ success: true });
        });
        return true;
    } else if (msg.action === "getEnabledCareLines") {
        chrome.storage.local.get(ENABLED_CARE_LINES_KEY, (result) => {
            respond(result[ENABLED_CARE_LINES_KEY] || {});
        });
        return true;
    } else if (msg.action === "setEnabledCareLines") {
        chrome.storage.local.set({ [ENABLED_CARE_LINES_KEY]: msg.careLines }, () => {
            respond({ success: true });
        });
        return true;
    } else if (msg.action === "getLastSelectedCareLine") {
        chrome.storage.local.get(LAST_SELECTED_CARE_LINE_KEY, (result) => {
            respond(result[LAST_SELECTED_CARE_LINE_KEY] || {});
        });
        return true;
    } else if (msg.action === "setLastSelectedCareLine") {
        chrome.storage.local.set({ [LAST_SELECTED_CARE_LINE_KEY]: msg.data }, () => {
            respond({ success: true });
        });
        return true;
    } else if (msg.action === "getSnippetsDataForInPageMenu") {
        // Retorna apenas os dados necessários para o menu in-page
        // (categoria profissional atual, suas linhas de cuidado habilitadas e os tipos de snippet dentro delas)
        Promise.all([
            new Promise(resolve => chrome.storage.local.get(PROFESSIONAL_CATEGORY_KEY, r => resolve(r[PROFESSIONAL_CATEGORY_KEY]))),
            new Promise(resolve => chrome.storage.local.get(ENABLED_CARE_LINES_KEY, r => resolve(r[ENABLED_CARE_LINES_KEY] || {}))),
            new Promise(resolve => chrome.storage.local.get(STORAGE_KEY, r => resolve(r[STORAGE_KEY] || {}))),
            new Promise(resolve => chrome.storage.local.get(LAST_SELECTED_CARE_LINE_KEY, r => resolve(r[LAST_SELECTED_CARE_LINE_KEY] || {})))
        ]).then(([profCat, enabledCareLines, allSnippets, lastSelectedCareLines]) => {
            if (!profCat || !allSnippets[profCat]) {
                respond({ error: "Categoria profissional não definida ou não encontrada." });
                return;
            }

            const enabledLinesForProfCat = enabledCareLines[profCat] || [];
            const snippetsForMenu = {};
            enabledLinesForProfCat.forEach(lineName => {
                if (allSnippets[profCat][lineName]) {
                    snippetsForMenu[lineName] = Object.keys(allSnippets[profCat][lineName]).map(snippetType => {
                        const snippetData = allSnippets[profCat][lineName][snippetType];
                        if (typeof snippetData === 'string') {
                            return { type: snippetType, hasCommand: false };
                        } else if (typeof snippetData === 'object' && snippetData.content) {
                            return { type: snippetType, hasCommand: !!snippetData.command };
                        }
                        return null; // Should not happen with valid data
                    }).filter(Boolean);
                }
            });
            respond({
                professionalCategory: profCat,
                careLines: snippetsForMenu,
                lastSelectedCareLine: lastSelectedCareLines[profCat]
            });
        }).catch(error => {
            console.error("[BackgroundScript] Erro em getSnippetsDataForInPageMenu:", error);
            respond({ error: error.message });
        });
        return true;
    } else if (msg.action === "getSnippetsForEditor") {
        chrome.storage.local.get(STORAGE_KEY, (result) => {
            respond(result[STORAGE_KEY] || {});
        });
        return true;
    } else if (msg.action === "saveSnippetsToEditor") {
        chrome.storage.local.set({ [STORAGE_KEY]: msg.snippets }, async () => {
            // Após salvar do editor, precisamos reavaliar as enabledCareLines
            await updateEnabledCareLinesOnSnippetsChange(msg.snippets);
            respond({ success: true });
        });
        return true;
    } else if (msg.action === "getSnippetByCommandName") {
        const commandName = msg.command.toLowerCase();
        Promise.all([
            new Promise(resolve => chrome.storage.local.get(STORAGE_KEY, r => resolve(r[STORAGE_KEY] || {}))),
            new Promise(resolve => chrome.storage.local.get(PROFESSIONAL_CATEGORY_KEY, r => resolve(r[PROFESSIONAL_CATEGORY_KEY]))),
            new Promise(resolve => chrome.storage.local.get(LAST_SELECTED_CARE_LINE_KEY, r => resolve(r[LAST_SELECTED_CARE_LINE_KEY] || {}))),
            new Promise(resolve => chrome.storage.local.get(ENABLED_CARE_LINES_KEY, r => resolve(r[ENABLED_CARE_LINES_KEY] || {})))
        ]).then(([snippets, profCat, lastSelectedCareLines, enabledCareLines]) => {
            if (!profCat || !snippets[profCat]) {
                respond({ content: null, error: "Categoria profissional não definida." });
                return;
            }

            const lastCareLineForProfCat = lastSelectedCareLines[profCat];
            const enabledLinesForProfCat = enabledCareLines[profCat] || [];
            let foundSnippetContent = null;

            // Prioridade 1: Linha de cuidado usada por último (se habilitada)
            if (lastCareLineForProfCat && enabledLinesForProfCat.includes(lastCareLineForProfCat) && snippets[profCat][lastCareLineForProfCat]) {
                for (const type in snippets[profCat][lastCareLineForProfCat]) {
                    const snippetData = snippets[profCat][lastCareLineForProfCat][type];
                    if (typeof snippetData === 'object' && snippetData.command && snippetData.command.toLowerCase() === commandName) {
                        foundSnippetContent = snippetData.content;
                        break;
                    }
                    if (type.toLowerCase() === commandName && typeof snippetData === 'string') {
                        foundSnippetContent = snippetData;
                        break;
                    }
                     if (type.toLowerCase() === commandName && typeof snippetData === 'object' && snippetData.content && !snippetData.command) {
                        foundSnippetContent = snippetData.content;
                        break;
                    }
                }
            }

            // Prioridade 2: Outras linhas de cuidado habilitadas
            if (!foundSnippetContent) {
                for (const careLine of enabledLinesForProfCat) {
                    if (careLine === lastCareLineForProfCat) continue; // Já checado
                    if (snippets[profCat][careLine]) {
                        for (const type in snippets[profCat][careLine]) {
                            const snippetData = snippets[profCat][careLine][type];
                            if (typeof snippetData === 'object' && snippetData.command && snippetData.command.toLowerCase() === commandName) {
                                foundSnippetContent = snippetData.content;
                                break;
                            }
                            if (type.toLowerCase() === commandName && typeof snippetData === 'string') {
                                foundSnippetContent = snippetData;
                                break;
                            }
                            if (type.toLowerCase() === commandName && typeof snippetData === 'object' && snippetData.content && !snippetData.command) {
                                foundSnippetContent = snippetData.content;
                                break;
                            }
                        }
                    }
                    if (foundSnippetContent) break;
                }
            }
            respond({ content: foundSnippetContent });
        }).catch(error => {
            console.error("[BackgroundScript] Erro em getSnippetByCommandName:", error);
            respond({ content: null, error: error.message });
        });
        return true;
    } else if (msg.action === "getInsertionMode") {
        chrome.storage.local.get(INSERTION_MODE_KEY, (result) => {
            respond(result[INSERTION_MODE_KEY] || "both"); // Padrão para 'both' se não definido
        });
        return true;
    } else if (msg.action === "setInsertionMode") {
        chrome.storage.local.set({ [INSERTION_MODE_KEY]: msg.mode }, () => {
            respond({ success: true });
        });
        return true;
    }
    // Se nenhuma ação corresponder, é bom responder para evitar erros de "port closed"
    // No entanto, todas as ações acima retornam true ou chamam respond()
    console.warn("[BackgroundScript] Ação desconhecida ou não tratada:", msg.action);
    // respond({ error: "Ação desconhecida" }); // Descomente se necessário, mas pode causar problemas se uma resposta já foi enviada.
    return false; // Para ações síncronas ou se nenhuma resposta for necessária aqui.
});

// Lidar com o clique no ícone da extensão (substitui o popup)
chrome.action.onClicked.addListener((tab) => {
    console.log("[BackgroundScript] Ícone da extensão clicado.");
    const optionsUrl = chrome.runtime.getURL("options.html");
    chrome.tabs.query({ url: optionsUrl }, (tabs) => {
        if (tabs.length > 0) {
            chrome.tabs.update(tabs[0].id, { active: true });
            chrome.windows.update(tabs[0].windowId, { focused: true });
        } else {
            chrome.tabs.create({ url: optionsUrl });
        }
    });
});

// Lidar com o comando definido no manifest.json
chrome.commands.onCommand.addListener((command) => {
    console.log(`[BackgroundScript] Comando '${command}' recebido.`);
    if (command === "abrir-snippets") {
        // Por agora, vamos abrir a página de opções.
        // No futuro, podemos tentar implementar a abertura direta do menu de snippets.
        const optionsUrl = chrome.runtime.getURL("options.html");
        chrome.tabs.query({ url: optionsUrl }, (tabs) => {
            if (tabs.length > 0) {
                chrome.tabs.update(tabs[0].id, { active: true });
                chrome.windows.update(tabs[0].windowId, { focused: true });
            } else {
                chrome.tabs.create({ url: optionsUrl });
            }
        });
    }
});

// Função auxiliar para atualizar enabledCareLines quando os snippets mudam (ex: via GitHub sync ou editor)
// O parâmetro forceEnableAll é novo, para o caso da instalação inicial.
async function updateEnabledCareLinesOnSnippetsChange(newSnippetsData, forceEnableAll = false) {
    console.log("updateEnabledCareLinesOnSnippetsChange chamado com forceEnableAll:", forceEnableAll);
    try {
        const result = await chrome.storage.local.get([ENABLED_CARE_LINES_KEY, PROFESSIONAL_CATEGORY_KEY]);
        if (chrome.runtime.lastError) {
            console.error("Erro ao ler storage em updateEnabledCareLinesOnSnippetsChange:", chrome.runtime.lastError.message);
            return;
        }
        let currentEnabledCareLines = result[ENABLED_CARE_LINES_KEY] || {};
        const currentProfessionalCategory = result[PROFESSIONAL_CATEGORY_KEY];

        let changed = false;
        for (const profCat in newSnippetsData) {
            if (!currentEnabledCareLines[profCat] || forceEnableAll) {
                currentEnabledCareLines[profCat] = []; // Inicializa se não existir ou se forçando
                changed = true;
            }
            if (newSnippetsData[profCat]) {
                for (const careLine in newSnippetsData[profCat]) {
                    // Se for para forçar, ou se a linha de cuidado é nova para essa categoria profissional,
                    // adiciona-a como habilitada.
                    if (forceEnableAll || !currentEnabledCareLines[profCat].includes(careLine)) {
                        if (forceEnableAll) { // Se forçando, limpa e adiciona todas do JSON
                            if (!changed && !currentEnabledCareLines[profCat].includes(careLine)) changed = true; // Marca mudança se realmente adicionar algo novo
                            // No modo force, reconstruímos a lista para garantir que apenas as do JSON atual fiquem
                        } else if (!currentEnabledCareLines[profCat].includes(careLine)) {
                            currentEnabledCareLines[profCat].push(careLine);
                            changed = true;
                        }
                    }
                }
                 // Se forceEnableAll, garante que apenas as linhas de cuidado do JSON atual estejam habilitadas
                if (forceEnableAll) {
                    const careLinesFromJson = Object.keys(newSnippetsData[profCat]);
                    if (JSON.stringify(currentEnabledCareLines[profCat].sort()) !== JSON.stringify(careLinesFromJson.sort())) {
                        currentEnabledCareLines[profCat] = careLinesFromJson;
                        changed = true;
                    }
                }
            }
        }

        if (changed) {
            console.log("Salvando enabledCareLines atualizadas:", currentEnabledCareLines);
            await chrome.storage.local.set({ [ENABLED_CARE_LINES_KEY]: currentEnabledCareLines });
        }
    } catch (error) {
        console.error("Erro em updateEnabledCareLinesOnSnippetsChange:", error);
    }
}
