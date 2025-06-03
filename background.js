const GITHUB_RAW_URL = "https://raw.githubusercontent.com/LueAmaral/norteadoresPEP/refs/heads/main/snippets.json";
const STORAGE_KEY = "snippets";
const ENABLED_CATEGORIES_KEY = "enabledCategories";
const LAST_SELECTED_CATEGORY_KEY = "lastSelectedCategory";

const PROFESSIONAL_CATEGORY_KEY = "professionalCategory";
const ENABLED_CARE_LINES_KEY = "enabledCareLines";
const LAST_SELECTED_CARE_LINE_KEY = "lastSelectedCareLine";
const INSERTION_MODE_KEY = "insertionMode";
const SYNC_ENABLED_KEY = "syncEnabled";

async function fetchSnippetsAndSave(isManualSync = false) {
    try {
        if (!isManualSync) {
            const settings = await chrome.storage.local.get(SYNC_ENABLED_KEY);
            if (settings[SYNC_ENABLED_KEY] === false) { // Explicitly check for false
                return false;
            }
        }

        const response = await fetch(GITHUB_RAW_URL);
        if (!response.ok) {
            throw new Error(`Erro HTTP: ${response.status}`);
        }
        const snippetsData = await response.json();

        // Get existing enabled care lines before setting new snippets
        // to ensure update logic has the correct previous state if needed.
        const storageResult = await chrome.storage.local.get(ENABLED_CARE_LINES_KEY);
        const existingEnabledCareLines = storageResult[ENABLED_CARE_LINES_KEY];

        await chrome.storage.local.set({ [STORAGE_KEY]: snippetsData });

        let forceEnable = !existingEnabledCareLines ||
            Array.isArray(existingEnabledCareLines) ||
            typeof existingEnabledCareLines !== 'object' ||
            existingEnabledCareLines === null;

        await updateEnabledCareLinesOnSnippetsChange(snippetsData, forceEnable);

        chrome.notifications.create({
            type: "basic",
            iconUrl: "icon.png",
            title: "Sincronização Concluída",
            message: "Os snippets foram sincronizados com sucesso do GitHub."
        });
        return true;
    } catch (e) {
        chrome.notifications.create({
            type: "basic",
            iconUrl: "icon.png",
            title: "Falha na Sincronização",
            message: `Não foi possível sincronizar os snippets: ${e.message}`
        });
        return false;
    }
}

chrome.runtime.onInstalled.addListener(async (details) => {
    chrome.alarms.create("sync-snippets", { periodInMinutes: 1440 });

    // Initialize settings if they don't exist
    const currentSettings = await chrome.storage.local.get([SYNC_ENABLED_KEY, STORAGE_KEY, ENABLED_CARE_LINES_KEY]);
    if (currentSettings[SYNC_ENABLED_KEY] === undefined) {
        await chrome.storage.local.set({ [SYNC_ENABLED_KEY]: true });
    }

    // Initial fetch/setup of snippets and care lines
    // The logic for `needsForcedUpdateOfCareLines` seems to be related to initial setup or
    // fixing a potentially corrupted state. If `enabledCareLinesFromStorage` is not a valid object,
    // it implies a need to force enable (which `updateEnabledCareLinesOnSnippetsChange` handles via `forceEnableAll`).
    const snippetsFromStorage = currentSettings[STORAGE_KEY];
    const enabledCareLinesFromStorage = currentSettings[ENABLED_CARE_LINES_KEY];
    let needsForcedUpdateOfCareLines = !enabledCareLinesFromStorage ||
        Array.isArray(enabledCareLinesFromStorage) ||
        typeof enabledCareLinesFromStorage !== 'object' ||
        enabledCareLinesFromStorage === null;

    if (!snippetsFromStorage || needsForcedUpdateOfCareLines) {
        // Fetch only if snippets are missing or care lines need a forced update (e.g. first install)
        fetchSnippetsAndSave(false); // Pass false to respect syncEnabled setting if it exists
    }
});


chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "sync-snippets") {
        await fetchSnippetsAndSave(false);
    }
});

// Helper function for simple storage gets
async function handleStorageGet(key, defaultValue, respond) {
    try {
        const result = await chrome.storage.local.get(key);
        if (chrome.runtime.lastError) {
            throw new Error(chrome.runtime.lastError.message);
        }
        respond(result[key] === undefined ? defaultValue : result[key]);
    } catch (error) {
        respond({ error: error.message });
    }
}

// Helper function for simple storage sets
async function handleStorageSet(key, value, respond) {
    try {
        await chrome.storage.local.set({ [key]: value });
        if (chrome.runtime.lastError) {
            throw new Error(chrome.runtime.lastError.message);
        }
        respond({ success: true });
    } catch (error) {
        respond({ success: false, error: error.message });
    }
}


chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    const { action, payload } = msg;

    // Restructure to make it more manageable
    (async () => {
        try {
            if (action === "manualSync") {
                const success = await fetchSnippetsAndSave(true); // true for manual sync
                respond({ success });
            } else if (action === "getProfessionalCategory") {
                handleStorageGet(PROFESSIONAL_CATEGORY_KEY, null, respond);
            } else if (action === "setProfessionalCategory") {
                handleStorageSet(PROFESSIONAL_CATEGORY_KEY, msg.category, respond);
            } else if (action === "getEnabledCareLines") {
                handleStorageGet(ENABLED_CARE_LINES_KEY, {}, respond);
            } else if (action === "setEnabledCareLines") {
                if (msg.professionalCategory && Array.isArray(msg.careLines)) {
                    const result = await chrome.storage.local.get(ENABLED_CARE_LINES_KEY);
                    let allEnabledCareLines = result[ENABLED_CARE_LINES_KEY];
                    if (typeof allEnabledCareLines !== 'object' || allEnabledCareLines === null || Array.isArray(allEnabledCareLines)) {
                        allEnabledCareLines = {};
                    }
                    allEnabledCareLines[msg.professionalCategory] = msg.careLines;
                    await chrome.storage.local.set({ [ENABLED_CARE_LINES_KEY]: allEnabledCareLines });
                    respond({ success: true });
                } else if (typeof msg.careLines === 'object' && msg.careLines !== null && !Array.isArray(msg.careLines)) {
                    await chrome.storage.local.set({ [ENABLED_CARE_LINES_KEY]: msg.careLines });
                    respond({ success: true });
                } else {
                    throw new Error("Formato de dados inválido para setEnabledCareLines.");
                }
            } else if (action === "getLastSelectedCareLine") {
                handleStorageGet(LAST_SELECTED_CARE_LINE_KEY, {}, respond);
            } else if (action === "setLastSelectedCareLine") {
                handleStorageSet(LAST_SELECTED_CARE_LINE_KEY, msg.data, respond);
            } else if (action === "getSnippetsDataForInPageMenu") {
                const data = await chrome.storage.local.get([
                    PROFESSIONAL_CATEGORY_KEY,
                    ENABLED_CARE_LINES_KEY,
                    STORAGE_KEY,
                    LAST_SELECTED_CARE_LINE_KEY
                ]);
                const profCat = data[PROFESSIONAL_CATEGORY_KEY];
                const allSnippets = data[STORAGE_KEY] || {};
                if (!profCat || !allSnippets[profCat]) {
                    throw new Error("Categoria profissional não definida ou não encontrada.");
                }
                const enabledCareLines = data[ENABLED_CARE_LINES_KEY] || {};
                const lastSelectedCareLines = data[LAST_SELECTED_CARE_LINE_KEY] || {};

                const enabledLinesForProfCat = enabledCareLines[profCat] || [];
                const snippetsForProfCat = allSnippets[profCat] || {};
                const lastSelectedCareLineForProfCat = lastSelectedCareLines[profCat] || null;
                respond({
                    snippetsForProfCat,
                    enabledCareLinesForProfCat: enabledLinesForProfCat,
                    lastSelectedCareLineForProfCat
                });
            } else if (action === "getAllSnippets") {
                handleStorageGet(STORAGE_KEY, {}, respond);
            } else if (action === "saveAllSnippets") {
                await chrome.storage.local.set({ [STORAGE_KEY]: msg.payload });
                await updateEnabledCareLinesOnSnippetsChange(msg.payload);
                respond({ success: true });
            } else if (action === "getSnippetByCommandName") {
                const commandName = msg.command ? msg.command.toLowerCase() : null;
                if (!commandName) {
                    throw new Error("Comando inválido.");
                }
                const data = await chrome.storage.local.get([
                    STORAGE_KEY,
                    PROFESSIONAL_CATEGORY_KEY,
                    ENABLED_CARE_LINES_KEY,
                    LAST_SELECTED_CARE_LINE_KEY
                ]);

                const allSnippets = data[STORAGE_KEY] || {};
                const profCat = data[PROFESSIONAL_CATEGORY_KEY];
                const enabledCareLinesData = data[ENABLED_CARE_LINES_KEY] || {};
                const lastSelectedCareLinesData = data[LAST_SELECTED_CARE_LINE_KEY] || {};

                if (!profCat || !allSnippets[profCat]) {
                    throw new Error("Categoria profissional não definida ou snippets não encontrados.");
                }

                const snippetsForProfCat = allSnippets[profCat];
                let foundSnippetContent = null;

                const findCommand = (careLineNameToSearch) => {
                    if (snippetsForProfCat[careLineNameToSearch]) {
                        for (const snippetKey in snippetsForProfCat[careLineNameToSearch]) {
                            const snippetData = snippetsForProfCat[careLineNameToSearch][snippetKey];
                            if (typeof snippetData === 'object' && snippetData !== null && typeof snippetData.command === 'string' && snippetData.command.toLowerCase() === commandName) {
                                return snippetData.content;
                            }
                        }
                    }
                    return null;
                };

                const lastSelectedCareLine = lastSelectedCareLinesData ? lastSelectedCareLinesData[profCat] : null;
                if (lastSelectedCareLine) {
                    foundSnippetContent = findCommand(lastSelectedCareLine);
                }

                if (!foundSnippetContent) {
                    const enabledLinesForProfCat = enabledCareLinesData[profCat] || [];
                    for (const careLine of enabledLinesForProfCat) {
                        if (careLine === lastSelectedCareLine) continue;
                        foundSnippetContent = findCommand(careLine);
                        if (foundSnippetContent) break;
                    }
                }

                if (!foundSnippetContent) {
                    for (const careLine in snippetsForProfCat) {
                        if (careLine === lastSelectedCareLine) continue;
                        const enabledLinesForProfCat = enabledCareLinesData[profCat] || [];
                        if (enabledLinesForProfCat.includes(careLine)) continue;
                        foundSnippetContent = findCommand(careLine);
                        if (foundSnippetContent) break;
                    }
                }

                if (foundSnippetContent) {
                    respond({ content: foundSnippetContent });
                } else {
                    throw new Error("Snippet não encontrado para este comando.");
                }
            } else if (action === "getInsertionMode") {
                handleStorageGet(INSERTION_MODE_KEY, "both", respond);
            } else if (action === "setInsertionMode") {
                if (msg.mode && typeof msg.mode === 'string') {
                    handleStorageSet(INSERTION_MODE_KEY, msg.mode, respond);
                } else {
                    throw new Error("Invalid mode value.");
                }
            } else if (action === "getSyncEnabled") {
                handleStorageGet(SYNC_ENABLED_KEY, true, respond);
            } else if (action === "setSyncEnabled") {
                handleStorageSet(SYNC_ENABLED_KEY, msg.syncEnabled, respond);
            } else {
                respond({ error: "Ação desconhecida." });
            }
        } catch (error) {
            // Centralized error handling for async operations in the listener
            respond({ success: false, error: error.message });
        }
    })(); // Immediately invoke the async function

    return true; // Keep the message channel open for asynchronous `respond`
});

