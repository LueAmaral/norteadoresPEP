const GITHUB_RAW_URL =
    "https://raw.githubusercontent.com/LueAmaral/norteadoresPEP/refs/heads/main/snippets.json";
const STORAGE_KEY = "snippets";
const ENABLED_CATEGORIES_KEY = "enabledCategories"; // Note: This key seems unused in favor of ENABLED_CARE_LINES_KEY for actual logic
const LAST_SELECTED_CATEGORY_KEY = "lastSelectedCategory"; // Note: This key seems unused

const PROFESSIONAL_CATEGORY_KEY = "professionalCategory";
const ENABLED_CARE_LINES_KEY = "enabledCareLines";
const LAST_SELECTED_CARE_LINE_KEY = "lastSelectedCareLine";
const INSERTION_MODE_KEY = "insertionMode";
const SYNC_ENABLED_KEY = "syncEnabled";
const ALLOWED_SITES_KEY = "allowedSites";
const DISABLED_TABS_KEY = 'disabledPinTabs'; // ADD THIS

async function fetchSnippetsAndSave(isManualSync = false) {
    console.log(
        `[BackgroundJS] Iniciando fetchSnippetsAndSave. Manual: ${isManualSync}`
    );

    if (!isManualSync) {
        console.log("[BG_FETCH] Step 0: Checking syncEnabled. Getting SYNC_ENABLED_KEY for automatic sync check.");
        const syncSettings = await chrome.storage.local.get(SYNC_ENABLED_KEY);
        console.log("[BG_FETCH] Step 0a: SYNC_ENABLED_KEY for automatic sync check retrieved:", syncSettings);
        const syncEnabled =
            syncSettings[SYNC_ENABLED_KEY] !== undefined
                ? syncSettings[SYNC_ENABLED_KEY]
                : true; // Default to true if not set, will be changed later per user request
        if (!syncEnabled) {
            console.log(
                "[BackgroundJS] Sincronização automática desabilitada nas configurações. Abortando fetchSnippetsAndSave."
            );
            return false;
        }
    }

    try {
        console.log("[BG_FETCH] Step 2: Calling fetch(GITHUB_RAW_URL)");
        const response = await fetch(GITHUB_RAW_URL);
        console.log("[BG_FETCH] Step 2a: fetch response received, status:", response.status);

        if (!response.ok) {
            console.error(
                `[BackgroundJS] Erro HTTP ao buscar snippets: ${response.status}`
            );
            throw new Error(`Erro HTTP: ${response.status}`);
        }

        console.log("[BG_FETCH] Step 3: Calling response.json()");
        const snippetsData = await response.json();
        console.log("[BG_FETCH] Step 3a: response.json() parsed");

        console.log("[BG_FETCH] Step 4: Setting STORAGE_KEY with snippetsData");
        await chrome.storage.local.set({ [STORAGE_KEY]: snippetsData });
        console.log("[BG_FETCH] Step 4a: STORAGE_KEY set");
        // console.log( // Commented out original log, replaced by step 4a
        //     "[BackgroundJS] Snippets buscados e salvos com sucesso do GitHub."
        // );

        console.log("[BG_FETCH] Step 5: Getting ENABLED_CARE_LINES_KEY");
        const careLinesData = await chrome.storage.local.get(ENABLED_CARE_LINES_KEY); // Store the whole result
        const existingEnabledCareLines = careLinesData[ENABLED_CARE_LINES_KEY]; // Extract the specific key
        console.log("[BG_FETCH] Step 5a: ENABLED_CARE_LINES_KEY retrieved:", existingEnabledCareLines);

        let forceEnable = false;
        if (
            !existingEnabledCareLines ||
            Array.isArray(existingEnabledCareLines) ||
            (typeof existingEnabledCareLines === "object" &&
                existingEnabledCareLines === null) ||
            typeof existingEnabledCareLines !== "object"
        ) {
            console.log(
                "[BG_FETCH] forceEnable logic: existingEnabledCareLines is invalid or missing.",
                existingEnabledCareLines
            );
            forceEnable = true;
        } else {
            console.log(
                "[BG_FETCH] forceEnable logic: existingEnabledCareLines is valid.",
                existingEnabledCareLines
            );
        }

        console.log("[BG_FETCH] Step 6: Calling updateEnabledCareLinesOnSnippetsChange");
        await updateEnabledCareLinesOnSnippetsChange(snippetsData, forceEnable);
        console.log("[BG_FETCH] Step 6a: updateEnabledCareLinesOnSnippetsChange finished");

        // chrome.notifications.create call REMOVED from here
        console.log("[BackgroundJS] Sincronização Concluída (notificação removida).");
        return true;
    } catch (e) {
        console.error(
            "[BackgroundJS] Erro detalhado em fetchSnippetsAndSave (com logs granulares):",
            e
        );
        if (e && e.message) console.error("[BG_FETCH_ERROR] Message:", e.message);
        if (e && e.stack) console.error("[BG_FETCH_ERROR] Stack:", e.stack);
        // chrome.notifications.create call REMOVED from here
        console.log("[BackgroundJS] Falha na Sincronização (notificação removida).");
        return false;
    }
}

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
    console.log(`[BackgroundJS] Tab ${tabId} removed. Cleaning from ${DISABLED_TABS_KEY}.`);
    try {
        const result = await new Promise((resolve, reject) => {
            chrome.storage.session.get([DISABLED_TABS_KEY], (res) => {
                if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
                resolve(res);
            });
        });

        let disabledTabs = result[DISABLED_TABS_KEY] || [];

        if (disabledTabs.includes(tabId)) {
            const updatedDisabledTabs = disabledTabs.filter(id => id !== tabId);
            await new Promise((resolve, reject) => {
                chrome.storage.session.set({ [DISABLED_TABS_KEY]: updatedDisabledTabs }, () => {
                    if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
                    resolve();
                });
            });
            console.log(`[BackgroundJS] Tab ${tabId} removed from ${DISABLED_TABS_KEY}. New list:`, updatedDisabledTabs);
        } else {
            console.log(`[BackgroundJS] Tab ${tabId} was not in ${DISABLED_TABS_KEY}. No cleanup needed.`);
        }
    } catch (error) {
        console.error(`[BackgroundJS] Error cleaning up tab ${tabId} from ${DISABLED_TABS_KEY}:`, error.message);
    }
});

