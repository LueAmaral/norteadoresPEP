const GITHUB_RAW_URL =
    "https://raw.githubusercontent.com/LueAmaral/norteadoresPEP/refs/heads/main/snippets.json";
const STORAGE_KEY = "snippets";
const ENABLED_CATEGORIES_KEY = "enabledCategories";
const LAST_SELECTED_CATEGORY_KEY = "lastSelectedCategory";

const PROFESSIONAL_CATEGORY_KEY = "professionalCategory";
const ENABLED_CARE_LINES_KEY = "enabledCareLines";
const LAST_SELECTED_CARE_LINE_KEY = "lastSelectedCareLine";
const INSERTION_MODE_KEY = "insertionMode";
const SYNC_ENABLED_KEY = "syncEnabled";
const ALLOWED_SITES_KEY = "allowedSites";

async function fetchSnippetsAndSave(isManualSync = false) {
    console.log(
        `[BackgroundJS] Iniciando fetchSnippetsAndSave. Manual: ${isManualSync}`
    );

    if (!isManualSync) {
        const syncSettings = await chrome.storage.local.get(SYNC_ENABLED_KEY);
        const syncEnabled =
            syncSettings[SYNC_ENABLED_KEY] !== undefined
                ? syncSettings[SYNC_ENABLED_KEY]
                : true;
        if (!syncEnabled) {
            console.log(
                "[BackgroundJS] Sincronização automática desabilitada nas configurações. Abortando fetchSnippetsAndSave."
            );
            return false;
        }
    }

    try {
        const response = await fetch(GITHUB_RAW_URL);
        if (!response.ok) {
            console.error(
                `[BackgroundJS] Erro HTTP ao buscar snippets: ${response.status}`
            );
            throw new Error(`Erro HTTP: ${response.status}`);
        }
        const snippetsData = await response.json();
        await chrome.storage.local.set({ [STORAGE_KEY]: snippetsData });
        console.log(
            "[BackgroundJS] Snippets buscados e salvos com sucesso do GitHub."
        );

        const { [ENABLED_CARE_LINES_KEY]: existingEnabledCareLines } =
            await chrome.storage.local.get(ENABLED_CARE_LINES_KEY);
        let forceEnable = false;
        if (
            !existingEnabledCareLines ||
            Array.isArray(existingEnabledCareLines) ||
            (typeof existingEnabledCareLines === "object" &&
                existingEnabledCareLines === null) ||
            typeof existingEnabledCareLines !== "object"
        ) {
            console.log(
                "[BackgroundJS - fetchSnippetsAndSave] Forçando a habilitação de todas as linhas de cuidado: existingEnabledCareLines está ausente, é array, null ou não é objeto.",
                existingEnabledCareLines
            );
            forceEnable = true;
        } else {
            console.log(
                "[BackgroundJS - fetchSnippetsAndSave] existingEnabledCareLines é um objeto válido. Sincronização normal.",
                existingEnabledCareLines
            );
        }

        await updateEnabledCareLinesOnSnippetsChange(snippetsData, forceEnable);

        chrome.notifications.create({
            type: "basic",
            iconUrl: "icon.png",
            title: "Sincronização Concluída",
            message: "Os snippets foram sincronizados com sucesso do GitHub.",
        });
        return true;
    } catch (e) {
        console.error(
            "[BackgroundJS] Erro detalhado em fetchSnippetsAndSave:",
            e
        );
        chrome.notifications.create({
            type: "basic",
            iconUrl: "icon.png",
            title: "Falha na Sincronização",
            message: `Não foi possível sincronizar os snippets: ${e.message}`,
        });
        return false;
    }
}