chrome.action.onClicked.addListener(tab => {
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

chrome.commands.onCommand.addListener((command) => {
    if (command === "abrir-snippets") {
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

async function updateEnabledCareLinesOnSnippetsChange(newSnippetsData, forceEnableAll = false) {
    try {
        const result = await chrome.storage.local.get([ENABLED_CARE_LINES_KEY]);
        if (chrome.runtime.lastError) {
            return;
        }

        let currentEnabledCareLines = result[ENABLED_CARE_LINES_KEY];
        if (typeof currentEnabledCareLines !== 'object' || currentEnabledCareLines === null || Array.isArray(currentEnabledCareLines)) {
            currentEnabledCareLines = {};
        }

        const newEnabledCareLines = JSON.parse(JSON.stringify(currentEnabledCareLines));
        let changed = false;

        for (const profCat in newSnippetsData) {
            if (!newSnippetsData.hasOwnProperty(profCat)) continue;

            const careLinesFromSnippets = newSnippetsData[profCat] ? Object.keys(newSnippetsData[profCat]) : [];

            if (forceEnableAll) {
                if (JSON.stringify(newEnabledCareLines[profCat]?.sort()) !== JSON.stringify(careLinesFromSnippets.sort())) {
                    newEnabledCareLines[profCat] = [...careLinesFromSnippets];
                    changed = true;
                }
            } else {
                if (newEnabledCareLines[profCat] && Array.isArray(newEnabledCareLines[profCat])) {
                    const originalProfCatLines = [...newEnabledCareLines[profCat]];
                    newEnabledCareLines[profCat] = newEnabledCareLines[profCat].filter(cl => careLinesFromSnippets.includes(cl));

                    if (JSON.stringify(originalProfCatLines.sort()) !== JSON.stringify(newEnabledCareLines[profCat].sort())) {
                        changed = true;
                    }
                } else if (newEnabledCareLines[profCat] && !Array.isArray(newEnabledCareLines[profCat])) {
                    newEnabledCareLines[profCat] = [];
                    changed = true;
                }
            }
        }

        for (const profCatInEnabled in newEnabledCareLines) {
            if (newEnabledCareLines.hasOwnProperty(profCatInEnabled) && !newSnippetsData.hasOwnProperty(profCatInEnabled)) {
                delete newEnabledCareLines[profCatInEnabled];
                changed = true;
            }
        }

        if (changed) {
            await chrome.storage.local.set({ [ENABLED_CARE_LINES_KEY]: newEnabledCareLines });
            if (chrome.runtime.lastError) {
            }
        }
    } catch (error) {
    }
}