chrome.runtime.onInstalled.addListener((details) => {
    console.log(
        "[BackgroundJS - onInstalled] Extensão instalada ou atualizada:",
        details
    );

    console.log("[BackgroundJS - onInstalled] Checking chrome object:", typeof chrome);
    if (chrome) {
        console.log("[BackgroundJS - onInstalled] Checking chrome.alarms object:", typeof chrome.alarms);
    } else {
        console.log("[BackgroundJS - onInstalled] chrome object is not available.");
    }
    try {
        if (chrome.alarms) {
            chrome.alarms.create("sync-snippets", { periodInMinutes: 1440 }); // 24 hours
            console.log("[BackgroundJS - onInstalled] Alarme 'sync-snippets' criado.");
        } else {
            console.error("[BackgroundJS - onInstalled] chrome.alarms API not available.");
        }
    } catch (e) {
        console.error("[BackgroundJS - onInstalled] Error during alarm setup. Message:", e.message, "Stack:", e.stack, "Full error object:", e);
    }

    chrome.storage.local.get(SYNC_ENABLED_KEY, (result) => {
        if (chrome.runtime.lastError) {
            console.error("[BackgroundJS - onInstalled] Error reading SYNC_ENABLED_KEY:", chrome.runtime.lastError.message);
        } else if (result[SYNC_ENABLED_KEY] === undefined) {
            chrome.storage.local.set({ [SYNC_ENABLED_KEY]: false }, () => { // Changed to false
                 if (chrome.runtime.lastError) {
                    console.error("[BackgroundJS - onInstalled] Error setting default SYNC_ENABLED_KEY to false:", chrome.runtime.lastError.message);
                } else {
                    console.log(
                        "[BackgroundJS - onInstalled] Preferência de sincronização automática inicializada como false." // Updated log
                    );
                }
            });
        }
    });

    // Initialize ENABLED_CARE_LINES_KEY to an empty object if it's not already an object
    // This helps prevent the "forceEnable" logic in fetchSnippetsAndSave from triggering incorrectly
    // if the key exists but is, for example, an array from a previous version.
    chrome.storage.local.get(ENABLED_CARE_LINES_KEY, (result) => {
        if (chrome.runtime.lastError) {
            console.error("[BackgroundJS - onInstalled] Error reading ENABLED_CARE_LINES_KEY for initialization check:", chrome.runtime.lastError.message);
            fetchSnippetsAndSave(); // Attempt to fetch anyway, or handle error more gracefully
            return;
        }

        const currentVal = result[ENABLED_CARE_LINES_KEY];
        if (typeof currentVal !== 'object' || currentVal === null || Array.isArray(currentVal)) {
            console.log("[BackgroundJS - onInstalled] ENABLED_CARE_LINES_KEY is invalid or not an object. Initializing to {}. Current value:", currentVal);
            chrome.storage.local.set({ [ENABLED_CARE_LINES_KEY]: {} }, () => {
                if (chrome.runtime.lastError) {
                    console.error("[BackgroundJS - onInstalled] Error initializing ENABLED_CARE_LINES_KEY to {}:", chrome.runtime.lastError.message);
                } else {
                    console.log("[BackgroundJS - onInstalled] ENABLED_CARE_LINES_KEY inicializado como objeto vazio.");
                }
                // Whether set worked or not, proceed to fetch. The fetch function's forceEnable logic
                // will correctly handle if existingEnabledCareLines is still not ideal.
                fetchSnippetsAndSave();
            });
        } else {
            console.log("[BackgroundJS - onInstalled] ENABLED_CARE_LINES_KEY is already a valid object:", currentVal);
            fetchSnippetsAndSave(); // Call if already valid
        }
    });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "sync-snippets") {
        console.log("[BackgroundJS] Alarme 'sync-snippets' disparado.");
        await fetchSnippetsAndSave(false);
    }
});

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    console.log("[BackgroundJS] Mensagem recebida:", msg);

    if (msg.action === "manualSync") {
        fetchSnippetsAndSave(true) // Pass true for manual sync
            .then((success) => respond({ success })) // Respond with the success status
            .catch((err) => respond({ success: false, error: err.message }));
        return true; // Indicates that the response is sent asynchronously
    } else if (msg.action === "getProfessionalCategory") {
        chrome.storage.local.get(PROFESSIONAL_CATEGORY_KEY, (result) => {
            if (chrome.runtime.lastError) {
                console.error("[BackgroundJS] Error getting PROFESSIONAL_CATEGORY_KEY:", chrome.runtime.lastError.message);
                respond({ error: chrome.runtime.lastError.message });
            } else {
                respond(result[PROFESSIONAL_CATEGORY_KEY]);
            }
        });
        return true;
    } else if (msg.action === "setProfessionalCategory") {
        chrome.storage.local.set(
            { [PROFESSIONAL_CATEGORY_KEY]: msg.category },
            () => {
                if (chrome.runtime.lastError) {
                    console.error("[BackgroundJS] Error setting PROFESSIONAL_CATEGORY_KEY:", chrome.runtime.lastError.message);
                    respond({ success: false, error: chrome.runtime.lastError.message });
                } else {
                    respond({ success: true });
                }
            }
        );
        return true;
    } else if (msg.action === "getEnabledCareLines") {
        chrome.storage.local.get(ENABLED_CARE_LINES_KEY, (result) => {
            if (chrome.runtime.lastError) {
                console.error("[BackgroundJS] Error getting ENABLED_CARE_LINES_KEY:", chrome.runtime.lastError.message);
                respond({ error: chrome.runtime.lastError.message });
            } else {
                respond(result[ENABLED_CARE_LINES_KEY] || {});
            }
        });
        return true;
    } else if (msg.action === "setEnabledCareLines") {
        // This message can receive either a specific professional category update
        // or a complete replacement of the ENABLED_CARE_LINES_KEY object.
        if (msg.professionalCategory && Array.isArray(msg.careLines)) {
            // Update for a specific professional category
            console.log(
                `[BackgroundJS] setEnabledCareLines recebido para categoria: ${msg.professionalCategory}, linhas:`,
                msg.careLines
            );
            chrome.storage.local.get(ENABLED_CARE_LINES_KEY, (result) => {
                if (chrome.runtime.lastError) {
                    console.error(
                        "[BackgroundJS] Erro ao ler ENABLED_CARE_LINES_KEY para setEnabledCareLines (categoria específica):",
                        chrome.runtime.lastError.message
                    );
                    respond({
                        success: false,
                        error: chrome.runtime.lastError.message,
                    });
                    return;
                }
                let allEnabledCareLines = result[ENABLED_CARE_LINES_KEY];
                // Ensure it's a valid object; if not, initialize.
                if (
                    typeof allEnabledCareLines !== "object" ||
                    allEnabledCareLines === null ||
                    Array.isArray(allEnabledCareLines)
                ) {
                    console.warn(
                        "[BackgroundJS] allEnabledCareLines não era um objeto válido em setEnabledCareLines (categoria específica). Reiniciando."
                    );
                    allEnabledCareLines = {};
                }
                allEnabledCareLines[msg.professionalCategory] = msg.careLines;
                chrome.storage.local.set(
                    { [ENABLED_CARE_LINES_KEY]: allEnabledCareLines },
                    () => {
                        if (chrome.runtime.lastError) {
                            console.error(
                                "[BackgroundJS] Erro ao salvar enabledCareLines (por categoria):",
                                chrome.runtime.lastError.message
                            );
                            respond({
                                success: false,
                                error: chrome.runtime.lastError.message,
                            });
                        } else {
                            console.log(
                                "[BackgroundJS] EnabledCareLines (por categoria) salvas:",
                                allEnabledCareLines
                            );
                            respond({ success: true });
                        }
                    }
                );
            });
        } else if (
            typeof msg.careLines === "object" && // This is for replacing the entire object
            msg.careLines !== null &&
            !Array.isArray(msg.careLines) &&
            msg.professionalCategory === undefined // Make sure it's not the other case
        ) {
            console.log(
                "[BackgroundJS] setEnabledCareLines recebido com objeto completo:",
                msg.careLines
            );
            chrome.storage.local.set(
                { [ENABLED_CARE_LINES_KEY]: msg.careLines },
                () => {
                    if (chrome.runtime.lastError) {
                        console.error(
                            "[BackgroundJS] Erro ao salvar enabledCareLines (objeto completo):",
                            chrome.runtime.lastError.message
                        );
                        respond({
                            success: false,
                            error: chrome.runtime.lastError.message,
                        });
                    } else {
                        console.log(
                            "[BackgroundJS] EnabledCareLines (objeto completo) salvas:",
                            msg.careLines
                        );
                        respond({ success: true });
                    }
                }
            );
        } else {
            console.error(
                "[BackgroundJS] Formato inválido para setEnabledCareLines:",
                msg
            );
            respond({
                success: false,
                error: "Formato de dados inválido para setEnabledCareLines.",
            });
        }
        return true; // Indicates asynchronous response
    } else if (msg.action === "getLastSelectedCareLine") {
        // This should store last selected care line per professional category
        chrome.storage.local.get(LAST_SELECTED_CARE_LINE_KEY, (result) => {
            if (chrome.runtime.lastError) {
                console.error("[BackgroundJS] Error getting LAST_SELECTED_CARE_LINE_KEY:", chrome.runtime.lastError.message);
                respond({ error: chrome.runtime.lastError.message });
            } else {
                respond(result[LAST_SELECTED_CARE_LINE_KEY] || {});
            }
        });
        return true;
    } else if (msg.action === "setLastSelectedCareLine") {
        // Expects msg.data to be an object like { profCat: "Medicina", careLine: "Anamnese" }
        // Or, if we want to store the whole object as received from content script:
        // msg.careLine and msg.professionalCategory (from content script)
        if (msg.professionalCategory && msg.careLine) {
            chrome.storage.local.get(LAST_SELECTED_CARE_LINE_KEY, (result) => {
                if (chrome.runtime.lastError) {
                    console.error("[BackgroundJS] Error reading LAST_SELECTED_CARE_LINE_KEY for set:", chrome.runtime.lastError.message);
                    respond({ success: false, error: chrome.runtime.lastError.message });
                    return;
                }
                let currentLastSelected = result[LAST_SELECTED_CARE_LINE_KEY] || {};
                if(typeof currentLastSelected !== 'object' || currentLastSelected === null || Array.isArray(currentLastSelected)) {
                    currentLastSelected = {};
                }
                currentLastSelected[msg.professionalCategory] = msg.careLine;
                chrome.storage.local.set({ [LAST_SELECTED_CARE_LINE_KEY]: currentLastSelected }, () => {
                    if (chrome.runtime.lastError) {
                        console.error("[BackgroundJS] Error setting LAST_SELECTED_CARE_LINE_KEY:", chrome.runtime.lastError.message);
                        respond({ success: false, error: chrome.runtime.lastError.message });
                    } else {
                        respond({ success: true });
                    }
                });
            });
        } else {
            console.error("[BackgroundJS] Invalid data for setLastSelectedCareLine:", msg);
            respond({ success: false, error: "Invalid data for setLastSelectedCareLine" });
        }
        return true;
    } else if (msg.action === "getSnippetsDataForInPageMenu") {
        Promise.all([
            new Promise((resolve, reject) =>
                chrome.storage.local.get(PROFESSIONAL_CATEGORY_KEY, (r) =>
                    chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(r[PROFESSIONAL_CATEGORY_KEY])
                )
            ),
            new Promise((resolve, reject) =>
                chrome.storage.local.get(ENABLED_CARE_LINES_KEY, (r) =>
                    chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(r[ENABLED_CARE_LINES_KEY] || {})
                )
            ),
            new Promise((resolve, reject) =>
                chrome.storage.local.get(STORAGE_KEY, (r) =>
                    chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(r[STORAGE_KEY] || {})
                )
            ),
            new Promise((resolve, reject) => // For last selected care line per prof cat
                chrome.storage.local.get(LAST_SELECTED_CARE_LINE_KEY, (r) =>
                    chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(r[LAST_SELECTED_CARE_LINE_KEY] || {})
                )
            ),
        ])
            .then(
                ([
                    profCat,
                    enabledCareLinesByProfCat, // This is an object { profCat1: [...], profCat2: [...] }
                    allSnippets,
                    lastSelectedCareLineByProfCat, // This is an object { profCat1: "...", profCat2: "..." }
                ]) => {
                    if (!profCat || !allSnippets[profCat]) {
                        respond({
                            error: "Categoria profissional não definida ou snippets não encontrados para a categoria.",
                        });
                        return;
                    }
                    const enabledLinesForCurrentProfCat =
                        enabledCareLinesByProfCat[profCat] || [];
                    const snippetsForCurrentProfCat = allSnippets[profCat] || {};
                    const lastSelectedCareLineForCurrentProfCat =
                        lastSelectedCareLineByProfCat[profCat] || null;

                    respond({
                        snippetsForProfCat: snippetsForCurrentProfCat, // Snippets for the current professional category
                        enabledCareLinesForProfCat: enabledLinesForCurrentProfCat, // Enabled care lines for the current professional category
                        lastSelectedCareLineForProfCat: lastSelectedCareLineForCurrentProfCat, // Last selected care line for the current professional category
                    });
                }
            )
            .catch((error) => {
                console.error(
                    "[BackgroundScript] Erro em getSnippetsDataForInPageMenu:",
                    error.message || error
                );
                respond({ error: "Erro ao buscar dados para menu: " + (error.message || error) });
            });
        return true;
    } else if (msg.action === "getAllSnippets") {
        chrome.storage.local.get(STORAGE_KEY, (result) => {
            if (chrome.runtime.lastError) {
                console.error(
                    "[BackgroundJS] Erro em getAllSnippets:",
                    chrome.runtime.lastError.message
                );
                respond({ error: chrome.runtime.lastError.message });
            } else {
                respond(result[STORAGE_KEY] || {});
            }
        });
        return true;
    } else if (msg.action === "saveAllSnippets") {
        chrome.storage.local.set({ [STORAGE_KEY]: msg.payload }, async () => {
            if (chrome.runtime.lastError) {
                console.error(
                    "[BackgroundJS] Erro ao salvar snippets:",
                    chrome.runtime.lastError.message
                );
                respond({
                    success: false,
                    error: chrome.runtime.lastError.message,
                });
            } else {
                console.log(
                    "[BackgroundJS] Snippets salvos com sucesso via editor."
                );
                // After saving, it's crucial to update the enabled care lines based on the new snippet structure.
                // Pass false for forceEnableAll, so it respects existing choices for existing care lines.
                await updateEnabledCareLinesOnSnippetsChange(msg.payload, false);
                respond({ success: true });
            }
        });
        return true;
    } else if (msg.action === "getSnippetByCommandName") {
        const commandName = msg.command ? msg.command.toLowerCase() : null;
        if (!commandName) {
            respond({ error: "Comando inválido." });
            return true;
        }
        console.log(
            `[BackgroundJS] Recebido getSnippetByCommandName para comando: '${commandName}'`
        );

        Promise.all([
            new Promise((resolve, reject) => chrome.storage.local.get(STORAGE_KEY, r => chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(r[STORAGE_KEY] || {}))),
            new Promise((resolve, reject) => chrome.storage.local.get(PROFESSIONAL_CATEGORY_KEY, r => chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(r[PROFESSIONAL_CATEGORY_KEY]))),
            new Promise((resolve, reject) => chrome.storage.local.get(ENABLED_CARE_LINES_KEY, r => chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(r[ENABLED_CARE_LINES_KEY] || {}))),
            new Promise((resolve, reject) => chrome.storage.local.get(LAST_SELECTED_CARE_LINE_KEY, r => chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(r[LAST_SELECTED_CARE_LINE_KEY] || {}))),
        ])
            .then(
                ([
                    allSnippets,
                    profCat,
                    enabledCareLinesData,
                    lastSelectedCareLinesData,
                ]) => {
                    console.log(`[BG_CMD_SEARCH] Intentando buscar comando: '${commandName}' na Categoria Profissional: '${profCat}'`);
                    if (!profCat || !allSnippets[profCat]) {
                        console.log(`[BG_CMD_SEARCH] ERRO: Categoria Profissional '${profCat}' não definida ou sem snippets.`);
                        respond({ error: "Categoria profissional não definida ou snippets não encontrados." });
                        return;
                    }
                    const snippetsForCurrentProfCat = allSnippets[profCat];
                    let foundSnippetData = null;

                    function findCommandInCareLine(careLineName) {
                        console.log(`[BG_CMD_SEARCH]   Tentando buscar na Linha de Cuidado: '${careLineName}'`);
                        if (snippetsForCurrentProfCat && snippetsForCurrentProfCat[careLineName]) {
                            console.log(`[BG_CMD_SEARCH]     Encontrada Linha de Cuidado. Iterando ${Object.keys(snippetsForCurrentProfCat[careLineName]).length} snippets.`);
                            for (const snippetKey in snippetsForCurrentProfCat[careLineName]) {
                                const snippetData = snippetsForCurrentProfCat[careLineName][snippetKey];
                                if (typeof snippetData === "object" && snippetData !== null && typeof snippetData.command === "string") {
                                    console.log(`[BG_CMD_SEARCH]       Verificando snippet '${snippetKey}', comando: '${snippetData.command.toLowerCase()}'`);
                                    if (snippetData.command.toLowerCase() === commandName) {
                                        console.log(`[BG_CMD_SEARCH]         COMANDO ENCONTRADO!`);
                                        return snippetData;
                                    }
                                }
                            }
                            console.log(`[BG_CMD_SEARCH]     Finalizada iteração de snippets em '${careLineName}', sem correspondência nesta linha.`);
                        } else {
                            console.log(`[BG_CMD_SEARCH]     Linha de Cuidado '${careLineName}' não encontrada nos snippets para a categoria '${profCat}'.`);
                        }
                        return null;
                    }

                    const lastSelectedCareLineForCurrentProfCat = lastSelectedCareLinesData ? lastSelectedCareLinesData[profCat] : null;
                    console.log(`[BG_CMD_SEARCH] 1. Verificando linha de cuidado selecionada anteriormente: '${lastSelectedCareLineForCurrentProfCat}'`);
                    if (lastSelectedCareLineForCurrentProfCat) {
                        foundSnippetData = findCommandInCareLine(lastSelectedCareLineForCurrentProfCat);
                    }

                    if (!foundSnippetData) {
                        const enabledLinesForCurrentProfCat = enabledCareLinesData && enabledCareLinesData[profCat] ? enabledCareLinesData[profCat] : [];
                        console.log(`[BG_CMD_SEARCH] 2. Não encontrado na última selecionada. Verificando ${enabledLinesForCurrentProfCat.length} linhas de cuidado habilitadas:`, enabledLinesForCurrentProfCat);
                        for (const careLine of enabledLinesForCurrentProfCat) {
                            if (careLine === lastSelectedCareLineForCurrentProfCat) continue;
                            foundSnippetData = findCommandInCareLine(careLine);
                            if (foundSnippetData) break;
                        }
                    }

                    if (!foundSnippetData) {
                        console.log(`[BG_CMD_SEARCH] 3. Ainda sem correspondência. Verificando todas as outras linhas de cuidado na categoria '${profCat}'.`);
                        for (const careLine in snippetsForCurrentProfCat) {
                            const enabledLinesForCurrentProfCat = enabledCareLinesData && enabledCareLinesData[profCat] ? enabledCareLinesData[profCat] : [];
                            if (careLine === lastSelectedCareLineForCurrentProfCat || enabledLinesForCurrentProfCat.includes(careLine)) continue;

                            foundSnippetData = findCommandInCareLine(careLine);
                            if (foundSnippetData) break;
                        }
                    }

                    if (foundSnippetData) {
                        console.log(`[BG_CMD_SEARCH] Comando '${commandName}' finalmente ENCONTRADO. Conteúdo:`, foundSnippetData.content);
                        respond({
                            content: foundSnippetData.content,
                            richText: !!foundSnippetData.richText,
                        });
                    } else {
                        console.log(`[BG_CMD_SEARCH] Comando '${commandName}' finalmente NÃO ENCONTRADO.`);
                        respond({
                            error: "Snippet não encontrado para este comando.",
                        });
                    }
                }
            )
            .catch((error) => {
                console.error(
                    "[BackgroundJS] Erro em getSnippetByCommandName:",
                    error.message || error
                );
                respond({ error: "Erro ao buscar snippet: " + (error.message || error) });
            });
        return true;
    } else if (msg.action === "getInsertionMode") {
        chrome.storage.local.get(INSERTION_MODE_KEY, (result) => {
            if (chrome.runtime.lastError) {
                console.error("[BackgroundJS] Error getting INSERTION_MODE_KEY:", chrome.runtime.lastError.message);
                respond({ error: chrome.runtime.lastError.message });
            } else {
                respond({ mode: result[INSERTION_MODE_KEY] || "both" }); // Default to 'both'
            }
        });
        return true;
    } else if (msg.action === "setInsertionMode") {
        if (msg.mode && typeof msg.mode === "string") {
            chrome.storage.local.set({ [INSERTION_MODE_KEY]: msg.mode }, () => {
                if (chrome.runtime.lastError) {
                    console.error(
                        "[BackgroundJS] Error saving insertion mode:",
                        chrome.runtime.lastError.message
                    );
                    respond({
                        success: false,
                        error: chrome.runtime.lastError.message,
                    });
                } else {
                    console.log(
                        `[BackgroundJS] Insertion mode saved: ${msg.mode}`
                    );
                    respond({ success: true });
                }
            });
        } else {
            console.error(
                "[BackgroundJS] Invalid mode provided for setInsertionMode:",
                msg.mode
            );
            respond({ success: false, error: "Invalid mode value." });
        }
        return true;
    } else if (msg.action === "getSyncEnabled") {
        chrome.storage.local.get(SYNC_ENABLED_KEY, (result) => {
            if (chrome.runtime.lastError) {
                console.error("[BackgroundJS] Error getting SYNC_ENABLED_KEY:", chrome.runtime.lastError.message);
                respond({ error: chrome.runtime.lastError.message });
            } else {
                respond({
                    syncEnabled:
                        result[SYNC_ENABLED_KEY] !== undefined
                            ? result[SYNC_ENABLED_KEY]
                            : true, // Default to true if not set
                });
            }
        });
        return true;
    } else if (msg.action === "setSyncEnabled") {
        chrome.storage.local.set(
            { [SYNC_ENABLED_KEY]: msg.syncEnabled },
            () => {
                if (chrome.runtime.lastError) {
                    console.error(
                        "[BackgroundJS] Erro em setSyncEnabled:",
                        chrome.runtime.lastError.message
                    );
                    respond({
                        success: false,
                        error: chrome.runtime.lastError.message,
                    });
                } else {
                    console.log(
                        `[BackgroundJS] Preferência de sincronização automática definida para: ${msg.syncEnabled}`
                    );
                    respond({ success: true });
                }
            }
        );
        return true;
    } else if (msg.action === "getAllowedSites") {
        chrome.storage.local.get(ALLOWED_SITES_KEY, (result) => {
             if (chrome.runtime.lastError) {
                console.error("[BackgroundJS] Error getting ALLOWED_SITES_KEY:", chrome.runtime.lastError.message);
                respond({ error: chrome.runtime.lastError.message });
            } else {
                respond({ sites: result[ALLOWED_SITES_KEY] || [] });
            }
        });
        return true;
    } else if (msg.action === "setAllowedSites") {
        const sites = Array.isArray(msg.sites) ? msg.sites : [];
        chrome.storage.local.set({ [ALLOWED_SITES_KEY]: sites }, () => {
            if (chrome.runtime.lastError) {
                console.error(
                    "[BackgroundJS] Erro em setAllowedSites:",
                    chrome.runtime.lastError.message
                );
                respond({
                    success: false,
                    error: chrome.runtime.lastError.message,
                });
            } else {
                console.log(
                    "[BackgroundJS] Lista de sites permitidos salva:",
                    sites
                );
                respond({ success: true });
            }
        });
        return true;
    } else if (msg.action === "getTabId") {
        respond({ tabId: sender.tab.id });
        return false; // Synchronous response
    } else if (msg.action === "checkIfTabIsDisabled") {
        const tabIdToCheck = msg.tabId || (sender.tab ? sender.tab.id : null);
        if (!tabIdToCheck) {
            console.warn("[BackgroundJS] checkIfTabIsDisabled: No tabId provided and sender.tab.id is unavailable.");
            respond({ error: "Tab ID not available to check disabled state." });
            return true; // Async response
        }

        (async () => {
            try {
                const result = await new Promise((resolve, reject) => {
                    chrome.storage.session.get([DISABLED_TABS_KEY], (res) => {
                        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
                        resolve(res);
                    });
                });
                const disabledTabs = result[DISABLED_TABS_KEY] || [];
                const isDisabled = disabledTabs.includes(tabIdToCheck);
                console.log(`[BackgroundJS] checkIfTabIsDisabled: Tab ${tabIdToCheck} is ${isDisabled ? 'disabled' : 'not disabled'}. List:`, disabledTabs);
                respond({ isDisabled: isDisabled });
            } catch (error) {
                console.error(`[BackgroundJS] checkIfTabIsDisabled: Error checking storage for tab ${tabIdToCheck}:`, error.message);
                respond({ error: error.message, isDisabled: false }); // Default to not disabled on error
            }
        })(); // Immediately-invoked async function
        return true; // Indicates that the response is sent asynchronously
    }
    // Default response if no action matched.
    // respond({ error: "Ação desconhecida: " + msg.action });
    // It's better not to respond if the action isn't recognized,
    // or ensure all message handlers explicitly return true if they respond asynchronously.
    return false; // No async response planned for unhandled actions
});

