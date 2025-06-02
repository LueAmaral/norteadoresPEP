const GITHUB_RAW_URL = "https://raw.githubusercontent.com/LueAmaral/norteadoresPEP/refs/heads/main/snippets.json";
const STORAGE_KEY = "snippets";
const ENABLED_CATEGORIES_KEY = "enabledCategories"; // Será substituído/adaptado
const LAST_SELECTED_CATEGORY_KEY = "lastSelectedCategory"; // Será substituído/adaptado

const PROFESSIONAL_CATEGORY_KEY = "professionalCategory";
const ENABLED_CARE_LINES_KEY = "enabledCareLines"; // Novo: obj { profCat: [careLines] }
const LAST_SELECTED_CARE_LINE_KEY = "lastSelectedCareLine"; // Novo: obj { profCat: careLine }
const INSERTION_MODE_KEY = "insertionMode"; // Chave para o modo de inserção
const SYNC_ENABLED_KEY = "syncEnabled"; // Chave para o estado da sincronização automática

// Função genérica para buscar e salvar no storage
async function fetchSnippetsAndSave(isManualSync = false) {
    console.log(`[BackgroundJS] Iniciando fetchSnippetsAndSave. Manual: ${isManualSync}`);
    
    if (!isManualSync) {
        const syncSettings = await chrome.storage.local.get(SYNC_ENABLED_KEY);
        const syncEnabled = syncSettings[SYNC_ENABLED_KEY] !== undefined ? syncSettings[SYNC_ENABLED_KEY] : true; // Padrão true
        if (!syncEnabled) {
            console.log("[BackgroundJS] Sincronização automática desabilitada nas configurações. Abortando fetchSnippetsAndSave.");
            return false; 
        }
    }
    
    try {
        const response = await fetch(GITHUB_RAW_URL);
        if (!response.ok) {
            console.error(`[BackgroundJS] Erro HTTP ao buscar snippets: ${response.status}`);
            throw new Error(`Erro HTTP: ${response.status}`);
        }
        const snippetsData = await response.json();
        await chrome.storage.local.set({ [STORAGE_KEY]: snippetsData });
        console.log("[BackgroundJS] Snippets buscados e salvos com sucesso do GitHub.");

        // Determina se enabledCareLines precisa de inicialização forçada.
        const { [ENABLED_CARE_LINES_KEY]: existingEnabledCareLines } = await chrome.storage.local.get(ENABLED_CARE_LINES_KEY);
        let forceEnable = false;
        if (!existingEnabledCareLines || 
            Array.isArray(existingEnabledCareLines) || 
            (typeof existingEnabledCareLines === 'object' && existingEnabledCareLines === null) || // Checa explicitamente por null
            (typeof existingEnabledCareLines !== 'object')) { // Qualquer outro tipo não-objeto
            console.log("[BackgroundJS - fetchSnippetsAndSave] Forçando a habilitação de todas as linhas de cuidado: existingEnabledCareLines está ausente, é array, null ou não é objeto.", existingEnabledCareLines);
            forceEnable = true;
        } else {
            console.log("[BackgroundJS - fetchSnippetsAndSave] existingEnabledCareLines é um objeto válido. Sincronização normal.", existingEnabledCareLines);
        }
        
        await updateEnabledCareLinesOnSnippetsChange(snippetsData, forceEnable);
        
        chrome.notifications.create({
            type: "basic",
            iconUrl: "icon.png",
            title: "Sincronização Concluída",
            message: "Os snippets foram sincronizados com sucesso do GitHub."
        });
        return true;
    } catch (e) {
        console.error("[BackgroundJS] Erro detalhado em fetchSnippetsAndSave:", e);
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
    console.log("[BackgroundJS - onInstalled] Extensão instalada ou atualizada:", details);
    
    // Configura o alarme independentemente da configuração de syncEnabled,
    // pois o usuário pode habilitá-lo mais tarde. A verificação será feita quando o alarme disparar.
    chrome.alarms.create("sync-snippets", { periodInMinutes: 1440 }); // 1440 minutos = 24 horas
    console.log("[BackgroundJS - onInstalled] Alarme \'sync-snippets\' criado.");

    // Inicializa syncEnabled como true se não estiver definido
    chrome.storage.local.get(SYNC_ENABLED_KEY, (result) => {
        if (result[SYNC_ENABLED_KEY] === undefined) {
            chrome.storage.local.set({ [SYNC_ENABLED_KEY]: true }, () => {
                console.log("[BackgroundJS - onInstalled] Preferência de sincronização automática inicializada como true.");
            });
        }
    });

    // Tenta carregar os dados atuais do storage para tomar decisões.
    chrome.storage.local.get([STORAGE_KEY, ENABLED_CARE_LINES_KEY], async (result) => {
        if (chrome.runtime.lastError) {
            console.error("[BackgroundJS - onInstalled] Erro ao ler storage inicial:", chrome.runtime.lastError.message);
            // Mesmo com erro aqui, fetchSnippetsAndSave() ainda será chamado.
        } else {
            const snippetsFromStorage = result[STORAGE_KEY];
            const enabledCareLinesFromStorage = result[ENABLED_CARE_LINES_KEY];
            let needsForcedUpdateOfCareLines = false;

            if (!enabledCareLinesFromStorage) {
                console.log("[BackgroundJS - onInstalled] ENABLED_CARE_LINES_KEY não encontrado no storage. Será inicializado por fetchSnippetsAndSave.");
                // fetchSnippetsAndSave chamará updateEnabledCareLines com forceEnableAll=true se for o caso.
            } else if (Array.isArray(enabledCareLinesFromStorage)) {
                console.warn("[BackgroundJS - onInstalled] ENABLED_CARE_LINES_KEY encontrado no formato de array antigo. Será corrigido e reinicializado.");
                // Indica que updateEnabledCareLinesOnSnippetsChange deve forçar a atualização.
                // Esta condição será tratada por fetchSnippetsAndSave.
            } else if (typeof enabledCareLinesFromStorage !== 'object' || enabledCareLinesFromStorage === null) {
                console.warn(`[BackgroundJS - onInstalled] ENABLED_CARE_LINES_KEY tem um tipo inesperado (${typeof enabledCareLinesFromStorage}). Será reinicializado.`);
                // Também será tratado por fetchSnippetsAndSave.
            }

            // Se temos snippets no storage, mas enabledCareLines está problemático ou ausente,
            // uma sincronização com forceEnableAll=true pode ser necessária após o fetch.
            // A lógica principal para isso agora está em fetchSnippetsAndSave.
            // Se snippetsFromStorage existir e enabledCareLinesFromStorage for um objeto válido,
            // uma sincronização normal (forceEnableAll=false) será feita por fetchSnippetsAndSave.
            if (snippetsFromStorage && (needsForcedUpdateOfCareLines || (enabledCareLinesFromStorage && typeof enabledCareLinesFromStorage === 'object' && !Array.isArray(enabledCareLinesFromStorage)))) {
                 console.log("[BackgroundJS - onInstalled] Dados de snippets e enabledCareLines (objeto) existem. fetchSnippetsAndSave fará a sincronização.");
            } else if (!snippetsFromStorage) {
                console.log("[BackgroundJS - onInstalled] Nenhum snippet no storage. fetchSnippetsAndSave irá buscar e inicializar tudo.");
            }
        }
        // Sincroniza imediatamente após a instalação/atualização.
        // Esta chamada é crucial e sua lógica interna (com updateEnabledCareLinesOnSnippetsChange)
        // determinará se o forceEnableAll é true ou false.
        fetchSnippetsAndSave();
    });
});

