// editor.js
document.addEventListener("DOMContentLoaded", () => {
    const snippetsTreeView = document.getElementById("snippetsTreeView");
    const snippetsTreeViewLoading = document.getElementById("snippetsTreeViewLoading");
    const editSnippetForm = document.getElementById("editSnippetForm");
    
    // Campos do formulário
    const editProfCatSelect = document.getElementById("editProfCatSelect");
    const editNewProfCatInput = document.getElementById("editNewProfCatInput");
    const editCareLineSelect = document.getElementById("editCareLineSelect");
    const editNewCareLineInput = document.getElementById("editNewCareLineInput");
    const editSnippetTypeInput = document.getElementById("editSnippetType");
    const editSnippetCommandInput = document.getElementById("editSnippetCommand"); // Novo campo
    const editSnippetContentInput = document.getElementById("editSnippetContent");

    const btnSaveSnippet = document.getElementById("btnSaveSnippet");
    const btnDeleteSnippet = document.getElementById("btnDeleteSnippet");
    const btnClearForm = document.getElementById("btnClearForm");
    const btnExportJson = document.getElementById("btnExportJson");
    const btnImportJson = document.getElementById("btnImportJson");
    const fileImportJson = document.getElementById("fileImportJson");

    let currentSnippets = {};
    let selectedItemPath = null; // {profCat, careLine, snippetType}
    let treeState = {}; // Para guardar o estado de expansão da árvore { 'profCat': true, 'profCat/careLine': true }

    const ADD_NEW_VALUE = "__add_new__";

    // Enviar mensagem ao background
    function sendMessage(message) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    return reject(chrome.runtime.lastError);
                }
                if (response && response.error) {
                    return reject(new Error(response.error)); // Garante que seja um objeto Error
                }
                resolve(response);
            });
        });
    }

    // Carregar snippets
    async function loadSnippets() {
        try {
            snippetsTreeViewLoading.style.display = "block";
            snippetsTreeView.innerHTML = "";
            const response = await sendMessage({ action: "getSnippetsForEditor" });
            currentSnippets = response.snippets || {};
            renderTreeView();
            populateProfCatSelect();
            btnClearForm.click(); // Limpa e prepara o formulário
        } catch (error) {
            console.error("Erro ao carregar snippets:", error);
            snippetsTreeView.innerHTML = `<p>Erro ao carregar snippets: ${error.message}</p>`;
        } finally {
            snippetsTreeViewLoading.style.display = "none";
        }
    }

    // Renderizar a árvore de snippets com funcionalidade de expandir/recolher
    function renderTreeView() {
        snippetsTreeView.innerHTML = "";
        if (Object.keys(currentSnippets).length === 0) {
            snippetsTreeView.innerHTML = "<p>Nenhum snippet definido. Adicione um novo usando o formulário.</p>";
            return;
        }

        for (const profCat in currentSnippets) {
            const profCatPath = profCat;
            const isProfCatExpanded = treeState[profCatPath] === undefined ? true : treeState[profCatPath]; // Expandido por padrão

            const profCatDiv = document.createElement("div");
            profCatDiv.style.paddingLeft = "5px";
            
            const profCatToggle = document.createElement("span");
            profCatToggle.textContent = isProfCatExpanded ? "▼ " : "► ";
            profCatToggle.style.cursor = "pointer";
            profCatToggle.addEventListener("click", (e) => {
                e.stopPropagation();
                treeState[profCatPath] = !isProfCatExpanded;
                renderTreeView(); // Re-renderiza para refletir o estado
                if (selectedItemPath) selectSnippet(selectedItemPath.profCat, selectedItemPath.careLine, selectedItemPath.snippetType); // Mantém seleção
            });

            const profCatLabel = document.createElement("span");
            profCatLabel.textContent = profCat;
            profCatLabel.style.fontWeight = "bold";
            profCatLabel.style.cursor = "pointer";
            profCatLabel.addEventListener("click", () => { // Clicar no nome também expande/recolhe
                 treeState[profCatPath] = !isProfCatExpanded;
                renderTreeView();
                if (selectedItemPath) selectSnippet(selectedItemPath.profCat, selectedItemPath.careLine, selectedItemPath.snippetType);
            });

            profCatDiv.appendChild(profCatToggle);
            profCatDiv.appendChild(profCatLabel);
            snippetsTreeView.appendChild(profCatDiv);

            if (isProfCatExpanded) {
                for (const careLine in currentSnippets[profCat]) {
                    const careLinePath = `${profCat}/${careLine}`;
                    const isCareLineExpanded = treeState[careLinePath] === undefined ? true : treeState[careLinePath];

                    const careLineDiv = document.createElement("div");
                    careLineDiv.style.paddingLeft = "15px";

                    const careLineToggle = document.createElement("span");
                    careLineToggle.textContent = isCareLineExpanded ? "▼ " : "► ";
                    careLineToggle.style.cursor = "pointer";
                    careLineToggle.addEventListener("click", (e) => {
                        e.stopPropagation();
                        treeState[careLinePath] = !isCareLineExpanded;
                        renderTreeView();
                        if (selectedItemPath) selectSnippet(selectedItemPath.profCat, selectedItemPath.careLine, selectedItemPath.snippetType);
                    });

                    const careLineLabel = document.createElement("span");
                    careLineLabel.textContent = careLine;
                    careLineLabel.style.cursor = "pointer";
                     careLineLabel.addEventListener("click", () => { // Clicar no nome também expande/recolhe
                        treeState[careLinePath] = !isCareLineExpanded;
                        renderTreeView();
                        if (selectedItemPath) selectSnippet(selectedItemPath.profCat, selectedItemPath.careLine, selectedItemPath.snippetType);
                    });

                    careLineDiv.appendChild(careLineToggle);
                    careLineDiv.appendChild(careLineLabel);
                    snippetsTreeView.appendChild(careLineDiv);

                    if (isCareLineExpanded) {
                        for (const snippetType in currentSnippets[profCat][careLine]) {
                            const snippetTypeDiv = document.createElement("div");
                            snippetTypeDiv.textContent = snippetType;
                            snippetTypeDiv.classList.add("tree-item");
                            snippetTypeDiv.style.paddingLeft = "25px";
                            snippetTypeDiv.dataset.profCat = profCat;
                            snippetTypeDiv.dataset.careLine = careLine;
                            snippetTypeDiv.dataset.snippetType = snippetType;

                            snippetTypeDiv.addEventListener("click", () => {
                                selectSnippet(profCat, careLine, snippetType);
                            });
                            snippetsTreeView.appendChild(snippetTypeDiv);
                        }
                    }
                }
            }
        }
    }
    
    // Popular select de Categoria Profissional
    function populateProfCatSelect(selectedValue) {
        editProfCatSelect.innerHTML = '<option value="">Selecione ou Adicione Nova...</option>';
        Object.keys(currentSnippets).sort().forEach(cat => {
            const option = document.createElement("option");
            option.value = cat;
            option.textContent = cat;
            editProfCatSelect.appendChild(option);
        });
        const addNewOption = document.createElement("option");
        addNewOption.value = ADD_NEW_VALUE;
        addNewOption.textContent = "Adicionar Nova Categoria...";
        editProfCatSelect.appendChild(addNewOption);
        if (selectedValue) {
            editProfCatSelect.value = selectedValue;
        }
        handleProfCatSelectChange(); // Para mostrar/esconder input e popular linhas de cuidado
    }

    // Popular select de Linha de Cuidado
    function populateCareLineSelect(profCat, selectedValue) {
        editCareLineSelect.innerHTML = '<option value="">Selecione ou Adicione Nova...</option>';
        if (profCat && currentSnippets[profCat]) {
            Object.keys(currentSnippets[profCat]).sort().forEach(line => {
                const option = document.createElement("option");
                option.value = line;
                option.textContent = line;
                editCareLineSelect.appendChild(option);
            });
        }
        const addNewOption = document.createElement("option");
        addNewOption.value = ADD_NEW_VALUE;
        addNewOption.textContent = "Adicionar Nova Linha de Cuidado...";
        editCareLineSelect.appendChild(addNewOption);
        if (selectedValue) {
            editCareLineSelect.value = selectedValue;
        }
        handleCareLineSelectChange(); // Para mostrar/esconder input
    }

    // Event listeners para os selects mostrarem/esconderem os inputs de "novo"
    editProfCatSelect.addEventListener("change", handleProfCatSelectChange);
    editCareLineSelect.addEventListener("change", handleCareLineSelectChange);

    function handleProfCatSelectChange() {
        const selectedProfCat = editProfCatSelect.value;
        if (selectedProfCat === ADD_NEW_VALUE) {
            editNewProfCatInput.classList.remove("hidden");
            editNewProfCatInput.required = true;
            populateCareLineSelect(null); // Limpa linhas de cuidado se está adicionando nova categoria
        } else {
            editNewProfCatInput.classList.add("hidden");
            editNewProfCatInput.required = false;
            editNewProfCatInput.value = "";
            populateCareLineSelect(selectedProfCat);
        }
    }

    function handleCareLineSelectChange() {
        if (editCareLineSelect.value === ADD_NEW_VALUE) {
            editNewCareLineInput.classList.remove("hidden");
            editNewCareLineInput.required = true;
        } else {
            editNewCareLineInput.classList.add("hidden");
            editNewCareLineInput.required = false;
            editNewCareLineInput.value = "";
        }
    }

    // Limpar formulário para novo snippet
    function clearForm() {
        editSnippetForm.reset();
        editProfCatSelect.value = "";
        editCareLineSelect.value = "";
        editNewProfCatInput.value = "";
        editNewProfCatInput.classList.add("hidden");
        editNewCareLineInput.value = "";
        editNewCareLineInput.classList.add("hidden");
        editSnippetTypeInput.value = "";
        editSnippetCommandInput.value = ""; // Limpar campo de comando
        editSnippetContentInput.value = "";
        selectedItemPath = null;
        btnDeleteSnippet.classList.add("hidden");
        editProfCatSelect.disabled = false;
        editCareLineSelect.disabled = false;
        editSnippetTypeInput.disabled = false;
        handleProfCatSelectChange(); // Atualiza o estado do select de linha de cuidado
        
        // Foca no primeiro campo relevante dependendo do estado dos selects
        if (editProfCatSelect.options.length > 1 && editProfCatSelect.value !== ADD_NEW_VALUE) {
            editProfCatSelect.focus();
        } else {
            editNewProfCatInput.focus();
        }
    }

    // Selecionar snippet para edição
    function selectSnippet(profCat, careLine, snippetType) {
        if (!currentSnippets[profCat] || !currentSnippets[profCat][careLine] || !currentSnippets[profCat][careLine][snippetType]) {
            console.warn("Snippet não encontrado para seleção:", profCat, careLine, snippetType);
            clearForm();
            return;
        }
        selectedItemPath = { profCat, careLine, snippetType };

        populateProfCatSelect(profCat);
        editNewProfCatInput.classList.add("hidden");
        editNewProfCatInput.value = "";

        populateCareLineSelect(profCat, careLine);
        editNewCareLineInput.classList.add("hidden");
        editNewCareLineInput.value = "";

        editSnippetTypeInput.value = snippetType;
        
        const snippetData = currentSnippets[profCat][careLine][snippetType];
        if (typeof snippetData === 'object' && snippetData.content) {
            editSnippetContentInput.value = snippetData.content;
            editSnippetCommandInput.value = snippetData.command || ""; // Popular campo de comando
        } else {
            editSnippetContentInput.value = snippetData; // Legado: snippet é apenas string
            editSnippetCommandInput.value = ""; // Limpar se não houver comando explícito
        }

        btnDeleteSnippet.classList.remove("hidden");
        editProfCatSelect.disabled = true;
        editCareLineSelect.disabled = true;
        editSnippetTypeInput.disabled = true;
        editSnippetContentInput.focus();
    }

    // Salvar snippet
    editSnippetForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const profCat = editProfCatSelect.value === ADD_NEW_VALUE ? editNewProfCatInput.value.trim() : editProfCatSelect.value;
        const careLine = editCareLineSelect.value === ADD_NEW_VALUE ? editNewCareLineInput.value.trim() : editCareLineSelect.value;
        const snippetType = editSnippetTypeInput.value.trim();
        const content = editSnippetContentInput.value.trim();
        const command = editSnippetCommandInput.value.trim(); // Obter comando customizado

        if (!profCat || !careLine || !snippetType || !content) {
            alert("Todos os campos obrigatórios (Categoria, Linha de Cuidado, Tipo, Conteúdo) devem ser preenchidos.");
            return;
        }

        // Atualiza a estrutura local primeiro
        if (!currentSnippets[profCat]) currentSnippets[profCat] = {};
        if (!currentSnippets[profCat][careLine]) currentSnippets[profCat][careLine] = {};

        if (command) {
            currentSnippets[profCat][careLine][snippetType] = { content, command };
        } else {
            currentSnippets[profCat][careLine][snippetType] = content;
        }

        try {
            await sendMessage({ action: "saveSnippetsToEditor", snippets: currentSnippets });
            alert("Snippet salvo com sucesso!");
            // Atualiza a árvore e limpa/reseta o formulário
            renderTreeView(profCat, careLine); // Passa o caminho para tentar expandir até ele
            // Se era um novo snippet, seleciona-o após salvar
            if (!selectedItemPath || selectedItemPath.profCat !== profCat || selectedItemPath.careLine !== careLine || selectedItemPath.snippetType !== snippetType) {
                 selectSnippet(profCat, careLine, snippetType);
            } else { // Se estava editando, mantém selecionado e os campos desabilitados
                 selectSnippet(profCat, careLine, snippetType); 
            }
            // Atualiza os selects caso novas categorias/linhas tenham sido adicionadas
            const currentProfCatVal = editProfCatSelect.value;
            const currentCareLineVal = editCareLineSelect.value;
            await populateProfCatSelect(currentProfCatVal === ADD_NEW_VALUE ? profCat : currentProfCatVal);
            if (currentProfCatVal === ADD_NEW_VALUE || editProfCatSelect.value === profCat) {
                await populateCareLineSelect(profCat, currentCareLineVal === ADD_NEW_VALUE ? careLine : currentCareLineVal);
            }

        } catch (error) {
            console.error("Erro ao salvar snippet:", error);
            alert("Falha ao salvar o snippet. Verifique o console para mais detalhes.");
        }
    });

    // Excluir snippet
    btnDeleteSnippet.addEventListener("click", async () => {
        if (!selectedItemPath) {
            alert("Nenhum snippet selecionado para excluir.");
            return;
        }

        const { profCat, careLine, snippetType } = selectedItemPath;
        if (!confirm(`Tem certeza que deseja excluir o snippet "${snippetType}" em "${profCat} > ${careLine}"?`)) {
            return;
        }

        delete currentSnippets[profCat][careLine][snippetType];
        if (Object.keys(currentSnippets[profCat][careLine]).length === 0) {
            delete currentSnippets[profCat][careLine];
        }
        if (Object.keys(currentSnippets[profCat]).length === 0) {
            delete currentSnippets[profCat];
        }

        try {
            await sendMessage({ action: "saveSnippetsToEditor", snippets: currentSnippets });
            alert("Snippet excluído com sucesso!");
            const originalTreeState = { ...treeState };
            await loadSnippets();
            treeState = originalTreeState;
            renderTreeView();
            btnClearForm.click(); 
        } catch (error) {
            console.error("Erro ao excluir snippet:", error);
            alert("Erro ao excluir snippet: " + error.message);
        }
    });
    
    // Exportar JSON
    btnExportJson.addEventListener("click", () => {
        // Garante que currentSnippets está atualizado antes de exportar
        // Se houver algo no formulário não salvo, não será exportado.
        // Para ser mais robusto, poderia verificar se o formulário está "sujo".
        const jsonData = JSON.stringify(currentSnippets, null, 4);
        const blob = new Blob([jsonData], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "snippets.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert("Snippets exportados para snippets.json. Lembre-se que a sincronização com o GitHub pode sobrescrever as alterações locais se o JSON do GitHub for diferente.");
    });

    // Importar JSON
    btnImportJson.addEventListener("click", () => {
        fileImportJson.click(); 
    });

    fileImportJson.addEventListener("change", async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const importedSnippets = JSON.parse(e.target.result);
                if (typeof importedSnippets !== 'object' || importedSnippets === null) {
                    throw new Error("Arquivo JSON inválido ou não é um objeto.");
                }
                
                if (!confirm("Isso substituirá todos os seus snippets atuais (incluindo os não salvos no formulário). Deseja continuar?")) {
                    fileImportJson.value = ""; 
                    return;
                }

                currentSnippets = importedSnippets; // Substitui os snippets atuais
                await sendMessage({ action: "saveSnippetsToEditor", snippets: currentSnippets });
                alert("Snippets importados com sucesso!");
                treeState = {}; // Reseta o estado da árvore
                await loadSnippets(); // Recarrega e renderiza
                btnClearForm.click();
            } catch (error) {
                console.error("Erro ao importar JSON:", error);
                alert("Erro ao importar JSON: " + error.message);
            } finally {
                fileImportJson.value = ""; 
            }
        };
        reader.readAsText(file);
    });

    // Inicialização
    loadSnippets();
});