// This was changed from chrome.action.onClicked to open a popup.
// If a popup is defined in manifest.json, this listener is not triggered.
// Keeping it here might be redundant or for a different purpose if the popup is removed.
/*
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
*/

chrome.commands.onCommand.addListener((command) => {
    console.log(`[BackgroundScript] Comando '${command}' recebido.`);
    if (command === "abrir-snippets") {
        // This command might be better suited to open the popup directly,
        // or trigger an action within the active tab if contextually relevant.
        // For now, it opens the full options page.
        const optionsUrl = chrome.runtime.getURL("options.html");
        chrome.tabs.query({ url: optionsUrl }, (tabs) => {
            if (chrome.runtime.lastError) {
                console.error("[BackgroundJS] Error querying tabs for command:", chrome.runtime.lastError.message);
                return;
            }
            if (tabs.length > 0) {
                chrome.tabs.update(tabs[0].id, { active: true }, () => {
                    if (chrome.runtime.lastError) console.error("[BackgroundJS] Error activating tab for command:", chrome.runtime.lastError.message);
                });
                chrome.windows.update(tabs[0].windowId, { focused: true }, () => {
                     if (chrome.runtime.lastError) console.error("[BackgroundJS] Error focusing window for command:", chrome.runtime.lastError.message);
                });
            } else {
                chrome.tabs.create({ url: optionsUrl }, () => {
                     if (chrome.runtime.lastError) console.error("[BackgroundJS] Error creating tab for command:", chrome.runtime.lastError.message);
                });
            }
        });
    }
});

