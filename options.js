const PROFESSIONAL_CATEGORY_KEY = "professionalCategory";
const ENABLED_CARE_LINES_KEY = "enabledCareLines";
const STORAGE_KEY = "snippets"; // Para buscar todas as categorias profissionais e linhas de cuidado
const INSERTION_MODE_KEY = "insertionMode"; // Adicionada para consistência
const SYNC_ENABLED_KEY = "syncEnabled"; // Chave para o estado da sincronização automática

document.addEventListener("DOMContentLoaded", async () => {
    const profCatSelect = document.getElementById("professionalCategorySelect");
    const careLinesContainer = document.getElementById("careLinesContainer");
    const btnSync = document.getElementById("syncBtn");
    const statusEl = document.getElementById("syncStatus");
    const openEditorBtn = document.getElementById("openEditorBtn");
    const insertionModeRadios = document.querySelectorAll("input[name='insertionMode']");
    const insertionModeStatusEl = document.getElementById("insertionModeStatus");
    const openTestPageBtn = document.getElementById("openTestPageBtn");
    const syncEnabledCheckbox = document.getElementById("syncEnabledCheckbox");
    const syncEnabledStatusEl = document.getElementById("syncEnabledStatus");

    let allSnippetsData = {}; // Para armazenar os snippets carregados do storage

    // Função para enviar mensagem ao background e retornar uma promessa
    function sendMessage(message) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    return reject(chrome.runtime.lastError);
                }
                // Verifica se a resposta indica um erro vindo do background
                if (response && response.success === false && response.error) {
                    return reject(new Error(response.error));
                }
                // Se a resposta for apenas um valor (como em getProfessionalCategory), resolve com ele.
                // Se for um objeto com {success: true}, também resolve.
                resolve(response);
            });
        });
    }

    // Carrega todas as categorias profissionais do snippets.json (via storage)
    async function loadProfessionalCategories() {
        try {
            const storage = await chrome.storage.local.get(STORAGE_KEY);
            allSnippetsData = storage[STORAGE_KEY] || {};
            const professionalCategories = Object.keys(allSnippetsData);

            profCatSelect.innerHTML = '<option value="">Selecione sua categoria...</option>';
            if (professionalCategories.length === 0) {
                profCatSelect.innerHTML = '<option value="">Nenhuma categoria encontrada no JSON</option>';
                careLinesContainer.innerHTML = "<p>Sincronize os snippets para carregar categorias e linhas de cuidado.</p>";
                return;
            }

            professionalCategories.forEach(cat => {
                const option = document.createElement("option");
                option.value = cat;
                option.textContent = cat;
                profCatSelect.appendChild(option);
            });

            const savedProfCat = await sendMessage({ action: "getProfessionalCategory" });
            if (savedProfCat && professionalCategories.includes(savedProfCat)) {
                profCatSelect.value = savedProfCat;
            }
            await loadCareLinesForSelectedProfCat(); // Carrega linhas de cuidado para a categoria selecionada

        } catch (error) {
            console.error("Erro ao carregar categorias profissionais:", error);
            statusEl.textContent = `Erro ao carregar categorias: ${error.message}`;
            profCatSelect.innerHTML = '<option value="">Erro ao carregar</option>';
        }
    }

    // Carrega e exibe as linhas de cuidado para a categoria profissional selecionada
    async function loadCareLinesForSelectedProfCat() {
        console.log("[OptionsJS] Iniciando loadCareLinesForSelectedProfCat");
        const currentProfCat = profCatSelect.value;
        careLinesContainer.innerHTML = ""; // Limpa as opções anteriores

        if (!currentProfCat) {
            console.log("[OptionsJS] Nenhuma categoria profissional selecionada.");
            careLinesContainer.textContent = "Selecione uma categoria profissional para ver as linhas de cuidado.";
            return;
        }

        if (!allSnippetsData || !allSnippetsData[currentProfCat]) {
            console.log(`[OptionsJS] Dados de snippets não encontrados para a categoria: ${currentProfCat}`);
            careLinesContainer.textContent = "Nenhuma linha de cuidado definida para esta categoria nos snippets carregados.";
            return;
        }

        const careLinesForCategory = Object.keys(allSnippetsData[currentProfCat]);
        console.log(`[OptionsJS] Linhas de cuidado para ${currentProfCat}:`, careLinesForCategory);

        const enabledCareLinesData = await sendMessage({ action: "getEnabledCareLines" });
        console.log("[OptionsJS] enabledCareLinesData recebido do background:", enabledCareLinesData);

        const enabledCareLinesForCurrentProfCat = (enabledCareLinesData && enabledCareLinesData[currentProfCat]) ? enabledCareLinesData[currentProfCat] : [];
        console.log(`[OptionsJS] Linhas de cuidado habilitadas para ${currentProfCat}:`, enabledCareLinesForCurrentProfCat);


        if (careLinesForCategory.length === 0) {
            careLinesContainer.textContent = "Nenhuma linha de cuidado cadastrada para esta categoria.";
            return;
        }

        careLinesForCategory.forEach(careLineName => {
            const checkboxId = `careLine-${currentProfCat}-${careLineName.replace(/\s+/g, '-')}`; // ID único
            const label = document.createElement("label");
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.id = checkboxId;
            checkbox.value = careLineName;
            checkbox.name = "careLine";
            
            // Verifica se a string exata está no array de habilitadas
            checkbox.checked = enabledCareLinesForCurrentProfCat.includes(careLineName);
            console.log(`[OptionsJS] Verificando ${careLineName}: Habilitado? ${checkbox.checked}`);


            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(` ${careLineName}`));
            label.style.display = "block"; // Garante que cada checkbox fique em uma nova linha
            careLinesContainer.appendChild(label);

            checkbox.addEventListener("change", updateEnabledCareLines);
        });
    }

    // Atualiza no storage as linhas de cuidado habilitadas para a categoria profissional atual
    async function updateEnabledCareLines(event) {
        const checkbox = event.target;
        const profCatForCheckbox = checkbox.dataset.profCat;

        if (!profCatForCheckbox) return;

        const checks = Array.from(careLinesContainer.querySelectorAll(`input[type=checkbox][data-prof-cat="${profCatForCheckbox}"]`));
        const enabledLines = checks.filter(c => c.checked).map(c => c.value);

        try {
            await sendMessage({
                action: "setEnabledCareLines",
                professionalCategory: profCatForCheckbox,
                careLines: enabledLines
            });
            statusEl.textContent = "Preferências de linhas de cuidado salvas.";
            setTimeout(() => statusEl.textContent = "", 2000);
        } catch (error) {
            console.error("Erro ao salvar linhas de cuidado:", error);
            statusEl.textContent = `Erro ao salvar: ${error.message}`;
        }
    }

    // --- Modo de Inserção ---
    async function loadInsertionMode() {
        console.log("[OptionsJS] Carregando modo de inserção.");
        const data = await sendMessage({ action: "getInsertionMode" });
        console.log("[OptionsJS] Modo de inserção recebido:", data);
        if (data && data.mode) {
            const currentMode = data.mode;
            insertionModeRadios.forEach(radio => {
                radio.checked = (radio.value === currentMode);
            });
        } else {
            console.warn("[OptionsJS] Modo de inserção não definido, usando padrão 'both'.");
            insertionModeRadios.forEach(radio => {
                radio.checked = (radio.value === "both");
            });
        }
    }

    async function saveInsertionMode() {
        const selectedMode = document.querySelector("input[name='insertionMode']:checked").value;
        console.log(`[OptionsJS] Salvando modo de inserção: ${selectedMode}`);
        try {
            await sendMessage({ action: "setInsertionMode", mode: selectedMode });
            insertionModeStatusEl.textContent = `Modo de inserção salvo: ${selectedMode}`;
            insertionModeStatusEl.style.color = "green";
            setTimeout(() => { insertionModeStatusEl.textContent = ""; }, 3000);
        } catch (error) {
            console.error("Erro ao salvar modo de inserção:", error);
            insertionModeStatusEl.textContent = "Erro ao salvar modo.";
            insertionModeStatusEl.style.color = "red";
        }
    }

    // --- Controle de Sincronização Automática ---
    async function loadSyncEnabledState() {
        console.log("[OptionsJS] Carregando estado da sincronização automática.");
        const data = await sendMessage({ action: "getSyncEnabled" }); // Ação a ser criada no background
        console.log("[OptionsJS] Estado da sincronização recebido:", data);
        if (data && typeof data.syncEnabled === 'boolean') {
            syncEnabledCheckbox.checked = data.syncEnabled;
        } else {
            syncEnabledCheckbox.checked = true; // Padrão para habilitado se não definido
        }
    }

    async function saveSyncEnabledState() {
        const isEnabled = syncEnabledCheckbox.checked;
        console.log(`[OptionsJS] Salvando estado da sincronização automática: ${isEnabled}`);
        await sendMessage({ action: "setSyncEnabled", syncEnabled: isEnabled }); // Ação a ser criada no background
        syncEnabledStatusEl.textContent = `Sincronização automática ${isEnabled ? "habilitada" : "desabilitada"}.`;
        setTimeout(() => syncEnabledStatusEl.textContent = "", 3000);
    }

    insertionModeRadios.forEach(radio => {
        radio.addEventListener("change", saveInsertionMode);
    });

    profCatSelect.addEventListener("change", async () => {
        const newProfCat = profCatSelect.value;
        if (newProfCat) {
            try {
                await sendMessage({ action: "setProfessionalCategory", category: newProfCat });
                statusEl.textContent = `Categoria profissional definida como: ${newProfCat}`;
                await loadCareLinesForSelectedProfCat(); // Recarrega as linhas de cuidado para a nova categoria
                setTimeout(() => statusEl.textContent = "", 2000);
            } catch (error) {
                console.error("Erro ao definir categoria profissional:", error);
                statusEl.textContent = `Erro ao salvar categoria: ${error.message}`;
            }
        } else {
            careLinesContainer.innerHTML = "<p>Selecione uma categoria profissional para ver as linhas de cuidado.</p>";
        }
    });

    btnSync.addEventListener("click", async () => {
        statusEl.textContent = "Sincronizando…";
        try {
            const response = await sendMessage({ action: "manualSync" });
            if (response && response.success) {
                statusEl.textContent = "Sincronização concluída. Recarregando configurações...";
                await loadProfessionalCategories();
                setTimeout(() => { statusEl.textContent = ""; }, 3000);
            } else {
                statusEl.textContent = "Falha na sincronização (background)." + (response.error ? ` Detalhe: ${response.error}` : "");
            }
        } catch (error) {
            console.error("Erro na sincronização manual:", error);
            statusEl.textContent = `Falha na sincronização: ${error.message}`;
        }
    });

    // --- Inicialização ---
    await loadProfessionalCategories(); // Isso agora também chama loadCareLinesForSelectedProfCat
    await loadInsertionMode();
    await loadSyncEnabledState(); // Carrega o estado da sincronização

    // Evento para o botão de abrir o editor
    if (openEditorBtn) {
        openEditorBtn.addEventListener("click", () => {
            chrome.tabs.create({ url: chrome.runtime.getURL("editor.html") });
        });
    }

    // Evento para o botão de abrir a página de teste
    if (openTestPageBtn) {
        openTestPageBtn.addEventListener("click", () => {
            chrome.tabs.create({ url: "https://pt.anotepad.com/" });
        });
    }
});
