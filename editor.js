document.addEventListener("DOMContentLoaded", () => {
    const snippetsTreeView = document.getElementById("snippetsTreeView");
    const snippetsTreeViewLoading = document.getElementById("snippetsTreeViewLoading");
    const editSnippetForm = document.getElementById("editSnippetForm");
    const formFieldsContainer = document.getElementById("formFieldsContainer");
    const noSnippetSelectedMessage = document.getElementById("noSnippetSelectedMessage");

    const editProfCatSelect = document.getElementById("editProfCatSelect");
    const editNewProfCatInput = document.getElementById("editNewProfCatInput");
    const editCareLineSelect = document.getElementById("editCareLineSelect");
    const editNewCareLineInput = document.getElementById("editNewCareLineInput");
    const editSnippetTypeInput = document.getElementById("editSnippetType");
    const editSnippetCommandInput = document.getElementById("editSnippetCommand");
    const editSnippetContentInput = document.getElementById("editSnippetContent");

    const btnSaveSnippet = document.getElementById("btnSaveSnippet");
    const btnDeleteSnippet = document.getElementById("btnDeleteSnippet");
    const btnClearForm = document.getElementById("btnClearForm");
    const btnExportJson = document.getElementById("btnExportJson");
    const btnImportJson = document.getElementById("btnImportJson");
    const fileImportJson = document.getElementById("fileImportJson");
    const editorStatusEl = document.getElementById("editorStatus");

    let currentSnippets = {};
    let selectedItemPath = null;
    let treeState = {};
    const ADD_NEW_VALUE = "__add_new__";
    const STORAGE_KEY = "snippets";

    // --- Helper Functions ---
    function createOptionElement(value, text, disabled = false) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        option.disabled = disabled;
        return option;
    }

    function createTreeElement(text, path, itemClasses = [], clickListener = null, isExpanded = false) {
        const itemDiv = document.createElement("div");
        const itemSpan = document.createElement("span");
        itemSpan.textContent = (isExpanded ? "▼ " : "► ") + text;
        itemSpan.classList.add("tree-item", ...itemClasses);
        itemSpan.dataset.path = path;
        if (clickListener) {
            itemSpan.addEventListener("click", clickListener);
        }
        itemDiv.appendChild(itemSpan);
        return itemDiv;
    }

    function toggleInputVisibility(selectElement, inputElement, conditionValue) {
        const shouldShow = selectElement.value === conditionValue;
        inputElement.style.display = shouldShow ? "block" : "none";
        if (shouldShow) inputElement.focus();
        else inputElement.value = ""; // Clear value when hiding
    }

    async function showEditorStatus(message, isError = false, duration = 3000) {
        if (editorStatusEl) {
            editorStatusEl.textContent = message;
            editorStatusEl.style.color = isError ? "red" : "green";
            if (duration > 0) {
                await new Promise(resolve => setTimeout(resolve, duration));
                if (editorStatusEl.textContent === message) { // Check if message hasn't changed
                    editorStatusEl.textContent = "";
                }
            }
        }
    }

    async function sendMessage(message) {
        // No change needed here, already returns a Promise
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    return reject(chrome.runtime.lastError);
                }
                resolve(response);
            });
        });
    }

    async function loadSnippets() {
        if (snippetsTreeViewLoading) snippetsTreeViewLoading.style.display = "block";
        if (snippetsTreeView) snippetsTreeView.innerHTML = "";
        try {
            currentSnippets = await sendMessage({ action: "getAllSnippets" }) || {};
        } catch (error) {
            if (snippetsTreeView) snippetsTreeView.innerHTML = "<p>Erro ao carregar snippets. Verifique o console para mais detalhes.</p>";
            throw error; // Re-throw to be caught by caller if necessary
        } finally {
            if (snippetsTreeViewLoading) snippetsTreeViewLoading.style.display = "none";
        }
    }

    function handleFormDisplay(itemSelected = false) {
        if (itemSelected) {
            if (formFieldsContainer) formFieldsContainer.classList.remove("hidden");
            if (noSnippetSelectedMessage) noSnippetSelectedMessage.classList.add("hidden");
        } else {
            if (formFieldsContainer) formFieldsContainer.classList.add("hidden");
            if (noSnippetSelectedMessage) noSnippetSelectedMessage.classList.remove("hidden");
        }
    }

    function renderTreeView() {
        if (!snippetsTreeView) {
            return;
        }
        snippetsTreeView.innerHTML = ""; // Clear existing tree

        if (Object.keys(currentSnippets).length === 0) {
            snippetsTreeView.innerHTML = "<p>Nenhum snippet definido. Adicione um novo usando o formulário.</p>";
            populateProfCatSelect(); // Still populate selects for adding new
            return;
        }

        Object.entries(currentSnippets).forEach(([profCat, careLines]) => {
            const isProfCatExpanded = treeState[profCat] && treeState[profCat].expanded;
            const profCatElement = createTreeElement(
                profCat,
                profCat,
                ["tree-category"],
                () => toggleNode(profCat),
                isProfCatExpanded
            );
            profCatElement.style.fontWeight = "bold"; // Specific style for category
            snippetsTreeView.appendChild(profCatElement);

            if (isProfCatExpanded) {
                const careLinesContainer = document.createElement("div");
                careLinesContainer.style.paddingLeft = "20px";
                Object.entries(careLines).forEach(([careLineName, snippets]) => {
                    const careLinePath = `${profCat}/${careLineName}`;
                    const isCareLineExpanded = treeState[careLinePath] && treeState[careLinePath].expanded;
                    const careLineElement = createTreeElement(
                        careLineName,
                        careLinePath,
                        ["tree-careline"],
                        () => toggleNode(careLinePath),
                        isCareLineExpanded
                    );
                    careLinesContainer.appendChild(careLineElement);

                    if (isCareLineExpanded) {
                        const snippetsContainer = document.createElement("div");
                        snippetsContainer.style.paddingLeft = "20px";
                        Object.keys(snippets).forEach(snippetName => {
                            const snippetPath = `${careLinePath}/${snippetName}`;
                            const snippetElement = createTreeElement(
                                snippetName,
                                snippetPath,
                                ["tree-snippet"],
                                (e) => selectItem(e.target.dataset.path)
                            );
                            // For snippet items, we don't need an expansion icon, so modify the helper's output
                            snippetElement.firstChild.textContent = snippetName; // Remove icon
                            snippetsContainer.appendChild(snippetElement);
                        });
                        careLineElement.appendChild(snippetsContainer);
                    }
                });
                profCatElement.appendChild(careLinesContainer);
            }
        });

        // Highlight selected item after re-rendering
        if (selectedItemPath) {
            const selectedElement = snippetsTreeView.querySelector(`.tree-item[data-path="${selectedItemPath}"]`);
            if (selectedElement) {
                selectedElement.classList.add("selected-item");
            }
        }
    }

    function toggleNode(path) {
        if (!treeState[path]) treeState[path] = { expanded: false };
        treeState[path].expanded = !treeState[path].expanded;
        renderTreeView();
    }

    function selectItem(path) {
        selectedItemPath = path;
        document.querySelectorAll(".tree-item.selected-item").forEach(el => el.classList.remove("selected-item"));
        const selectedElement = document.querySelector(`.tree-item[data-path="${path}"]`);
        if (selectedElement) {
            selectedElement.classList.add("selected-item");
        }
        populateFormWithSnippetDetails(path);
        handleFormDisplay(true);
        if (btnDeleteSnippet) btnDeleteSnippet.classList.remove("hidden");
    }

    function populateProfCatSelect(selectedValue) {
        if (!editProfCatSelect) return;
        const previousValue = selectedValue || editProfCatSelect.value; // Preserve current selection if valid
        editProfCatSelect.innerHTML = ""; // Clear existing options
        editProfCatSelect.appendChild(createOptionElement("", "Selecione uma Categoria"));

        const categories = Object.keys(currentSnippets);
        categories.forEach(cat => editProfCatSelect.appendChild(createOptionElement(cat, cat)));
        editProfCatSelect.appendChild(createOptionElement(ADD_NEW_VALUE, "--- Adicionar Nova Categoria ---"));

        if (previousValue && (categories.includes(previousValue) || previousValue === ADD_NEW_VALUE)) {
            editProfCatSelect.value = previousValue;
        } else if (categories.length > 0 && !selectedValue) { // Default to first if nothing specific selected
             // editProfCatSelect.value = categories[0]; // Optionally default to first
        }
        handleProfCatChange(); // Update dependent UI
    }

    function populateCareLineSelect(profCat, selectedValue) {
        if (!editCareLineSelect) return;
        const previousValue = selectedValue || editCareLineSelect.value;
        editCareLineSelect.innerHTML = "";
        editCareLineSelect.appendChild(createOptionElement("", "Selecione uma Linha de Cuidado"));
        editCareLineSelect.disabled = !profCat || profCat === ADD_NEW_VALUE;

        if (profCat && profCat !== ADD_NEW_VALUE && currentSnippets[profCat]) {
            const careLines = Object.keys(currentSnippets[profCat]);
            careLines.forEach(cl => editCareLineSelect.appendChild(createOptionElement(cl, cl)));
        }
        editCareLineSelect.appendChild(createOptionElement(ADD_NEW_VALUE, "--- Adicionar Nova Linha de Cuidado ---"));

        if (profCat && profCat !== ADD_NEW_VALUE && currentSnippets[profCat] && previousValue &&
            (Object.keys(currentSnippets[profCat]).includes(previousValue) || previousValue === ADD_NEW_VALUE)) {
            editCareLineSelect.value = previousValue;
        } else if (profCat && profCat !== ADD_NEW_VALUE && Object.keys(currentSnippets[profCat] || {}).length > 0 && !selectedValue) {
            // editCareLineSelect.value = Object.keys(currentSnippets[profCat])[0]; // Optionally default
        }
        handleCareLineChange(); // Update dependent UI
    }

    function handleProfCatChange() {
        toggleInputVisibility(editProfCatSelect, editNewProfCatInput, ADD_NEW_VALUE);
        const selectedProfCat = editProfCatSelect.value;
        populateCareLineSelect(selectedProfCat === ADD_NEW_VALUE ? null : selectedProfCat);
        if (selectedProfCat === ADD_NEW_VALUE) {
            editCareLineSelect.value = ADD_NEW_VALUE; // Cascade "add new"
            handleCareLineChange();
        }
    }

    function handleCareLineChange() {
        toggleInputVisibility(editCareLineSelect, editNewCareLineInput, ADD_NEW_VALUE);
    }

    if (editProfCatSelect) editProfCatSelect.addEventListener("change", handleProfCatChange);
    if (editCareLineSelect) editCareLineSelect.addEventListener("change", handleCareLineChange);

    function populateFormWithSnippetDetails(path) {
        if (!path) {
            clearAndPrepareFormForNew();
            return;
        }

        const parts = path.split('/');
        if (parts.length < 1) return;

        const profCat = parts[0];
        const careLine = parts.length > 1 ? parts[1] : null;
        const snippetName = parts.length > 2 ? parts[2] : null;

        populateProfCatSelect(profCat);
        if (profCat !== ADD_NEW_VALUE) {
            editNewProfCatInput.style.display = "none";
        }

        if (careLine) {
            populateCareLineSelect(profCat, careLine);
            if (careLine !== ADD_NEW_VALUE) {
                editNewCareLineInput.style.display = "none";
            }
        } else {
            populateCareLineSelect(profCat, null);
        }

        if (snippetName && currentSnippets[profCat] && currentSnippets[profCat][careLine] && currentSnippets[profCat][careLine][snippetName]) {
            const snippetData = currentSnippets[profCat][careLine][snippetName];
            editSnippetTypeInput.value = snippetName;
            if (typeof snippetData === 'object' && snippetData !== null) {
                editSnippetCommandInput.value = snippetData.command || "";
                editSnippetContentInput.value = snippetData.content || "";
            } else if (typeof snippetData === 'string') {
                editSnippetCommandInput.value = "";
                editSnippetContentInput.value = snippetData;
            }
            if (btnDeleteSnippet) btnDeleteSnippet.classList.remove("hidden");
        } else {
            editSnippetTypeInput.value = "";
            editSnippetCommandInput.value = "";
            editSnippetContentInput.value = "";
            if (btnDeleteSnippet) btnDeleteSnippet.classList.add("hidden");
        }
    }

    function clearAndPrepareFormForNew() {
        selectedItemPath = null;
        if (editSnippetForm) editSnippetForm.reset();

        populateProfCatSelect();
        editNewProfCatInput.value = "";
        editNewProfCatInput.style.display = "none";

        editCareLineSelect.innerHTML = '<option value="">Selecione uma Linha de Cuidado</option>';
        editCareLineSelect.disabled = true;
        editNewCareLineInput.value = "";
        editNewCareLineInput.style.display = "none";

        editSnippetTypeInput.value = "";
        editSnippetCommandInput.value = "";
        editSnippetContentInput.value = "";

        if (btnDeleteSnippet) btnDeleteSnippet.classList.add("hidden");
        handleFormDisplay(true); // Show the form
        if (editProfCatSelect && !path) editProfCatSelect.focus(); // Focus first field when new
        document.querySelectorAll(".tree-item.selected-item").forEach(el => el.classList.remove("selected-item"));
    }

    // --- Form Data and Saving Logic ---
    function getFormData() {
        const profCat = editProfCatSelect.value === ADD_NEW_VALUE ? editNewProfCatInput.value.trim() : editProfCatSelect.value;
        const careLine = editCareLineSelect.value === ADD_NEW_VALUE ? editNewCareLineInput.value.trim() : editCareLineSelect.value;
        const name = editSnippetTypeInput.value.trim(); // Assuming type is the name/key
        const command = editSnippetCommandInput.value.trim();
        const content = editSnippetContentInput.value.trim();
        return { profCat, careLine, name, command, content };
    }

    function isCommandConflicting(commandToCheck, targetProfCat, currentSnippetPath) {
        if (!commandToCheck || !currentSnippets[targetProfCat]) return { conflict: false };

        for (const careLineName in currentSnippets[targetProfCat]) {
            for (const snippetName in currentSnippets[targetProfCat][careLineName]) {
                const snippet = currentSnippets[targetProfCat][careLineName][snippetName];
                const path = `${targetProfCat}/${careLineName}/${snippetName}`;
                if (typeof snippet === 'object' && snippet.command === commandToCheck && path !== currentSnippetPath) {
                    return { conflict: true, path: path };
                }
            }
        }
        return { conflict: false };
    }

    function updateSnippetsDataStructure(formData, originalPath) {
        const { profCat, careLine, name, command, content } = formData;

        // Ensure path exists
        if (!currentSnippets[profCat]) currentSnippets[profCat] = {};
        if (!currentSnippets[profCat][careLine]) currentSnippets[profCat][careLine] = {};

        currentSnippets[profCat][careLine][name] = { command, content };

        // If the path changed (renaming/moving), delete the old entry
        const newPath = `${profCat}/${careLine}/${name}`;
        if (originalPath && originalPath !== newPath) {
            const [oldProfCat, oldCareLine, oldName] = originalPath.split('/');
            if (currentSnippets[oldProfCat]?.[oldCareLine]?.[oldName]) {
                delete currentSnippets[oldProfCat][oldCareLine][oldName];
                if (Object.keys(currentSnippets[oldProfCat][oldCareLine]).length === 0) {
                    delete currentSnippets[oldProfCat][oldCareLine];
                }
                if (Object.keys(currentSnippets[oldProfCat]).length === 0) {
                    delete currentSnippets[oldProfCat];
                }
            }
        }
        return newPath;
    }


    if (btnClearForm) btnClearForm.addEventListener("click", clearAndPrepareFormForNew);

    if (btnSaveSnippet) {
        btnSaveSnippet.addEventListener("click", async () => {
            const formData = getFormData();
            const { profCat, careLine, name, command } = formData;

            if (!profCat || !careLine || !name) {
                await showEditorStatus("Categoria Profissional, Linha de Cuidado e Nome do Snippet são obrigatórios.", true, 5000);
                return;
            }

            const conflictCheck = isCommandConflicting(command, profCat, selectedItemPath);
            if (conflictCheck.conflict) {
                 await showEditorStatus(`Comando '/${command}' já em uso por '${conflictCheck.path}'.`, true, 7000);
                 // We might not want to return here, to allow saving even with conflict,
                 // but it's good to warn. For now, let's allow saving.
                 // return;
            }

            const originalPathBeforeSave = selectedItemPath; // Preserve for later
            const newPath = updateSnippetsDataStructure(formData, selectedItemPath);
            selectedItemPath = newPath; // Update selectedItemPath to the new path

            try {
                await sendMessage({ action: "saveAllSnippets", payload: currentSnippets });
                await showEditorStatus("Snippet salvo com sucesso!");
                await loadSnippets(); // Reload all snippets from storage
                renderTreeView(); // Re-render the tree
                // Try to re-select the item, important if its path changed
                selectItem(newPath);
            } catch (error) {
                await showEditorStatus("Erro ao salvar snippet: " + error.message, true);
                // Attempt to revert if save failed? Complex. For now, just reload and show error.
                await loadSnippets();
                renderTreeView();
                // If original path existed, try to select it, else clear form
                if (originalPathBeforeSave && currentSnippets[originalPathBeforeSave.split('/')[0]]?.[originalPathBeforeSave.split('/')[1]]?.[originalPathBeforeSave.split('/')[2]]) {
                    selectItem(originalPathBeforeSave);
                } else {
                    clearAndPrepareFormForNew();
                    handleFormDisplay(false);
                }
            }
        });
    }

    if (btnDeleteSnippet) {
        btnDeleteSnippet.addEventListener("click", async () => {
            if (!selectedItemPath) {
                await showEditorStatus("Nenhum snippet selecionado para excluir.", true, 5000);
                return;
            }

            const parts = selectedItemPath.split('/');
            if (parts.length !== 3) { // Ensure it's a snippet, not a category or care line
                await showEditorStatus("Selecione um snippet específico para excluir.", true, 5000);
                return;
            }

            if (confirm(`Tem certeza que deseja excluir o snippet: "${parts[2]}"?`)) {
                const [profCat, careLine, snippetName] = parts;

                if (currentSnippets[profCat]?.[careLine]?.[snippetName]) {
                    delete currentSnippets[profCat][careLine][snippetName];
                    if (Object.keys(currentSnippets[profCat][careLine]).length === 0) {
                        delete currentSnippets[profCat][careLine];
                    }
                    if (Object.keys(currentSnippets[profCat]).length === 0) {
                        delete currentSnippets[profCat];
                    }

                    try {
                        await sendMessage({ action: "saveAllSnippets", payload: currentSnippets });
                        await showEditorStatus("Snippet excluído com sucesso!");
                        clearAndPrepareFormForNew(); // Clear form and hide it
                        handleFormDisplay(false);
                        await loadSnippets(); // Reload data
                        renderTreeView(); // Refresh tree view
                    } catch (error) {
                        await showEditorStatus("Erro ao excluir snippet: " + error.message, true);
                        await loadSnippets(); // Re-load to ensure consistency
                        renderTreeView();
                    }
                } else {
                    await showEditorStatus("Snippet não encontrado. Pode já ter sido excluído.", true, 5000);
                    await loadSnippets();
                    renderTreeView();
                }
            }
        });
    }

    if (btnExportJson) {
        btnExportJson.addEventListener("click", async () => { // Made async for status
            if (!currentSnippets || Object.keys(currentSnippets).length === 0) {
                await showEditorStatus("Não há snippets para exportar.", true);
                return;
            }
            try {
                const jsonString = JSON.stringify(currentSnippets, null, 2);
                const blob = new Blob([jsonString], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "snippets_export.json";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                await showEditorStatus("Snippets exportados com sucesso.", false, 5000);
            } catch (error) {
                await showEditorStatus("Erro ao exportar snippets: " + error.message, true);
            }
        });
    }

    if (btnImportJson && fileImportJson) {
        btnImportJson.addEventListener("click", () => fileImportJson.click());
        fileImportJson.addEventListener("change", async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const importedSnippets = JSON.parse(e.target.result);
                    if (typeof importedSnippets !== 'object' || importedSnippets === null) {
                        throw new Error("Arquivo JSON inválido.");
                    }
                    if (!confirm("Isso substituirá todos os seus snippets atuais. Deseja continuar?")) {
                        return;
                    }
                    currentSnippets = importedSnippets;
                    await sendMessage({ action: "saveAllSnippets", payload: currentSnippets });
                    await showEditorStatus("Snippets importados com sucesso!");
                    await loadSnippets();
                    renderTreeView();
                    populateProfCatSelect(); // Repopulate selects
                    clearAndPrepareFormForNew(); // Reset form
                    handleFormDisplay(false); // Hide form
                } catch (err) {
                    await showEditorStatus("Erro ao importar: " + err.message, true, 5000);
                } finally {
                    event.target.value = null; // Reset file input
                }
            };
            reader.onerror = async () => {
                 await showEditorStatus("Erro ao ler o arquivo.", true);
                 event.target.value = null;
            };
            reader.readAsText(file);
        });
    }

    // --- Initialization and Event Listeners ---
    chrome.storage.onChanged.addListener(async (changes, namespace) => {
        if (namespace === "local" && changes[STORAGE_KEY]) {
            const previousSelectedItemPath = selectedItemPath; // Preserve current selection path
            const previousTreeState = { ...treeState }; // Preserve tree expansion state

            await showEditorStatus("Snippets atualizados em segundo plano. Recarregando...", false, 2000);
            await loadSnippets();

            treeState = previousTreeState; // Restore tree expansion state
            renderTreeView();
            populateProfCatSelect(); // Repopulate selects, try to preserve selection via its own logic

            // Try to re-select the item if it still exists
            if (previousSelectedItemPath) {
                const parts = previousSelectedItemPath.split('/');
                let itemStillExists = false;
                if (parts.length === 3) itemStillExists = currentSnippets[parts[0]]?.[parts[1]]?.[parts[2]];
                else if (parts.length === 2) itemStillExists = currentSnippets[parts[0]]?.[parts[1]];
                else if (parts.length === 1) itemStillExists = currentSnippets[parts[0]];

                if (itemStillExists) {
                    selectItem(previousSelectedItemPath);
                } else {
                    clearAndPrepareFormForNew();
                    handleFormDisplay(false);
                }
            } else {
                clearAndPrepareFormForNew();
                handleFormDisplay(false);
            }
        }
    });

    async function initializeEditor() {
        try {
            await loadSnippets();
            renderTreeView();
            populateProfCatSelect();
            handleFormDisplay(false); // Initially hide form
            if (editNewProfCatInput) editNewProfCatInput.style.display = "none";
            if (editNewCareLineInput) editNewCareLineInput.style.display = "none";
        } catch (error) {
            showEditorStatus("Falha ao inicializar o editor: " + error.message, true, 0); // Show persistent error
        }
    }

    initializeEditor();
});