async function updateEnabledCareLinesOnSnippetsChange(
    newSnippetsData,
    forceEnableAll = false // This flag is now used to enable all on first load/major change
) {
    console.log(
        "[BackgroundJS] updateEnabledCareLinesOnSnippetsChange chamado com newSnippetsData:",
        JSON.parse(JSON.stringify(newSnippetsData)), // Deep copy for logging
        "forceEnableAll:",
        forceEnableAll
    );
    try {
        const result = await chrome.storage.local.get([ENABLED_CARE_LINES_KEY]);
        if (chrome.runtime.lastError) {
            console.error(
                "[BackgroundJS] Erro ao ler ENABLED_CARE_LINES_KEY em updateEnabledCareLinesOnSnippetsChange:",
                chrome.runtime.lastError.message
            );
            return; // Exit if we can't read existing settings
        }

        let currentEnabledCareLines = result[ENABLED_CARE_LINES_KEY];

        // If currentEnabledCareLines is not a valid object (e.g. undefined, null, array from old version),
        // or if forceEnableAll is true, we should treat it as needing a fresh setup.
        if (
            forceEnableAll ||
            typeof currentEnabledCareLines !== "object" ||
            currentEnabledCareLines === null ||
            Array.isArray(currentEnabledCareLines)
        ) {
            console.warn(
                `[BackgroundJS] Forçando reavaliação completa de enabledCareLines. forceEnableAll: ${forceEnableAll}, currentInvalid: ${typeof currentEnabledCareLines !== "object" || currentEnabledCareLines === null || Array.isArray(currentEnabledCareLines)}. Original:`,
                currentEnabledCareLines
            );
            currentEnabledCareLines = {}; // Reset to build fresh
        }

        // Create a deep copy to modify and then compare for changes
        const newEnabledCareLinesState = JSON.parse(JSON.stringify(currentEnabledCareLines));
        let anyChangesMade = false;

        // Iterate over professional categories in the new snippets data
        for (const profCat in newSnippetsData) {
            if (!newSnippetsData.hasOwnProperty(profCat)) continue;

            const careLinesAvailableInSnippets = newSnippetsData[profCat]
                ? Object.keys(newSnippetsData[profCat])
                : [];

            if (forceEnableAll) {
                // If forcing enable, all available care lines for this profCat should be enabled.
                // Compare with current state for this profCat to see if an update is needed.
                const currentForProfCat = newEnabledCareLinesState[profCat] || [];
                if (JSON.stringify(currentForProfCat.sort()) !== JSON.stringify(careLinesAvailableInSnippets.sort())) {
                    newEnabledCareLinesState[profCat] = [...careLinesAvailableInSnippets];
                    console.log(`[BackgroundJS - updateEnabledCareLines] forceEnableAll: Categoria ${profCat} atualizada para habilitar todas as ${careLinesAvailableInSnippets.length} linhas.`);
                    anyChangesMade = true;
                }
            } else {
                // Not forcing enable all, so respect existing settings but prune deleted care lines.
                if (newEnabledCareLinesState[profCat] && Array.isArray(newEnabledCareLinesState[profCat])) {
                    const originalLinesForProfCat = [...newEnabledCareLinesState[profCat]];
                    newEnabledCareLinesState[profCat] = newEnabledCareLinesState[profCat].filter(cl =>
                        careLinesAvailableInSnippets.includes(cl)
                    );
                    if (JSON.stringify(originalLinesForProfCat.sort()) !== JSON.stringify(newEnabledCareLinesState[profCat].sort())) {
                        console.log(`[BackgroundJS - updateEnabledCareLines] Categoria ${profCat}: Linhas habilitadas sincronizadas. Removidas linhas inexistentes. Antes: ${originalLinesForProfCat.length}, Depois: ${newEnabledCareLinesState[profCat].length}`);
                        anyChangesMade = true;
                    }
                } else if (newEnabledCareLinesState[profCat] !== undefined) {
                    // Exists but is not an array or null, means it's invalid.
                    // If snippets exist for this category, default to enabling all its care lines.
                    // Otherwise, remove the invalid entry.
                    if (careLinesAvailableInSnippets.length > 0) {
                        newEnabledCareLinesState[profCat] = [...careLinesAvailableInSnippets];
                         console.warn(`[BackgroundJS - updateEnabledCareLines] Categoria ${profCat} tinha valor inválido, resetado para todas as ${careLinesAvailableInSnippets.length} linhas habilitadas.`);
                    } else {
                        delete newEnabledCareLinesState[profCat];
                        console.warn(`[BackgroundJS - updateEnabledCareLines] Categoria ${profCat} tinha valor inválido e não há snippets, removendo entrada.`);
                    }
                    anyChangesMade = true;
                } else if (!newEnabledCareLinesState.hasOwnProperty(profCat) && careLinesAvailableInSnippets.length > 0) {
                    // This professional category is new in snippets and wasn't in settings before.
                    // Per user request: "Quero que por padrão seja ativado todas as linhas de cuidado"
                    // So, enable all its care lines.
                    newEnabledCareLinesState[profCat] = [...careLinesAvailableInSnippets];
                    console.log(`[BackgroundJS - updateEnabledCareLines] Nova categoria ${profCat} detectada. Habilitando todas as suas ${careLinesAvailableInSnippets.length} linhas de cuidado por padrão.`);
                    anyChangesMade = true;
                }
            }
        }

        // Remove professional categories from enabled settings if they no longer exist in snippets
        for (const profCatInEnabled in newEnabledCareLinesState) {
            if (
                newEnabledCareLinesState.hasOwnProperty(profCatInEnabled) &&
                !newSnippetsData.hasOwnProperty(profCatInEnabled)
            ) {
                console.log(
                    `[BackgroundJS - updateEnabledCareLines] Removendo categoria ${profCatInEnabled} das configurações habilitadas (não existe mais nos snippets).`
                );
                delete newEnabledCareLinesState[profCatInEnabled];
                anyChangesMade = true;
            }
        }

        // If any changes were made, save the new state
        if (anyChangesMade) {
            console.log(
                "[BackgroundJS] Salvando enabledCareLines atualizadas:",
                JSON.parse(JSON.stringify(newEnabledCareLinesState)) // Log a deep copy
            );
            await chrome.storage.local.set({
                [ENABLED_CARE_LINES_KEY]: newEnabledCareLinesState,
            });
            if (chrome.runtime.lastError) {
                console.error(
                    "[BackgroundJS] Erro ao salvar ENABLED_CARE_LINES_KEY após atualização:",
                    chrome.runtime.lastError.message
                );
            }
        } else {
            console.log(
                "[BackgroundJS] Nenhuma mudança necessária em enabledCareLines após verificação."
            );
        }
    } catch (error) {
        console.error(
            "[BackgroundJS] Erro crítico em updateEnabledCareLinesOnSnippetsChange:",
            error.message || error, error.stack
        );
    }
}
// Re-commit attempt: 2024-05-01T00:00:00.000Z
