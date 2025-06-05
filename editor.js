document.addEventListener("DOMContentLoaded", () => {
    const snippetsTreeView = document.getElementById("snippetsTreeView");
    const snippetsTreeViewLoading = document.getElementById(
        "snippetsTreeViewLoading"
    );
    const editSnippetForm = document.getElementById("editSnippetForm");
    const formFieldsContainer = document.getElementById("formFieldsContainer");
    const noSnippetSelectedMessage = document.getElementById(
        "noSnippetSelectedMessage"
    );

    const editProfCatSelect = document.getElementById("editProfCatSelect");
    const editNewProfCatInput = document.getElementById("editNewProfCatInput");
    const editCareLineSelect = document.getElementById("editCareLineSelect");
    const editNewCareLineInput = document.getElementById(
        "editNewCareLineInput"
    );
    const editSnippetTypeInput = document.getElementById("editSnippetType");
    const editSnippetCommandInput =
        document.getElementById("editSnippetCommand");
    const editSnippetContentPlain = document.getElementById(
        "editSnippetContentPlain"
    );
    const editSnippetContentRich = document.getElementById(
        "editSnippetContentRich"
    );
    const toggleRichText = document.getElementById("toggleRichText");
    const richTextToolbar = document.getElementById("richTextToolbar");

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

    function showEditorStatus(message, isError = false, duration = 3000) {
        if (editorStatusEl) {
            editorStatusEl.textContent = message;
            editorStatusEl.style.color = isError ? "red" : "green";
            if (duration > 0) {
                setTimeout(() => {
                    if (editorStatusEl.textContent === message) {
                        editorStatusEl.textContent = "";
                    }
                }, duration);
            }
        } else {
            (isError ? console.error : console.log)("Editor Status:", message);
        }
    }

    function sendMessage(message) {
        console.log("[EditorJS] Enviando mensagem para o background:", message);
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    console.error(
                        "[EditorJS] Erro ao enviar mensagem:",
                        chrome.runtime.lastError
                    );
                    return reject(chrome.runtime.lastError);
                }
                console.log("[EditorJS] Resposta do background:", response);
                resolve(response);
            });
        });
    }

    function loadSnippets() {
        console.log("[EditorJS] Iniciando loadSnippets");
        if (snippetsTreeViewLoading)
            snippetsTreeViewLoading.style.display = "block";
        if (snippetsTreeView) snippetsTreeView.innerHTML = "";

        return sendMessage({ action: "getAllSnippets" })
            .then((data) => {
                console.log(
                    "[EditorJS] Snippets recebidos do background:",
                    data
                );
                currentSnippets = data || {};
                if (snippetsTreeViewLoading)
                    snippetsTreeViewLoading.style.display = "none";
            })
            .catch((error) => {
                console.error("[EditorJS] Erro ao carregar snippets:", error);
                if (snippetsTreeViewLoading)
                    snippetsTreeViewLoading.style.display = "none";
                if (snippetsTreeView)
                    snippetsTreeView.innerHTML =
                        "<p>Erro ao carregar snippets. Verifique o console para mais detalhes.</p>";
                throw error;
            });
    }

    function handleFormDisplay(itemSelected = false) {
        if (itemSelected) {
            if (formFieldsContainer)
                formFieldsContainer.classList.remove("hidden");
            if (noSnippetSelectedMessage)
                noSnippetSelectedMessage.classList.add("hidden");
        } else {
            if (formFieldsContainer)
                formFieldsContainer.classList.add("hidden");
            if (noSnippetSelectedMessage)
                noSnippetSelectedMessage.classList.remove("hidden");
        }
    }

    function renderTreeView() {
        console.log(
            "[EditorJS] Iniciando renderTreeView com currentSnippets:",
            JSON.parse(JSON.stringify(currentSnippets))
        );
        if (!snippetsTreeView) {
            console.error("[EditorJS] snippetsTreeView não encontrado no DOM.");
            return;
        }
        snippetsTreeView.innerHTML = "";

        if (Object.keys(currentSnippets).length === 0) {
            snippetsTreeView.innerHTML =
                "<p>Nenhum snippet definido. Adicione um novo usando o formulário.</p>";
            populateProfCatSelect();
            return;
        }

        for (const profCat in currentSnippets) {
            const profCatDiv = document.createElement("div");
            const profCatToggle = document.createElement("span");
            profCatToggle.textContent =
                (treeState[profCat] && treeState[profCat].expanded
                    ? "▼ "
                    : "► ") + profCat;
            profCatToggle.classList.add("tree-item", "tree-category");
            profCatToggle.style.fontWeight = "bold";
            profCatToggle.dataset.path = profCat;
            profCatToggle.addEventListener("click", () => toggleNode(profCat));
            profCatDiv.appendChild(profCatToggle);

            if (treeState[profCat] && treeState[profCat].expanded) {
                const careLinesContainer = document.createElement("div");
                careLinesContainer.style.paddingLeft = "20px";
                for (const careLine in currentSnippets[profCat]) {
                    const careLineDiv = document.createElement("div");
                    const careLineToggle = document.createElement("span");
                    const careLinePath = `${profCat}/${careLine}`;
                    careLineToggle.textContent =
                        (treeState[careLinePath] &&
                        treeState[careLinePath].expanded
                            ? "▼ "
                            : "► ") + careLine;
                    careLineToggle.classList.add("tree-item", "tree-careline");
                    careLineToggle.dataset.path = careLinePath;
                    careLineToggle.addEventListener("click", () =>
                        toggleNode(careLinePath)
                    );
                    careLineDiv.appendChild(careLineToggle);

                    if (
                        treeState[careLinePath] &&
                        treeState[careLinePath].expanded
                    ) {
                        const snippetsContainer = document.createElement("div");
                        snippetsContainer.style.paddingLeft = "20px";
                        for (const snippetName in currentSnippets[profCat][
                            careLine
                        ]) {
                            const snippetItem = document.createElement("div");
                            snippetItem.textContent = snippetName;
                            snippetItem.classList.add(
                                "tree-item",
                                "tree-snippet"
                            );
                            snippetItem.dataset.path = `${profCat}/${careLine}/${snippetName}`;
                            snippetItem.addEventListener("click", (e) => {
                                selectItem(e.target.dataset.path);
                            });
                            snippetsContainer.appendChild(snippetItem);
                        }
                        careLineDiv.appendChild(snippetsContainer);
                    }
                    careLinesContainer.appendChild(careLineDiv);
                }
                profCatDiv.appendChild(careLinesContainer);
            }
            snippetsTreeView.appendChild(profCatDiv);
        }
        if (selectedItemPath) {
            const selectedElement = snippetsTreeView.querySelector(
                `[data-path="${selectedItemPath}"]`
            );
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
        console.log("[EditorJS] Item selecionado:", path);
        selectedItemPath = path;
        document
            .querySelectorAll(".tree-item.selected-item")
            .forEach((el) => el.classList.remove("selected-item"));
        const selectedElement = document.querySelector(
            `.tree-item[data-path="${path}"]`
        );
        if (selectedElement) {
            selectedElement.classList.add("selected-item");
        }
        populateFormWithSnippetDetails(path);
        handleFormDisplay(true);
        if (btnDeleteSnippet) btnDeleteSnippet.classList.remove("hidden");
    }

    function populateProfCatSelect(selectedValue) {
        if (!editProfCatSelect) return;
        const previousValue = selectedValue || editProfCatSelect.value;
        editProfCatSelect.innerHTML =
            '<option value="">Selecione uma Categoria</option>';

        const categories = Object.keys(currentSnippets);
        categories.forEach((cat) => {
            const option = document.createElement("option");
            option.value = cat;
            option.textContent = cat;
            editProfCatSelect.appendChild(option);
        });

        const addNewOption = document.createElement("option");
        addNewOption.value = ADD_NEW_VALUE;
        addNewOption.textContent = "--- Adicionar Nova Categoria ---";
        editProfCatSelect.appendChild(addNewOption);

        if (previousValue && categories.includes(previousValue)) {
            editProfCatSelect.value = previousValue;
        } else if (selectedValue === ADD_NEW_VALUE) {
            editProfCatSelect.value = ADD_NEW_VALUE;
        }
        handleProfCatChange();
    }

    function populateCareLineSelect(profCat, selectedValue) {
        if (!editCareLineSelect) return;
        const previousValue = selectedValue || editCareLineSelect.value;
        editCareLineSelect.innerHTML =
            '<option value="">Selecione uma Linha de Cuidado</option>';
        editCareLineSelect.disabled = true;

        if (profCat && currentSnippets[profCat]) {
            editCareLineSelect.disabled = false;
            const careLines = Object.keys(currentSnippets[profCat]);
            careLines.forEach((cl) => {
                const option = document.createElement("option");
                option.value = cl;
                option.textContent = cl;
                editCareLineSelect.appendChild(option);
            });
        }
        const addNewOption = document.createElement("option");
        addNewOption.value = ADD_NEW_VALUE;
        addNewOption.textContent = "--- Adicionar Nova Linha de Cuidado ---";
        editCareLineSelect.appendChild(addNewOption);

        if (
            profCat &&
            currentSnippets[profCat] &&
            previousValue &&
            Object.keys(currentSnippets[profCat]).includes(previousValue)
        ) {
            editCareLineSelect.value = previousValue;
        } else if (selectedValue === ADD_NEW_VALUE) {
            editCareLineSelect.value = ADD_NEW_VALUE;
        }
        handleCareLineChange();
    }

    function handleProfCatChange() {
        const selectedProfCat = editProfCatSelect.value;
        if (selectedProfCat === ADD_NEW_VALUE) {
            editNewProfCatInput.style.display = "block";
            editNewProfCatInput.focus();
            populateCareLineSelect(null);
            editCareLineSelect.value = ADD_NEW_VALUE;
            handleCareLineChange();
        } else {
            editNewProfCatInput.style.display = "none";
            editNewProfCatInput.value = "";
            populateCareLineSelect(selectedProfCat);
        }
    }

    function handleCareLineChange() {
        const selectedCareLine = editCareLineSelect.value;
        if (selectedCareLine === ADD_NEW_VALUE) {
            editNewCareLineInput.style.display = "block";
            editNewCareLineInput.focus();
        } else {
            editNewCareLineInput.style.display = "none";
            editNewCareLineInput.value = "";
        }
    }

    if (editProfCatSelect)
        editProfCatSelect.addEventListener("change", handleProfCatChange);
    if (editCareLineSelect)
        editCareLineSelect.addEventListener("change", handleCareLineChange);

    function populateFormWithSnippetDetails(path) {
        if (!path) {
            clearAndPrepareFormForNew();
            return;
        }

        const parts = path.split("/");
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

        if (
            snippetName &&
            currentSnippets[profCat] &&
            currentSnippets[profCat][careLine] &&
            currentSnippets[profCat][careLine][snippetName]
        ) {
            const snippetData = currentSnippets[profCat][careLine][snippetName];
            editSnippetTypeInput.value = snippetName;
            if (typeof snippetData === "object" && snippetData !== null) {
                editSnippetCommandInput.value = snippetData.command || "";
                if (snippetData.richText) {
                    toggleRichText.checked = true;
                    editSnippetContentRich.innerHTML =
                        snippetData.content || "";
                    editSnippetContentPlain.style.display = "none";
                    richTextToolbar.classList.remove("hidden");
                    editSnippetContentRich.classList.remove("hidden");
                } else {
                    toggleRichText.checked = false;
                    editSnippetContentPlain.value = snippetData.content || "";
                    editSnippetContentPlain.style.display = "block";
                    richTextToolbar.classList.add("hidden");
                    editSnippetContentRich.classList.add("hidden");
                }
            } else if (typeof snippetData === "string") {
                editSnippetCommandInput.value = "";
                toggleRichText.checked = false;
                editSnippetContentPlain.value = snippetData;
                editSnippetContentPlain.style.display = "block";
                richTextToolbar.classList.add("hidden");
                editSnippetContentRich.classList.add("hidden");
            }
            if (btnDeleteSnippet) btnDeleteSnippet.classList.remove("hidden");
        } else {
            editSnippetTypeInput.value = "";
            editSnippetCommandInput.value = "";
            toggleRichText.checked = false;
            editSnippetContentPlain.value = "";
            editSnippetContentPlain.style.display = "block";
            richTextToolbar.classList.add("hidden");
            editSnippetContentRich.classList.add("hidden");
            if (btnDeleteSnippet) btnDeleteSnippet.classList.add("hidden");
        }
    }

    function clearAndPrepareFormForNew() {
        selectedItemPath = null;
        if (editSnippetForm) editSnippetForm.reset();

        populateProfCatSelect();
        editNewProfCatInput.value = "";
        editNewProfCatInput.style.display = "none";

        editCareLineSelect.innerHTML =
            '<option value="">Selecione uma Linha de Cuidado</option>';
        editCareLineSelect.disabled = true;
        editNewCareLineInput.value = "";
        editNewCareLineInput.style.display = "none";

        editSnippetTypeInput.value = "";
        editSnippetCommandInput.value = "";
        editSnippetContentPlain.value = "";
        toggleRichText.checked = false;
        editSnippetContentPlain.style.display = "block";
        richTextToolbar.classList.add("hidden");
        editSnippetContentRich.classList.add("hidden");

        if (btnDeleteSnippet) btnDeleteSnippet.classList.add("hidden");
        handleFormDisplay(true);
        if (editProfCatSelect) editProfCatSelect.focus();
        document
            .querySelectorAll(".tree-item.selected-item")
            .forEach((el) => el.classList.remove("selected-item"));
    }

    if (btnClearForm) {
        btnClearForm.addEventListener("click", clearAndPrepareFormForNew);
    }

    if (toggleRichText) {
        toggleRichText.addEventListener("change", () => {
            if (toggleRichText.checked) {
                editSnippetContentRich.innerHTML =
                    editSnippetContentPlain.value.replace(/\n/g, "<br>");
                editSnippetContentPlain.style.display = "none";
                richTextToolbar.classList.remove("hidden");
                editSnippetContentRich.classList.remove("hidden");
            } else {
                editSnippetContentPlain.value =
                    editSnippetContentRich.innerHTML.replace(/<br>/g, "\n");
                editSnippetContentPlain.style.display = "block";
                richTextToolbar.classList.add("hidden");
                editSnippetContentRich.classList.add("hidden");
            }
        });
    }

    if (richTextToolbar) {
        richTextToolbar.addEventListener("click", (e) => {
            const cmd = e.target.dataset.cmd;
            if (cmd) {
                document.execCommand(cmd, false, null);
                editSnippetContentRich.focus();
            }
        });
    }

    if (btnSaveSnippet) {
        btnSaveSnippet.addEventListener("click", async () => {
            const originalPathOfEditingSnippet = selectedItemPath;

            let finalProfCat =
                editProfCatSelect.value === ADD_NEW_VALUE
                    ? editNewProfCatInput.value.trim()
                    : editProfCatSelect.value;
            let finalCareLine =
                editCareLineSelect.value === ADD_NEW_VALUE
                    ? editNewCareLineInput.value.trim()
                    : editCareLineSelect.value;
            const snippetType = editSnippetTypeInput.value.trim();
            const snippetCommand = editSnippetCommandInput.value.trim();
            const commandPattern = /^[A-Za-z0-9_-]+$/;
            if (snippetCommand && !commandPattern.test(snippetCommand)) {
                showEditorStatus(
                    "Comando inválido. Use apenas letras, números, '-' e '_' e não inclua '//'.",
                    true,
                    5000
                );
                return;
            }
            const snippetContent = toggleRichText.checked
                ? editSnippetContentRich.innerHTML.trim()
                : editSnippetContentPlain.value.trim();

            if (!finalProfCat || !finalCareLine || !snippetType) {
                showEditorStatus(
                    "Categoria Profissional, Linha de Cuidado e Nome/Tipo do Snippet são obrigatórios.",
                    true,
                    5000
                );
                return;
            }

            if (snippetCommand) {
                let conflictFound = false;
                let conflictingSnippetPath = "";
                if (currentSnippets[finalProfCat]) {
                    for (const careLineNameInLoop in currentSnippets[
                        finalProfCat
                    ]) {
                        if (conflictFound) break;
                        for (const existingSnippetNameInLoop in currentSnippets[
                            finalProfCat
                        ][careLineNameInLoop]) {
                            const existingSnippetData =
                                currentSnippets[finalProfCat][
                                    careLineNameInLoop
                                ][existingSnippetNameInLoop];
                            if (
                                typeof existingSnippetData === "object" &&
                                existingSnippetData.command === snippetCommand
                            ) {
                                const pathOfPotentiallyConflictingSnippet = `${finalProfCat}/${careLineNameInLoop}/${existingSnippetNameInLoop}`;
                                if (
                                    originalPathOfEditingSnippet ===
                                    pathOfPotentiallyConflictingSnippet
                                ) {
                                } else {
                                    conflictFound = true;
                                    conflictingSnippetPath =
                                        pathOfPotentiallyConflictingSnippet;
                                    break;
                                }
                            }
                        }
                    }
                }
                if (conflictFound) {
                    const pathWeAreSavingTo = `${finalProfCat}/${finalCareLine}/${snippetType}`;
                    if (conflictingSnippetPath !== pathWeAreSavingTo) {
                        showEditorStatus(
                            `Atenção: O comando '/${snippetCommand}' já está em uso por '${conflictingSnippetPath}' nesta categoria.`,
                            "warning",
                            7000
                        );
                    } else if (!originalPathOfEditingSnippet) {
                        showEditorStatus(
                            `Atenção: O comando '/${snippetCommand}' já está em uso por '${conflictingSnippetPath}' nesta categoria.`,
                            "warning",
                            7000
                        );
                    }
                }
            }

            if (!currentSnippets[finalProfCat]) {
                currentSnippets[finalProfCat] = {};
            }
            if (!currentSnippets[finalProfCat][finalCareLine]) {
                currentSnippets[finalProfCat][finalCareLine] = {};
            }
            currentSnippets[finalProfCat][finalCareLine][snippetType] = {
                command: snippetCommand,
                content: snippetContent,
                richText: toggleRichText.checked,
            };

            const newPath = `${finalProfCat}/${finalCareLine}/${snippetType}`;
            if (
                originalPathOfEditingSnippet &&
                originalPathOfEditingSnippet !== newPath
            ) {
                const parts = originalPathOfEditingSnippet.split("/");
                if (parts.length === 3) {
                    const [oldProfCat, oldCareLine, oldSnippetName] = parts;
                    if (
                        currentSnippets[oldProfCat] &&
                        currentSnippets[oldProfCat][oldCareLine] &&
                        currentSnippets[oldProfCat][oldCareLine][oldSnippetName]
                    ) {
                        delete currentSnippets[oldProfCat][oldCareLine][
                            oldSnippetName
                        ];
                        if (
                            Object.keys(
                                currentSnippets[oldProfCat][oldCareLine]
                            ).length === 0
                        ) {
                            delete currentSnippets[oldProfCat][oldCareLine];
                        }
                        if (
                            Object.keys(currentSnippets[oldProfCat]).length ===
                            0
                        ) {
                            delete currentSnippets[oldProfCat];
                        }
                    }
                }
            }

            try {
                await sendMessage({
                    action: "saveAllSnippets",
                    payload: currentSnippets,
                });
                showEditorStatus("Snippet salvo com sucesso!");
                await loadSnippets();
                selectItem(newPath);
            } catch (error) {
                showEditorStatus(
                    "Erro ao salvar snippet: " + error.message,
                    true
                );
                console.error("Erro ao salvar snippet:", error);
                await loadSnippets();
                renderTreeView();
                populateProfCatSelect();
                if (originalPathOfEditingSnippet) {
                    const parts = originalPathOfEditingSnippet.split("/");
                    if (
                        parts.length === 3 &&
                        currentSnippets[parts[0]]?.[parts[1]]?.[parts[2]]
                    ) {
                        selectItem(originalPathOfEditingSnippet);
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
    }

    if (btnDeleteSnippet) {
        btnDeleteSnippet.addEventListener("click", async () => {
            if (!selectedItemPath) {
                showEditorStatus(
                    "Nenhum snippet selecionado para excluir.",
                    true,
                    5000
                );
                return;
            }

            const parts = selectedItemPath.split("/");
            if (parts.length !== 3) {
                showEditorStatus(
                    "O item selecionado não é um snippet válido para exclusão.",
                    true,
                    5000
                );
                return;
            }

            if (confirm("Tem certeza que deseja excluir este snippet?")) {
                const [profCat, careLine, snippetName] = parts;

                if (
                    currentSnippets[profCat] &&
                    currentSnippets[profCat][careLine] &&
                    currentSnippets[profCat][careLine][snippetName]
                ) {
                    delete currentSnippets[profCat][careLine][snippetName];

                    if (
                        Object.keys(currentSnippets[profCat][careLine])
                            .length === 0
                    ) {
                        delete currentSnippets[profCat][careLine];
                    }

                    if (Object.keys(currentSnippets[profCat]).length === 0) {
                        delete currentSnippets[profCat];
                    }

                    try {
                        await sendMessage({
                            action: "saveAllSnippets",
                            payload: currentSnippets,
                        });
                        showEditorStatus("Snippet excluído com sucesso!");
                        console.log(
                            "Snippet excluído com sucesso:",
                            selectedItemPath
                        );
                        clearAndPrepareFormForNew();
                        loadSnippets();
                    } catch (error) {
                        showEditorStatus(
                            "Erro ao excluir snippet: " + error.message,
                            true
                        );
                        console.error("Erro ao excluir snippet:", error);
                        loadSnippets();
                    }
                } else {
                    showEditorStatus(
                        "Snippet não encontrado nos dados atuais. Pode já ter sido excluído.",
                        true,
                        5000
                    );
                    loadSnippets();
                }
            }
        });
    }

    if (btnExportJson) {
        btnExportJson.addEventListener("click", () => {
            if (!currentSnippets || Object.keys(currentSnippets).length === 0) {
                showEditorStatus("Não há snippets para exportar.", true);
                return;
            }

            try {
                const jsonString = JSON.stringify(currentSnippets, null, 2);
                const blob = new Blob([jsonString], {
                    type: "application/json",
                });
                const url = URL.createObjectURL(blob);

                const a = document.createElement("a");
                a.href = url;
                a.download = "snippets_export.json";

                document.body.appendChild(a);
                a.click();

                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                showEditorStatus(
                    "Snippets exportados com sucesso.",
                    false,
                    5000
                );
                console.log("Snippets exportados com sucesso.");
            } catch (error) {
                showEditorStatus(
                    "Erro ao exportar snippets: " + error.message,
                    true
                );
                console.error("Erro ao exportar snippets:", error);
            }
        });
    }

    if (btnImportJson && fileImportJson) {
        btnImportJson.addEventListener("click", () => {
            fileImportJson.click();
        });

        fileImportJson.addEventListener("change", (event) => {
            const file = event.target.files[0];
            if (!file) {
                return;
            }

            const reader = new FileReader();

            reader.onload = async (e) => {
                const text = e.target.result;
                let importedSnippets;
                try {
                    importedSnippets = JSON.parse(text);
                    if (
                        typeof importedSnippets !== "object" ||
                        importedSnippets === null
                    ) {
                        throw new Error(
                            "Arquivo JSON inválido ou não contém um objeto de snippets."
                        );
                    }
                } catch (err) {
                    showEditorStatus(
                        "Erro ao processar o arquivo JSON: " + err.message,
                        true,
                        5000
                    );
                    event.target.value = null;
                    return;
                }

                if (
                    !confirm(
                        "Isso substituirá todos os seus snippets atuais. Deseja continuar?"
                    )
                ) {
                    event.target.value = null;
                    return;
                }

                currentSnippets = importedSnippets;
                try {
                    await sendMessage({
                        action: "saveAllSnippets",
                        payload: currentSnippets,
                    });
                    showEditorStatus("Snippets importados com sucesso!");
                    await loadSnippets();
                    renderTreeView();
                    populateProfCatSelect();
                    clearAndPrepareFormForNew();
                } catch (error) {
                    showEditorStatus(
                        "Erro ao salvar snippets importados: " + error.message,
                        true
                    );
                    console.error("Erro ao salvar snippets importados:", error);
                    await loadSnippets();
                    renderTreeView();
                    populateProfCatSelect();
                }
                event.target.value = null;
            };

            reader.onerror = function () {
                showEditorStatus("Erro ao ler o arquivo.", true);
                event.target.value = null;
            };

            reader.readAsText(file);
        });
    }

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === "local" && changes[STORAGE_KEY]) {
            console.log(
                "[EditorJS] Detected change in snippets storage via chrome.storage.onChanged. Reloading snippets."
            );

            const currentPath = selectedItemPath;
            const currentTreeStateCopy = { ...treeState };

            loadSnippets()
                .then(() => {
                    treeState = currentTreeStateCopy;

                    let itemStillExists = false;
                    if (currentPath) {
                        const parts = currentPath.split("/");
                        if (
                            parts.length === 3 &&
                            currentSnippets[parts[0]]?.[parts[1]]?.[parts[2]]
                        ) {
                            itemStillExists = true;
                        } else if (
                            parts.length === 2 &&
                            currentSnippets[parts[0]]?.[parts[1]]
                        ) {
                            itemStillExists = true;
                        } else if (
                            parts.length === 1 &&
                            currentSnippets[parts[0]]
                        ) {
                            itemStillExists = true;
                        }
                    }

                    renderTreeView();
                    populateProfCatSelect(
                        itemStillExists && currentPath
                            ? currentPath.split("/")[0]
                            : null
                    );

                    if (itemStillExists) {
                        selectItem(currentPath);
                    } else {
                        clearAndPrepareFormForNew();
                        handleFormDisplay(false);
                    }
                })
                .catch((error) => {
                    console.error(
                        "[EditorJS] Error reloading snippets after storage change:",
                        error
                    );
                });
        }
    });

    loadSnippets()
        .then(() => {
            renderTreeView();
            populateProfCatSelect();
            handleFormDisplay(false);
            if (editNewProfCatInput) editNewProfCatInput.style.display = "none";
            if (editNewCareLineInput)
                editNewCareLineInput.style.display = "none";
        })
        .catch((error) => {
            console.error("[EditorJS] Error during initial load:", error);
        });
});