chrome.runtime.onInstalled.addListener((details) => {
    console.log(
        "[BackgroundJS - onInstalled] Extensão instalada ou atualizada:",
        details
    );

    try {
        if (chrome.alarms) {
            chrome.alarms.create("sync-snippets", { periodInMinutes: 1440 });
            console.log("[BackgroundJS - onInstalled] Alarme 'sync-snippets' criado.");
        } else {
            console.error("[BackgroundJS - onInstalled] chrome.alarms API not available.");
        }
    } catch (e) {
        console.error("[BackgroundJS - onInstalled] Error during alarm setup:", e);
    }

    chrome.storage.local.get(SYNC_ENABLED_KEY, (result) => {
        if (result[SYNC_ENABLED_KEY] === undefined) {
            chrome.storage.local.set({ [SYNC_ENABLED_KEY]: true }, () => {
                console.log(
                    "[BackgroundJS - onInstalled] Preferência de sincronização automática inicializada como true."
                );
            });
        }
    });

    chrome.storage.local.get(
        [STORAGE_KEY, ENABLED_CARE_LINES_KEY],
        async (result) => {
            if (chrome.runtime.lastError) {
                console.error(
                    "[BackgroundJS - onInstalled] Erro ao ler storage inicial:",
                    chrome.runtime.lastError.message
                );
            } else {
                const snippetsFromStorage = result[STORAGE_KEY];
                const enabledCareLinesFromStorage =
                    result[ENABLED_CARE_LINES_KEY];
                let needsForcedUpdateOfCareLines = false;

                if (!enabledCareLinesFromStorage) {
                } else if (Array.isArray(enabledCareLinesFromStorage)) {
                } else if (
                    typeof enabledCareLinesFromStorage !== "object" ||
                    enabledCareLinesFromStorage === null
                ) {
                }

                if (
                    snippetsFromStorage &&
                    (needsForcedUpdateOfCareLines ||
                        (enabledCareLinesFromStorage &&
                            typeof enabledCareLinesFromStorage === "object" &&
                            !Array.isArray(enabledCareLinesFromStorage)))
                ) {
                } else if (!snippetsFromStorage) {
                }
            }
            fetchSnippetsAndSave();
        }
    );
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
        fetchSnippetsAndSave()
            .then(() => respond({ success: true }))
            .catch((err) => respond({ success: false, error: err.message }));
        return true;
    } else if (msg.action === "getProfessionalCategory") {
        chrome.storage.local.get(PROFESSIONAL_CATEGORY_KEY, (result) => {
            respond(result[PROFESSIONAL_CATEGORY_KEY]);
        });
        return true;
    } else if (msg.action === "setProfessionalCategory") {
        chrome.storage.local.set(
            { [PROFESSIONAL_CATEGORY_KEY]: msg.category },
            () => {
                respond({ success: true });
            }
        );
        return true;
    } else if (msg.action === "getEnabledCareLines") {
        chrome.storage.local.get(ENABLED_CARE_LINES_KEY, (result) => {
            respond(result[ENABLED_CARE_LINES_KEY] || {});
        });
        return true;
    } else if (msg.action === "setEnabledCareLines") {
        if (msg.professionalCategory && Array.isArray(msg.careLines)) {
            console.log(
                `[BackgroundJS] setEnabledCareLines recebido para categoria: ${msg.professionalCategory}, linhas:`,
                msg.careLines
            );
            chrome.storage.local.get(ENABLED_CARE_LINES_KEY, (result) => {
                if (chrome.runtime.lastError) {
                    console.error(
                        "[BackgroundJS] Erro ao ler ENABLED_CARE_LINES_KEY para setEnabledCareLines:",
                        chrome.runtime.lastError.message
                    );
                    respond({
                        success: false,
                        error: chrome.runtime.lastError.message,
                    });
                    return;
                }
                let allEnabledCareLines = result[ENABLED_CARE_LINES_KEY];
                if (
                    typeof allEnabledCareLines !== "object" ||
                    allEnabledCareLines === null ||
                    Array.isArray(allEnabledCareLines)
                ) {
                    console.warn(
                        "[BackgroundJS] allEnabledCareLines não era um objeto válido em setEnabledCareLines. Reiniciando."
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
                            return;
                        }
                        console.log(
                            "[BackgroundJS] EnabledCareLines (por categoria) salvas:",
                            allEnabledCareLines
                        );
                        respond({ success: true });
                    }
                );
            });
        } else if (
            typeof msg.careLines === "object" &&
            msg.careLines !== null &&
            !Array.isArray(msg.careLines)
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
                        return;
                    }
                    console.log(
                        "[BackgroundJS] EnabledCareLines (objeto completo) salvas:",
                        msg.careLines
                    );
                    respond({ success: true });
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
        return true;
    } else if (msg.action === "getLastSelectedCareLine") {
        chrome.storage.local.get(LAST_SELECTED_CARE_LINE_KEY, (result) => {
            respond(result[LAST_SELECTED_CARE_LINE_KEY] || {});
        });
        return true;
    } else if (msg.action === "setLastSelectedCareLine") {
        chrome.storage.local.set(
            { [LAST_SELECTED_CARE_LINE_KEY]: msg.data },
            () => {
                respond({ success: true });
            }
        );
        return true;
    } else if (msg.action === "getSnippetsDataForInPageMenu") {
        Promise.all([
            new Promise((resolve) =>
                chrome.storage.local.get(PROFESSIONAL_CATEGORY_KEY, (r) =>
                    resolve(r[PROFESSIONAL_CATEGORY_KEY])
                )
            ),
            new Promise((resolve) =>
                chrome.storage.local.get(ENABLED_CARE_LINES_KEY, (r) =>
                    resolve(r[ENABLED_CARE_LINES_KEY] || {})
                )
            ),
            new Promise((resolve) =>
                chrome.storage.local.get(STORAGE_KEY, (r) =>
                    resolve(r[STORAGE_KEY] || {})
                )
            ),
            new Promise((resolve) =>
                chrome.storage.local.get(LAST_SELECTED_CARE_LINE_KEY, (r) =>
                    resolve(r[LAST_SELECTED_CARE_LINE_KEY] || {})
                )
            ),
        ])
            .then(
                ([
                    profCat,
                    enabledCareLines,
                    allSnippets,
                    lastSelectedCareLines,
                ]) => {
                    if (!profCat || !allSnippets[profCat]) {
                        respond({
                            error: "Categoria profissional não definida ou não encontrada.",
                        });
                        return;
                    }
                    const enabledLinesForProfCat =
                        enabledCareLines[profCat] || [];
                    const snippetsForProfCat = allSnippets[profCat] || {};
                    const lastSelectedCareLineForProfCat =
                        lastSelectedCareLines[profCat] || null;
                    respond({
                        snippetsForProfCat,
                        enabledCareLinesForProfCat: enabledLinesForProfCat,
                        lastSelectedCareLineForProfCat,
                    });
                }
            )
            .catch((error) => {
                console.error(
                    "[BackgroundScript] Erro em getSnippetsDataForInPageMenu:",
                    error
                );
                respond({ error: error.message });
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
                return;
            }
            respond(result[STORAGE_KEY] || {});
        });
        return true;
    } else if (msg.action === "saveAllSnippets") {
        chrome.storage.local.set({ [STORAGE_KEY]: msg.payload }, () => {
            if (chrome.runtime.lastError) {
                console.error(
                    "[BackgroundJS] Erro ao salvar snippets:",
                    chrome.runtime.lastError.message
                );
                respond({
                    success: false,
                    error: chrome.runtime.lastError.message,
                });
                return;
            }
            console.log(
                "[BackgroundJS] Snippets salvos com sucesso via editor."
            );
            respond({ success: true });
            updateEnabledCareLinesOnSnippetsChange(msg.payload);
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
            new Promise((resolve) =>
                chrome.storage.local.get(STORAGE_KEY, (r) =>
                    resolve(r[STORAGE_KEY] || {})
                )
            ),
            new Promise((resolve) =>
                chrome.storage.local.get(PROFESSIONAL_CATEGORY_KEY, (r) =>
                    resolve(r[PROFESSIONAL_CATEGORY_KEY])
                )
            ),
            new Promise((resolve) =>
                chrome.storage.local.get(ENABLED_CARE_LINES_KEY, (r) =>
                    resolve(r[ENABLED_CARE_LINES_KEY] || {})
                )
            ),
            new Promise((resolve) =>
                chrome.storage.local.get(LAST_SELECTED_CARE_LINE_KEY, (r) =>
                    resolve(r[LAST_SELECTED_CARE_LINE_KEY] || {})
                )
            ),
        ])
            .then(
                ([
                    allSnippets,
                    profCat,
                    enabledCareLinesData,
                    lastSelectedCareLinesData,
                ]) => {
                    if (!profCat || !allSnippets[profCat]) {
                        console.log(
                            "[BackgroundJS] Categoria profissional não definida ou snippets não encontrados para a categoria."
                        );
                        respond({
                            error: "Categoria profissional não definida ou snippets não encontrados.",
                        });
                        return;
                    }

                    const snippetsForProfCat = allSnippets[profCat];
                    let foundSnippet = null;

                    function findCommand(careLineName) {
                        if (snippetsForProfCat[careLineName]) {
                            for (const snippetKey in snippetsForProfCat[
                                careLineName
                            ]) {
                                const snippetData =
                                    snippetsForProfCat[careLineName][
                                        snippetKey
                                    ];
                                if (
                                    typeof snippetData === "object" &&
                                    snippetData !== null &&
                                    typeof snippetData.command === "string" &&
                                    snippetData.command.toLowerCase() ===
                                        commandName
                                ) {
                                    return snippetData;
                                }
                            }
                        }
                        return null;
                    }

                    const lastSelectedCareLine = lastSelectedCareLinesData
                        ? lastSelectedCareLinesData[profCat]
                        : null;
                    if (lastSelectedCareLine) {
                        foundSnippet = findCommand(lastSelectedCareLine);
                    }

                    if (!foundSnippet) {
                        const enabledLinesForProfCat =
                            enabledCareLinesData &&
                            enabledCareLinesData[profCat]
                                ? enabledCareLinesData[profCat]
                                : [];
                        for (const careLine of enabledLinesForProfCat) {
                            if (careLine === lastSelectedCareLine) continue;
                            foundSnippet = findCommand(careLine);
                            if (foundSnippet) break;
                        }
                    }

                    if (!foundSnippet) {
                        for (const careLine in snippetsForProfCat) {
                            if (careLine === lastSelectedCareLine) continue;
                            const enabledLinesForProfCat =
                                enabledCareLinesData &&
                                enabledCareLinesData[profCat]
                                    ? enabledCareLinesData[profCat]
                                    : [];
                            if (enabledLinesForProfCat.includes(careLine))
                                continue;

                            foundSnippet = findCommand(careLine);
                            if (foundSnippet) break;
                        }
                    }

                    if (foundSnippet) {
                        console.log(
                            `[BackgroundJS] Snippet encontrado para o comando '${commandName}'.`
                        );
                        respond({
                            content: foundSnippet.content,
                            richText: !!foundSnippet.richText,
                        });
                    } else {
                        console.log(
                            `[BackgroundJS] Snippet não encontrado para o comando '${commandName}'.`
                        );
                        respond({
                            error: "Snippet não encontrado para este comando.",
                        });
                    }
                }
            )
            .catch((error) => {
                console.error(
                    "[BackgroundJS] Erro em getSnippetByCommandName:",
                    error
                );
                respond({ error: "Erro ao buscar snippet: " + error.message });
            });
        return true;
    } else if (msg.action === "getInsertionMode") {
        chrome.storage.local.get(INSERTION_MODE_KEY, (result) => {
            if (chrome.runtime.lastError) {
                console.error(
                    "[BackgroundJS] Erro em getInsertionMode:",
                    chrome.runtime.lastError.message
                );
                respond({ error: chrome.runtime.lastError.message });
                return;
            }
            respond({ mode: result[INSERTION_MODE_KEY] || "both" });
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
            return true;
        } else {
            console.error(
                "[BackgroundJS] Invalid mode provided for setInsertionMode:",
                msg.mode
            );
            respond({ success: false, error: "Invalid mode value." });
        }
    } else if (msg.action === "getSyncEnabled") {
        chrome.storage.local.get(SYNC_ENABLED_KEY, (result) => {
            if (chrome.runtime.lastError) {
                console.error(
                    "[BackgroundJS] Erro em getSyncEnabled:",
                    chrome.runtime.lastError.message
                );
                respond({ error: chrome.runtime.lastError.message });
                return;
            }
            respond({
                syncEnabled:
                    result[SYNC_ENABLED_KEY] !== undefined
                        ? result[SYNC_ENABLED_KEY]
                        : true,
            });
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
                    return;
                }
                console.log(
                    `[BackgroundJS] Preferência de sincronização automática definida para: ${msg.syncEnabled}`
                );
                respond({ success: true });
            }
        );
        return true;
    } else if (msg.action === "getAllowedSites") {
        chrome.storage.local.get(ALLOWED_SITES_KEY, (result) => {
            respond({ sites: result[ALLOWED_SITES_KEY] || [] });
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
                return;
            }
            console.log(
                "[BackgroundJS] Lista de sites permitidos salva:",
                sites
            );
            respond({ success: true });
        });
        return true;
    }
});

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