// Quando o alarme dispara, sincroniza
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "sync-snippets") {
        console.log("[BackgroundJS] Alarme \'sync-snippets\' disparado.");
        // A função fetchSnippetsAndSave agora verifica internamente se a sincronização está habilitada
        await fetchSnippetsAndSave(false); // Passa false para indicar que não é uma sincronização manual
    }
});

// Recebe mensagens do content script ou options/popup
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    console.log("[BackgroundJS] Mensagem recebida:", msg); // Log geral de mensagens

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
        // Assume que msg.data é um objeto como { "NomeDaCategoriaProf": ["linha1", "linha2"] }
        // ou que msg.professionalCategory e msg.careLines (renomeado para msg.careLinesForCategory para clareza) são fornecidos
        if (msg.professionalCategory && Array.isArray(msg.careLines)) { 
            console.log(`[BackgroundJS] setEnabledCareLines recebido para categoria: ${msg.professionalCategory}, linhas:`, msg.careLines);
            chrome.storage.local.get(ENABLED_CARE_LINES_KEY, (result) => {
                if (chrome.runtime.lastError) {
                    console.error("[BackgroundJS] Erro ao ler ENABLED_CARE_LINES_KEY para setEnabledCareLines:", chrome.runtime.lastError.message);
                    respond({ success: false, error: chrome.runtime.lastError.message });
                    return;
                }
                let allEnabledCareLines = result[ENABLED_CARE_LINES_KEY];
                if (typeof allEnabledCareLines !== 'object' || allEnabledCareLines === null || Array.isArray(allEnabledCareLines)) {
                    console.warn("[BackgroundJS] allEnabledCareLines não era um objeto válido em setEnabledCareLines. Reiniciando.");
                    allEnabledCareLines = {};
                }
                allEnabledCareLines[msg.professionalCategory] = msg.careLines; // Atualiza apenas a categoria especificada
                chrome.storage.local.set({ [ENABLED_CARE_LINES_KEY]: allEnabledCareLines }, () => {
                    if (chrome.runtime.lastError) {
                        console.error("[BackgroundJS] Erro ao salvar enabledCareLines (por categoria):", chrome.runtime.lastError.message);
                        respond({ success: false, error: chrome.runtime.lastError.message });
                        return;
                    }
                    console.log("[BackgroundJS] EnabledCareLines (por categoria) salvas:", allEnabledCareLines);
                    respond({ success: true });
                });
            });
        } else if (typeof msg.careLines === 'object' && msg.careLines !== null && !Array.isArray(msg.careLines)) { // Se options.js envia o objeto completo
            console.log("[BackgroundJS] setEnabledCareLines recebido com objeto completo:", msg.careLines);
            chrome.storage.local.set({ [ENABLED_CARE_LINES_KEY]: msg.careLines }, () => {
                if (chrome.runtime.lastError) {
                    console.error("[BackgroundJS] Erro ao salvar enabledCareLines (objeto completo):", chrome.runtime.lastError.message);
                    respond({ success: false, error: chrome.runtime.lastError.message });
                    return;
                }
                console.log("[BackgroundJS] EnabledCareLines (objeto completo) salvas:", msg.careLines);
                respond({ success: true });
            });
        } else {
            console.error("[BackgroundJS] Formato inválido para setEnabledCareLines:", msg);
            respond({ success: false, error: "Formato de dados inválido para setEnabledCareLines." });
        }
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
            const snippetsForProfCat = allSnippets[profCat] || {};
            const lastSelectedCareLineForProfCat = lastSelectedCareLines[profCat] || null;
            respond({
                snippetsForProfCat,
                enabledCareLinesForProfCat: enabledLinesForProfCat,
                lastSelectedCareLineForProfCat
            });
        }).catch(error => {
            console.error("[BackgroundScript] Erro em getSnippetsDataForInPageMenu:", error);
            respond({ error: error.message });
        });
        return true;
    } else if (msg.action === "getAllSnippets") {
        chrome.storage.local.get(STORAGE_KEY, (result) => {
            if (chrome.runtime.lastError) { console.error("[BackgroundJS] Erro em getAllSnippets:", chrome.runtime.lastError.message); respond({error: chrome.runtime.lastError.message}); return; }
            respond(result[STORAGE_KEY] || {});
        });
        return true; 
    } else if (msg.action === "saveAllSnippets") { // Handler para salvar snippets do editor
        chrome.storage.local.set({ [STORAGE_KEY]: msg.payload }, () => {
            if (chrome.runtime.lastError) {
                console.error("[BackgroundJS] Erro ao salvar snippets:", chrome.runtime.lastError.message);
                respond({ success: false, error: chrome.runtime.lastError.message });
                return;
            }
            console.log("[BackgroundJS] Snippets salvos com sucesso via editor.");
            respond({ success: true });
            // Opcional: Chamar updateEnabledCareLinesOnSnippetsChange se a estrutura de snippets mudou significativamente
            // Isso é importante se as linhas de cuidado habilitadas dependem dos snippets existentes.
            updateEnabledCareLinesOnSnippetsChange(msg.payload); 
        });
        return true;
    } else if (msg.action === "getSnippetByCommandName") { 
        const commandName = msg.command ? msg.command.toLowerCase() : null;
        if (!commandName) {
            respond({ error: "Comando inválido." });
            return true;
        }
        console.log(`[BackgroundJS] Recebido getSnippetByCommandName para comando: '${commandName}'`);

        Promise.all([
            new Promise(resolve => chrome.storage.local.get(STORAGE_KEY, r => resolve(r[STORAGE_KEY] || {}))),
            new Promise(resolve => chrome.storage.local.get(PROFESSIONAL_CATEGORY_KEY, r => resolve(r[PROFESSIONAL_CATEGORY_KEY]))),
            new Promise(resolve => chrome.storage.local.get(ENABLED_CARE_LINES_KEY, r => resolve(r[ENABLED_CARE_LINES_KEY] || {}))),
            new Promise(resolve => chrome.storage.local.get(LAST_SELECTED_CARE_LINE_KEY, r => resolve(r[LAST_SELECTED_CARE_LINE_KEY] || {})))
        ]).then(([allSnippets, profCat, enabledCareLinesData, lastSelectedCareLinesData]) => {
            // console.log("[BackgroundJS] Dados para getSnippetByCommandName:", { allSnippets, profCat, enabledCareLinesData, lastSelectedCareLinesData });

            if (!profCat || !allSnippets[profCat]) {
                console.log("[BackgroundJS] Categoria profissional não definida ou snippets não encontrados para a categoria.");
                respond({ error: "Categoria profissional não definida ou snippets não encontrados." });
                return;
            }

            const snippetsForProfCat = allSnippets[profCat];
            let foundSnippetContent = null;

            function findCommand(careLineName) {
                if (snippetsForProfCat[careLineName]) {
                    for (const snippetKey in snippetsForProfCat[careLineName]) {
                        const snippetData = snippetsForProfCat[careLineName][snippetKey];
                        if (typeof snippetData === 'object' && snippetData !== null && typeof snippetData.command === 'string' && snippetData.command.toLowerCase() === commandName) {
                            return snippetData.content;
                        }
                    }
                }
                return null;
            }

            const lastSelectedCareLine = lastSelectedCareLinesData ? lastSelectedCareLinesData[profCat] : null;
            if (lastSelectedCareLine) {
                // console.log(`[BackgroundJS] Procurando comando na última linha de cuidado selecionada: ${lastSelectedCareLine}`);
                foundSnippetContent = findCommand(lastSelectedCareLine);
            }

            if (!foundSnippetContent) {
                const enabledLinesForProfCat = enabledCareLinesData && enabledCareLinesData[profCat] ? enabledCareLinesData[profCat] : [];
                // console.log(`[BackgroundJS] Procurando comando nas linhas de cuidado habilitadas: ${enabledLinesForProfCat.join(', ')}`);
                for (const careLine of enabledLinesForProfCat) {
                    if (careLine === lastSelectedCareLine) continue;
                    foundSnippetContent = findCommand(careLine);
                    if (foundSnippetContent) break;
                }
            }

            if (!foundSnippetContent) {
                // console.log(`[BackgroundJS] Procurando comando em todas as linhas de cuidado da categoria ${profCat} (fallback)`);
                for (const careLine in snippetsForProfCat) {
                    if (careLine === lastSelectedCareLine) continue;
                    const enabledLinesForProfCat = enabledCareLinesData && enabledCareLinesData[profCat] ? enabledCareLinesData[profCat] : [];
                    if (enabledLinesForProfCat.includes(careLine)) continue; 

                    foundSnippetContent = findCommand(careLine);
                    if (foundSnippetContent) break;
                }
            }

            if (foundSnippetContent) {
                console.log(`[BackgroundJS] Snippet encontrado para o comando '${commandName}'.`);
                respond({ content: foundSnippetContent });
            } else {
                console.log(`[BackgroundJS] Snippet não encontrado para o comando '${commandName}'.`);
                respond({ error: "Snippet não encontrado para este comando." });
            }

        }).catch(error => {
            console.error("[BackgroundJS] Erro em getSnippetByCommandName:", error);
            respond({ error: "Erro ao buscar snippet: " + error.message });
        });
        return true;
    } else if (msg.action === "getInsertionMode") { // Handler para modo de inserção
        chrome.storage.local.get(INSERTION_MODE_KEY, (result) => {
            if (chrome.runtime.lastError) { console.error("[BackgroundJS] Erro em getInsertionMode:", chrome.runtime.lastError.message); respond({error: chrome.runtime.lastError.message}); return; }
            respond({ mode: result[INSERTION_MODE_KEY] || "both" }); // Padrão "both" se não definido
        });
        return true;
    } else if (msg.action === "getSyncEnabled") { // Novo handler
        chrome.storage.local.get(SYNC_ENABLED_KEY, (result) => {
            if (chrome.runtime.lastError) {
                console.error("[BackgroundJS] Erro em getSyncEnabled:", chrome.runtime.lastError.message);
                respond({ error: chrome.runtime.lastError.message });
                return;
            }
            respond({ syncEnabled: result[SYNC_ENABLED_KEY] !== undefined ? result[SYNC_ENABLED_KEY] : true }); // Padrão true
        });
        return true;
    } else if (msg.action === "setSyncEnabled") { // Novo handler
        chrome.storage.local.set({ [SYNC_ENABLED_KEY]: msg.syncEnabled }, () => {
            if (chrome.runtime.lastError) {
                console.error("[BackgroundJS] Erro em setSyncEnabled:", chrome.runtime.lastError.message);
                respond({ success: false, error: chrome.runtime.lastError.message });
                return;
            }
            console.log(`[BackgroundJS] Preferência de sincronização automática definida para: ${msg.syncEnabled}`);
            respond({ success: true });
        });
        return true;
    }
    // Adicione outros manipuladores de mensagens aqui, se necessário
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
    console.log("[BackgroundJS] updateEnabledCareLinesOnSnippetsChange chamado com newSnippetsData:", JSON.parse(JSON.stringify(newSnippetsData)), "forceEnableAll:", forceEnableAll);
    try {
        const result = await chrome.storage.local.get([ENABLED_CARE_LINES_KEY]);
        if (chrome.runtime.lastError) {
            console.error("[BackgroundJS] Erro ao ler ENABLED_CARE_LINES_KEY em updateEnabledCareLinesOnSnippetsChange:", chrome.runtime.lastError.message);
            return;
        }
        
        let currentEnabledCareLines = result[ENABLED_CARE_LINES_KEY];
        if (typeof currentEnabledCareLines !== 'object' || currentEnabledCareLines === null || Array.isArray(currentEnabledCareLines)) {
            console.warn("[BackgroundJS] currentEnabledCareLines não era um objeto válido. Reiniciando para {}. Original:", currentEnabledCareLines);
            currentEnabledCareLines = {};
        }
        
        // Deep clone para evitar modificar o objeto original inesperadamente e para ter uma base para newEnabledCareLines
        const newEnabledCareLines = JSON.parse(JSON.stringify(currentEnabledCareLines));
        let changed = false;

        for (const profCat in newSnippetsData) {
            if (!newSnippetsData.hasOwnProperty(profCat)) continue;

            const careLinesFromSnippets = newSnippetsData[profCat] ? Object.keys(newSnippetsData[profCat]) : [];

            if (forceEnableAll) {
                // Habilita todas as linhas de cuidado da categoria profissional atual do snippets.json
                if (JSON.stringify(newEnabledCareLines[profCat]?.sort()) !== JSON.stringify(careLinesFromSnippets.sort())) {
                    console.log(`[BackgroundJS] forceEnableAll: Atualizando ${profCat} de ${JSON.stringify(newEnabledCareLines[profCat])} para: ${JSON.stringify(careLinesFromSnippets)}`);
                    newEnabledCareLines[profCat] = [...careLinesFromSnippets];
                    changed = true;
                }
            } else {
                // Modo de sincronização normal:
                // Garante que as linhas habilitadas existentes sejam válidas (ainda presentes nos snippets).
                // Remove linhas habilitadas que não existem mais nos snippets.
                // Não adiciona automaticamente novas linhas de cuidado (o usuário deve habilitá-las via opções).
                if (newEnabledCareLines[profCat] && Array.isArray(newEnabledCareLines[profCat])) {
                    const originalProfCatLines = [...newEnabledCareLines[profCat]];
                    newEnabledCareLines[profCat] = newEnabledCareLines[profCat].filter(cl => careLinesFromSnippets.includes(cl));
                    
                    if (JSON.stringify(originalProfCatLines.sort()) !== JSON.stringify(newEnabledCareLines[profCat].sort())) {
                        console.log(`[BackgroundJS] Sincronização: Atualizando ${profCat}. Linhas habilitadas filtradas para existir nos snippets. Antes: ${JSON.stringify(originalProfCatLines)}, Depois: ${JSON.stringify(newEnabledCareLines[profCat])}`);
                        changed = true;
                    }
                } else if (newEnabledCareLines[profCat] && !Array.isArray(newEnabledCareLines[profCat])) {
                     // Estado inválido (não é array), melhor limpar e deixar o usuário reconfigurar ou tratar como vazio.
                    console.warn(`[BackgroundJS] Linhas habilitadas para ${profCat} não eram um array. Resetando para []. Original: ${JSON.stringify(newEnabledCareLines[profCat])}`);
                    newEnabledCareLines[profCat] = [];
                    changed = true;
                }
                // Se newEnabledCareLines[profCat] não existe, não fazemos nada aqui.
                // O usuário precisaria habilitar linhas para esta categoria via opções se desejar.
            }
        }

        // Remover categorias profissionais de newEnabledCareLines que não existem mais em newSnippetsData
        for (const profCatInEnabled in newEnabledCareLines) {
            if (newEnabledCareLines.hasOwnProperty(profCatInEnabled) && !newSnippetsData.hasOwnProperty(profCatInEnabled)) {
                console.log(`[BackgroundJS] Removendo categoria profissional ${profCatInEnabled} de enabledCareLines pois não existe mais nos snippets.`);
                delete newEnabledCareLines[profCatInEnabled];
                changed = true;
            }
        }

        if (changed) {
            console.log("[BackgroundJS] Salvando enabledCareLines atualizadas:", JSON.parse(JSON.stringify(newEnabledCareLines)));
            await chrome.storage.local.set({ [ENABLED_CARE_LINES_KEY]: newEnabledCareLines });
            if (chrome.runtime.lastError) {
                console.error("[BackgroundJS] Erro ao salvar ENABLED_CARE_LINES_KEY após atualização:", chrome.runtime.lastError.message);
            }
        } else {
            console.log("[BackgroundJS] Nenhuma mudança necessária em enabledCareLines após verificação.");
        }
    } catch (error) {
        console.error("[BackgroundJS] Erro crítico em updateEnabledCareLinesOnSnippetsChange:", error);
    }
}
