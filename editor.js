// editor.js
document.addEventListener("DOMContentLoaded", () => {
    const snippetsTreeView = document.getElementById("snippetsTreeView");
    const snippetsTreeViewLoading = document.getElementById("snippetsTreeViewLoading");
    const editSnippetForm = document.getElementById("editSnippetForm");
    const formFieldsContainer = document.getElementById("formFieldsContainer");
    const noSnippetSelectedMessage = document.getElementById("noSnippetSelectedMessage");
    
    // Campos do formulário
    const editProfCatSelect = document.getElementById("editProfCatSelect");
    const editNewProfCatInput = document.getElementById("editNewProfCatInput");
    const editCareLineSelect = document.getElementById("editCareLineSelect");
    const editNewCareLineInput = document.getElementById("editNewCareLineInput");
    const editSnippetTypeInput = document.getElementById("editSnippetType"); // Nome/Tipo do Snippet
    const editSnippetCommandInput = document.getElementById("editSnippetCommand");
    const editSnippetContentInput = document.getElementById("editSnippetContent");

    const btnSaveSnippet = document.getElementById("btnSaveSnippet");
    const btnDeleteSnippet = document.getElementById("btnDeleteSnippet");
    const btnClearForm = document.getElementById("btnClearForm"); // Botão "Novo Snippet"
    const btnExportJson = document.getElementById("btnExportJson");
    const btnImportJson = document.getElementById("btnImportJson");
    const fileImportJson = document.getElementById("fileImportJson");

    let currentSnippets = {};
    let selectedItemPath = null;
    let treeState = {}; // Para manter o estado de expansão/recolhimento dos nós da árvore
    const ADD_NEW_VALUE = "__add_new__";

    // Enviar mensagem ao background
    function sendMessage(message) {
        console.log("[EditorJS] Enviando mensagem para o background:", message);
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("[EditorJS] Erro ao enviar mensagem:", chrome.runtime.lastError);
                    return reject(chrome.runtime.lastError);
                }
                console.log("[EditorJS] Resposta do background:", response);
                resolve(response);
            });
        });
    }

    // Carregar snippets
    async function loadSnippets() {
        console.log("[EditorJS] Iniciando loadSnippets");
        if (snippetsTreeViewLoading) snippetsTreeViewLoading.style.display = "block";
        if (snippetsTreeView) snippetsTreeView.innerHTML = ""; // Limpa a árvore antiga

        try {
            const data = await sendMessage({ action: "getAllSnippets" });
            console.log("[EditorJS] Snippets recebidos do background:", data);
            currentSnippets = data || {};
            if (snippetsTreeViewLoading) snippetsTreeViewLoading.style.display = "none";
            renderTreeView();
            populateProfCatSelect(); 
            handleFormDisplay(null); // Configura o estado inicial do formulário
        } catch (error) {
            console.error("[EditorJS] Erro ao carregar snippets:", error);
            if (snippetsTreeViewLoading) snippetsTreeViewLoading.style.display = "none";
            if (snippetsTreeView) snippetsTreeView.innerHTML = "<p>Erro ao carregar snippets. Verifique o console para mais detalhes.</p>";
        }
    }

    // Controla a exibição do formulário e da mensagem "nenhum selecionado"
    function handleFormDisplay(itemSelected = false) {
        if (itemSelected) {
            if(formFieldsContainer) formFieldsContainer.classList.remove("hidden");
            if(noSnippetSelectedMessage) noSnippetSelectedMessage.classList.add("hidden");
        } else {
            if(formFieldsContainer) formFieldsContainer.classList.add("hidden");
            if(noSnippetSelectedMessage) noSnippetSelectedMessage.classList.remove("hidden");
        }
    }
    
    // Renderizar a árvore de snippets com funcionalidade de expandir/recolher
    function renderTreeView() {
        console.log("[EditorJS] Iniciando renderTreeView com currentSnippets:", JSON.parse(JSON.stringify(currentSnippets)));
        if (!snippetsTreeView) {
            console.error("[EditorJS] snippetsTreeView não encontrado no DOM.");
            return;
        }
        snippetsTreeView.innerHTML = ""; 

        if (Object.keys(currentSnippets).length === 0) {
            snippetsTreeView.innerHTML = "<p>Nenhum snippet definido. Adicione um novo usando o formulário.</p>";
            populateProfCatSelect(); 
            return;
        }

        for (const profCat in currentSnippets) {
            const profCatDiv = document.createElement("div");
            const profCatToggle = document.createElement("span");
            profCatToggle.textContent = (treeState[profCat] && treeState[profCat].expanded ? "▼ " : "► ") + profCat;
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
                    careLineToggle.textContent = (treeState[careLinePath] && treeState[careLinePath].expanded ? "▼ " : "► ") + careLine;
                    careLineToggle.classList.add("tree-item", "tree-careline");
                    careLineToggle.dataset.path = careLinePath;
                    careLineToggle.addEventListener("click", () => toggleNode(careLinePath));
                    careLineDiv.appendChild(careLineToggle);

                    if (treeState[careLinePath] && treeState[careLinePath].expanded) {
                        const snippetsContainer = document.createElement("div");
                        snippetsContainer.style.paddingLeft = "20px";
                        for (const snippetName in currentSnippets[profCat][careLine]) {
                            const snippetItem = document.createElement("div");
                            snippetItem.textContent = snippetName;
                            snippetItem.classList.add("tree-item", "tree-snippet");
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
         // Adicionar destaque ao item selecionado
        if (selectedItemPath) {
            const selectedElement = snippetsTreeView.querySelector(`[data-path="${selectedItemPath}"]`);
            if (selectedElement) {
                selectedElement.classList.add("selected-item");
            }
        }
    }

    function toggleNode(path) {
        if (!treeState[path]) treeState[path] = { expanded: false };
        treeState[path].expanded = !treeState[path].expanded;
        renderTreeView(); // Re-renderiza a árvore para refletir a mudança
    }

    function selectItem(path) {
        console.log("[EditorJS] Item selecionado:", path);
        selectedItemPath = path;
        // Remover classe 'selected-item' de qualquer item previamente selecionado
        document.querySelectorAll(".tree-item.selected-item").forEach(el => el.classList.remove("selected-item"));
        // Adicionar classe ao item recém-selecionado
        const selectedElement = document.querySelector(`.tree-item[data-path="${path}"]`);
        if (selectedElement) {
            selectedElement.classList.add("selected-item");
        }
        populateFormWithSnippetDetails(path);
        handleFormDisplay(true);
        if(btnDeleteSnippet) btnDeleteSnippet.classList.remove("hidden");
    }
    
    // Popular select de Categoria Profissional
    function populateProfCatSelect(selectedValue) {
        if (!editProfCatSelect) return;
        const previousValue = selectedValue || editProfCatSelect.value;
        editProfCatSelect.innerHTML = '<option value="">Selecione uma Categoria</option>';
        
        const categories = Object.keys(currentSnippets);
        categories.forEach(cat => {
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
        handleProfCatChange(); // Para popular linhas de cuidado se uma categoria já estiver selecionada
    }

    // Popular select de Linha de Cuidado
    function populateCareLineSelect(profCat, selectedValue) {
        if (!editCareLineSelect) return;
        const previousValue = selectedValue || editCareLineSelect.value;
        editCareLineSelect.innerHTML = '<option value="">Selecione uma Linha de Cuidado</option>';
        editCareLineSelect.disabled = true;

        if (profCat && currentSnippets[profCat]) {
            editCareLineSelect.disabled = false;
            const careLines = Object.keys(currentSnippets[profCat]);
            careLines.forEach(cl => {
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

        if (profCat && currentSnippets[profCat] && previousValue && Object.keys(currentSnippets[profCat]).includes(previousValue)) {
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
            populateCareLineSelect(null); // Limpa linhas de cuidado
            editCareLineSelect.value = ADD_NEW_VALUE; // Força a exibição do input de nova linha
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

    if(editProfCatSelect) editProfCatSelect.addEventListener("change", handleProfCatChange);
    if(editCareLineSelect) editCareLineSelect.addEventListener("change", handleCareLineChange);

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

        populateProfCatSelect(profCat); // Popula e seleciona a categoria
        if (profCat !== ADD_NEW_VALUE) { // Se não for "adicionar nova"
             editNewProfCatInput.style.display = "none";
        }

        if (careLine) {
            populateCareLineSelect(profCat, careLine); // Popula e seleciona a linha de cuidado
            if (careLine !== ADD_NEW_VALUE) {
                editNewCareLineInput.style.display = "none";
            }
        } else {
            populateCareLineSelect(profCat, null); // Apenas popula, não seleciona linha específica
        }
        
        if (snippetName && currentSnippets[profCat] && currentSnippets[profCat][careLine] && currentSnippets[profCat][careLine][snippetName]) {
            const snippetData = currentSnippets[profCat][careLine][snippetName];
            editSnippetTypeInput.value = snippetName;
            if (typeof snippetData === 'object' && snippetData !== null) {
                editSnippetCommandInput.value = snippetData.command || "";
                editSnippetContentInput.value = snippetData.content || "";
            } else if (typeof snippetData === 'string') { // Legado ou snippet simples
                editSnippetCommandInput.value = ""; // Sem comando explícito
                editSnippetContentInput.value = snippetData;
            }
            if(btnDeleteSnippet) btnDeleteSnippet.classList.remove("hidden");
        } else { // Limpa campos do snippet se apenas categoria/linha for selecionada ou se for novo
            editSnippetTypeInput.value = "";
            editSnippetCommandInput.value = "";
            editSnippetContentInput.value = "";
            if(btnDeleteSnippet) btnDeleteSnippet.classList.add("hidden");
        }
    }
    
    function clearAndPrepareFormForNew() {
        selectedItemPath = null; // Indica que estamos criando um novo, não editando um existente
        if(editSnippetForm) editSnippetForm.reset(); // Limpa todos os campos do formulário
        
        populateProfCatSelect(); // Popula categorias, mas não seleciona nenhuma
        editNewProfCatInput.value = ""; 
        editNewProfCatInput.style.display = "none";
        
        editCareLineSelect.innerHTML = '<option value="">Selecione uma Linha de Cuidado</option>';
        editCareLineSelect.disabled = true;
        editNewCareLineInput.value = "";
        editNewCareLineInput.style.display = "none";

        editSnippetTypeInput.value = "";
        editSnippetCommandInput.value = "";
        editSnippetContentInput.value = "";
        
        if(btnDeleteSnippet) btnDeleteSnippet.classList.add("hidden");
        handleFormDisplay(true); // Mostra o formulário para entrada
        if(editProfCatSelect) editProfCatSelect.focus();
        document.querySelectorAll(".tree-item.selected-item").forEach(el => el.classList.remove("selected-item"));
    }

    if(btnClearForm) {
        btnClearForm.addEventListener("click", clearAndPrepareFormForNew);
    }

    // TODO: Implementar btnSaveSnippet, btnDeleteSnippet, btnExportJson, btnImportJson
    // Exemplo para btnSaveSnippet:
    if (btnSaveSnippet) {
        btnSaveSnippet.addEventListener("click", async () => {
            let finalProfCat = editProfCatSelect.value === ADD_NEW_VALUE ? editNewProfCatInput.value.trim() : editProfCatSelect.value;
            let finalCareLine = editCareLineSelect.value === ADD_NEW_VALUE ? editNewCareLineInput.value.trim() : editCareLineSelect.value;
            const snippetType = editSnippetTypeInput.value.trim();
            const snippetCommand = editSnippetCommandInput.value.trim();
            const snippetContent = editSnippetContentInput.value.trim();

            if (!finalProfCat || !finalCareLine || !snippetType) {
                alert("Categoria Profissional, Linha de Cuidado e Nome/Tipo do Snippet são obrigatórios.");
                return;
            }
            if (!currentSnippets[finalProfCat]) {
                currentSnippets[finalProfCat] = {};
            }
            if (!currentSnippets[finalProfCat][finalCareLine]) {
                currentSnippets[finalProfCat][finalCareLine] = {};
            }
            currentSnippets[finalProfCat][finalCareLine][snippetType] = {
                command: snippetCommand,
                content: snippetContent
            };

            try {
                await sendMessage({ action: "saveAllSnippets", payload: currentSnippets });
                alert("Snippets salvos com sucesso!");
                loadSnippets(); // Recarrega para refletir mudanças
                // Após salvar, idealmente selecionar o item que foi salvo/editado
                selectItem(`${finalProfCat}/${finalCareLine}/${snippetType}`);
            } catch (error) {
                alert("Erro ao salvar snippets: " + error.message);
                console.error("Erro ao salvar snippets:", error);
            }
        });
    }
    // Para que saveAllSnippets funcione, adicione um handler no background.js:
    // else if (msg.action === "saveAllSnippets") {
    // chrome.storage.local.set({ [STORAGE_KEY]: msg.payload }, () => {
    // if (chrome.runtime.lastError) { respond({ success: false, error: chrome.runtime.lastError.message }); return; }
    // respond({ success: true });
    // // Opcional: Chamar updateEnabledCareLinesOnSnippetsChange se a estrutura de snippets mudou significativamente
    // });
    // return true;
    // }


    // Inicialização
    loadSnippets();
    handleFormDisplay(false); // Garante que o formulário comece oculto
    if(editNewProfCatInput) editNewProfCatInput.style.display = "none";
    if(editNewCareLineInput) editNewCareLineInput.style.display = "none";
});