chrome.commands.onCommand.addListener((command) => {
    console.log(`[BackgroundScript] Comando '${command}' recebido.`);
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

async function updateEnabledCareLinesOnSnippetsChange(
    newSnippetsData,
    forceEnableAll = false
) {
    console.log(
        "[BackgroundJS] updateEnabledCareLinesOnSnippetsChange chamado com newSnippetsData:",
        JSON.parse(JSON.stringify(newSnippetsData)),
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
            return;
        }

        let currentEnabledCareLines = result[ENABLED_CARE_LINES_KEY];
        if (
            typeof currentEnabledCareLines !== "object" ||
            currentEnabledCareLines === null ||
            Array.isArray(currentEnabledCareLines)
        ) {
            console.warn(
                "[BackgroundJS] currentEnabledCareLines não era um objeto válido. Reiniciando para {}. Original:",
                currentEnabledCareLines
            );
            currentEnabledCareLines = {};
        }

        const newEnabledCareLines = JSON.parse(
            JSON.stringify(currentEnabledCareLines)
        );
        let changed = false;

        for (const profCat in newSnippetsData) {
            if (!newSnippetsData.hasOwnProperty(profCat)) continue;

            const careLinesFromSnippets = newSnippetsData[profCat]
                ? Object.keys(newSnippetsData[profCat])
                : [];

            if (forceEnableAll) {
                if (
                    JSON.stringify(newEnabledCareLines[profCat]?.sort()) !==
                    JSON.stringify(careLinesFromSnippets.sort())
                ) {
                    console.log(
                        `[BackgroundJS] forceEnableAll: Atualizando ${profCat} de ${JSON.stringify(
                            newEnabledCareLines[profCat]
                        )} para: ${JSON.stringify(careLinesFromSnippets)}`
                    );
                    newEnabledCareLines[profCat] = [...careLinesFromSnippets];
                    changed = true;
                }
            } else {
                if (
                    newEnabledCareLines[profCat] &&
                    Array.isArray(newEnabledCareLines[profCat])
                ) {
                    const originalProfCatLines = [
                        ...newEnabledCareLines[profCat],
                    ];
                    newEnabledCareLines[profCat] = newEnabledCareLines[
                        profCat
                    ].filter((cl) => careLinesFromSnippets.includes(cl));

                    if (
                        JSON.stringify(originalProfCatLines.sort()) !==
                        JSON.stringify(newEnabledCareLines[profCat].sort())
                    ) {
                        console.log(
                            `[BackgroundJS] Sincronização: Atualizando ${profCat}. Linhas habilitadas filtradas para existir nos snippets. Antes: ${JSON.stringify(
                                originalProfCatLines
                            )}, Depois: ${JSON.stringify(
                                newEnabledCareLines[profCat]
                            )}`
                        );
                        changed = true;
                    }
                } else if (
                    newEnabledCareLines[profCat] &&
                    !Array.isArray(newEnabledCareLines[profCat])
                ) {
                    console.warn(
                        `[BackgroundJS] Linhas habilitadas para ${profCat} não eram um array. Resetando para []. Original: ${JSON.stringify(
                            newEnabledCareLines[profCat]
                        )}`
                    );
                    newEnabledCareLines[profCat] = [];
                    changed = true;
                }
            }
        }

        for (const profCatInEnabled in newEnabledCareLines) {
            if (
                newEnabledCareLines.hasOwnProperty(profCatInEnabled) &&
                !newSnippetsData.hasOwnProperty(profCatInEnabled)
            ) {
                console.log(
                    `[BackgroundJS] Removendo categoria profissional ${profCatInEnabled} de enabledCareLines pois não existe mais nos snippets.`
                );
                delete newEnabledCareLines[profCatInEnabled];
                changed = true;
            }
        }

        if (changed) {
            console.log(
                "[BackgroundJS] Salvando enabledCareLines atualizadas:",
                JSON.parse(JSON.stringify(newEnabledCareLines))
            );
            await chrome.storage.local.set({
                [ENABLED_CARE_LINES_KEY]: newEnabledCareLines,
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
            error
        );
    }
}
