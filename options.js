const PROFESSIONAL_CATEGORY_KEY = "professionalCategory";
const ENABLED_CARE_LINES_KEY = "enabledCareLines";
const STORAGE_KEY = "snippets";
const INSERTION_MODE_KEY = "insertionMode";
const SYNC_ENABLED_KEY = "syncEnabled";

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

    let allSnippetsData = {};

    // --- Helper Functions ---
    function createOptionElement(value, text, disabled = false) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        option.disabled = disabled;
        return option;
    }

    function createCareLineCheckbox(careLineName, profCat, isChecked, changeListener) {
        const checkboxId = `careLine-${profCat}-${careLineName.replace(/\s+/g, '-')}`;
        const label = document.createElement("label");
        const checkbox = document.createElement("input");

        checkbox.type = "checkbox";
        checkbox.id = checkboxId;
        checkbox.value = careLineName;
        checkbox.name = "careLine"; // Group checkboxes for easier querying if needed
        checkbox.dataset.profCat = profCat;
        checkbox.checked = isChecked;
        checkbox.addEventListener("change", changeListener);

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(` ${careLineName}`));
        label.style.display = "block"; // Keep basic styling or move to CSS if more complex
        return label;
    }

    async function showStatusMessage(element, message, isError = false, duration = 3000) {
        element.textContent = message;
        element.style.color = isError ? "red" : "crimson"; // Use a more visible red
        if (duration > 0) {
            await new Promise(resolve => setTimeout(resolve, duration));
            if (element.textContent === message) { // Clear only if message hasn't changed
                element.textContent = "";
            }
        }
    }

    // sendMessage remains the same as it's already Promise-based and handles errors well.
    function sendMessage(message) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    return reject(new Error(chrome.runtime.lastError.message));
                }
                if (response && response.success === false && response.error) {
                    return reject(new Error(response.error));
                }
                resolve(response);
            });
        });
    }

    async function loadProfessionalCategories() {
        try {
            // Fetch all snippets and current professional category in one go
            const data = await chrome.storage.local.get([STORAGE_KEY, PROFESSIONAL_CATEGORY_KEY]);
            allSnippetsData = data[STORAGE_KEY] || {};
            const savedProfCat = data[PROFESSIONAL_CATEGORY_KEY];

            const professionalCategories = Object.keys(allSnippetsData);

            profCatSelect.innerHTML = ""; // Clear existing options
            profCatSelect.appendChild(createOptionElement("", "Selecione sua categoria..."));

            if (professionalCategories.length === 0) {
                profCatSelect.appendChild(createOptionElement("", "Nenhuma categoria no JSON", true));
                careLinesContainer.innerHTML = "<p>Sincronize ou adicione snippets via editor para carregar categorias.</p>";
                return;
            }

            professionalCategories.forEach(cat => profCatSelect.appendChild(createOptionElement(cat, cat)));

            if (savedProfCat && professionalCategories.includes(savedProfCat)) {
                profCatSelect.value = savedProfCat;
            } else if (professionalCategories.length > 0) {
                // Optionally select the first category if none is saved
                // profCatSelect.value = professionalCategories[0];
                // await sendMessage({ action: "setProfessionalCategory", category: professionalCategories[0] });
            }
            await loadCareLinesForSelectedProfCat();
        } catch (error) {
            console.error("Erro ao carregar categorias profissionais:", error);
            await showStatusMessage(statusEl, `Erro ao carregar categorias: ${error.message}`, true, 0);
            profCatSelect.innerHTML = "";
            profCatSelect.appendChild(createOptionElement("", "Erro ao carregar", true));
        }
    }

    async function loadCareLinesForSelectedProfCat() {
        const currentProfCat = profCatSelect.value;
        const currentProfCat = profCatSelect.value;
        careLinesContainer.innerHTML = ""; // Clear previous checkboxes

        if (!currentProfCat) {
            careLinesContainer.innerHTML = "<p>Selecione uma categoria profissional para ver as linhas de cuidado.</p>";
            return;
        }
        if (!allSnippetsData[currentProfCat]) {
            careLinesContainer.innerHTML = "<p>Nenhuma linha de cuidado definida para esta categoria nos snippets.</p>";
            return;
        }

        const careLinesInSnippets = Object.keys(allSnippetsData[currentProfCat]);
        if (careLinesInSnippets.length === 0) {
            careLinesContainer.innerHTML = "<p>Nenhuma linha de cuidado cadastrada para esta categoria.</p>";
            return;
        }

        try {
            const enabledCareLinesData = await sendMessage({ action: "getEnabledCareLines" });
            const enabledCareLinesForCurrentProfCat = (enabledCareLinesData && enabledCareLinesData[currentProfCat]) ? enabledCareLinesData[currentProfCat] : [];

            careLinesInSnippets.forEach(careLineName => {
                const isChecked = enabledCareLinesForCurrentProfCat.includes(careLineName);
                const checkboxLabel = createCareLineCheckbox(careLineName, currentProfCat, isChecked, updateEnabledCareLines);
                careLinesContainer.appendChild(checkboxLabel);
            });
        } catch (error) {
            console.error("Erro ao carregar linhas de cuidado habilitadas:", error);
            await showStatusMessage(statusEl, `Erro ao carregar linhas de cuidado: ${error.message}`, true, 0);
        }
    }

    async function updateEnabledCareLines(event) {
        const checkbox = event.target;
        const profCatForCheckbox = checkbox.dataset.profCat; // Get profCat from the checkbox dataset

        // Ensure the checkbox's category matches the currently selected one to avoid race conditions
        // or saving for a category that is not currently displayed/selected.
        if (!profCatForCheckbox || profCatForCheckbox !== profCatSelect.value) {
            console.warn("Checkbox category mismatch or missing. Aborting update.");
            return;
        }

        const allCheckboxes = careLinesContainer.querySelectorAll('input[type="checkbox"][name="careLine"]');
        const enabledLines = Array.from(allCheckboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);

        try {
            await sendMessage({
                action: "setEnabledCareLines",
                professionalCategory: profCatForCheckbox, // Use the category from the checkbox
                careLines: enabledLines
            });
            await showStatusMessage(statusEl, "Preferências de linhas de cuidado salvas.", false, 2000);
        } catch (error) {
            console.error("Erro ao salvar linhas de cuidado:", error);
            await showStatusMessage(statusEl, `Erro ao salvar linhas de cuidado: ${error.message}`, true, 5000);
        }
    }

    async function loadInsertionMode() {
        try {
            const data = await sendMessage({ action: "getInsertionMode" });
            const currentMode = (data && data.mode) ? data.mode : "both"; // Default to "both"
            insertionModeRadios.forEach(radio => {
                radio.checked = (radio.value === currentMode);
            });
        } catch (error) {
            console.error("Erro ao carregar modo de inserção:", error);
            await showStatusMessage(insertionModeStatusEl, "Erro ao carregar modo.", true, 5000);
        }
    }

    async function saveInsertionMode() {
        const selectedMode = document.querySelector("input[name='insertionMode']:checked").value;
        try {
            await sendMessage({ action: "setInsertionMode", mode: selectedMode });
            await showStatusMessage(insertionModeStatusEl, `Modo de inserção salvo: ${selectedMode}`, false, 3000);
        } catch (error) {
            console.error("Erro ao salvar modo de inserção:", error);
            await showStatusMessage(insertionModeStatusEl, "Erro ao salvar modo.", true, 5000);
        }
    }

    async function loadSyncEnabledState() {
        try {
            const data = await sendMessage({ action: "getSyncEnabled" });
            syncEnabledCheckbox.checked = (data && typeof data.syncEnabled === 'boolean') ? data.syncEnabled : true; // Default to true
        } catch (error) {
            console.error("Erro ao carregar estado de sincronização:", error);
            await showStatusMessage(syncEnabledStatusEl, "Erro ao carregar config de sincronia.", true, 5000);
            syncEnabledCheckbox.checked = true; // Default on error
        }
    }

    async function saveSyncEnabledState() {
        const isEnabled = syncEnabledCheckbox.checked;
        try {
            await sendMessage({ action: "setSyncEnabled", syncEnabled: isEnabled });
            await showStatusMessage(syncEnabledStatusEl, `Sincronização automática ${isEnabled ? "habilitada" : "desabilitada"}.`, false, 3000);
        } catch (error) {
            console.error("Erro ao salvar estado de sincronização:", error);
            await showStatusMessage(syncEnabledStatusEl, "Erro ao salvar config de sincronia.", true, 5000);
        }
    }

    insertionModeRadios.forEach(radio => {
        radio.addEventListener("change", saveInsertionMode);
    });

    // --- Event Listeners Setup ---
    if (profCatSelect) {
        profCatSelect.addEventListener("change", async () => {
            const newProfCat = profCatSelect.value;
            if (newProfCat) {
                try {
                    await sendMessage({ action: "setProfessionalCategory", category: newProfCat });
                    await showStatusMessage(statusEl, `Categoria profissional definida: ${newProfCat}`, false, 2000);
                    await loadCareLinesForSelectedProfCat(); // Reload care lines for the new category
                } catch (error) {
                    console.error("Erro ao definir categoria profissional:", error);
                    await showStatusMessage(statusEl, `Erro ao salvar categoria: ${error.message}`, true, 5000);
                }
            } else {
                // No professional category selected, clear care lines
                careLinesContainer.innerHTML = "<p>Selecione uma categoria profissional para ver as linhas de cuidado.</p>";
            }
        });
    }

    if (btnSync) {
        btnSync.addEventListener("click", async () => {
            await showStatusMessage(statusEl, "Sincronizando…", false, 0); // Persistent while syncing
            try {
                const response = await sendMessage({ action: "manualSync" }); // Assuming manualSync returns {success: true/false, error?: string}
                if (response && response.success) {
                    await showStatusMessage(statusEl, "Sincronização concluída. Recarregando...", false, 2000);
                    await loadProfessionalCategories(); // This will also trigger loading care lines
                } else {
                    throw new Error(response.error || "Falha na sincronização (resposta do background).");
                }
            } catch (error) {
                console.error("Erro na sincronização manual:", error);
                await showStatusMessage(statusEl, `Falha na sincronização: ${error.message}`, true, 5000);
            }
        });
    }

    insertionModeRadios.forEach(radio => radio.addEventListener("change", saveInsertionMode));
    if (syncEnabledCheckbox) syncEnabledCheckbox.addEventListener("change", saveSyncEnabledState);
    if (openEditorBtn) openEditorBtn.addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("editor.html") }));
    if (openTestPageBtn) openTestPageBtn.addEventListener("click", () => chrome.tabs.create({ url: "https://pt.anotepad.com/" }));

    // --- Initial Load ---
    try {
        await loadProfessionalCategories(); // This will also call loadCareLinesForSelectedProfCat
        await loadInsertionMode();
        await loadSyncEnabledState();
    } catch (error) {
        // Errors from initial load functions should be caught and displayed by them.
        // This is a final catch-all if something else goes wrong during setup.
        console.error("Erro na inicialização da página de opções:", error);
        await showStatusMessage(statusEl, "Erro crítico ao carregar a página.", true, 0);
    }
});
