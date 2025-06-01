const PROFESSIONAL_CATEGORY_KEY = "professionalCategory";
const ENABLED_CARE_LINES_KEY = "enabledCareLines";
const STORAGE_KEY = "snippets"; // Para buscar todas as categorias profissionais e linhas de cuidado

document.addEventListener("DOMContentLoaded", async () => {
    const profCatSelect = document.getElementById("professionalCategorySelect");
    const careLinesContainer = document.getElementById("careLinesContainer");
    const btnSync = document.getElementById("syncBtn");
    const statusEl = document.getElementById("syncStatus");

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
        const selectedProfCat = profCatSelect.value;
        careLinesContainer.innerHTML = "";

        if (!selectedProfCat || !allSnippetsData[selectedProfCat]) {
            careLinesContainer.innerHTML = selectedProfCat ? "<p>Nenhuma linha de cuidado definida para esta categoria no JSON.</p>" : "<p>Selecione uma categoria profissional.</p>";
            return;
        }

        const careLinesInJSON = Object.keys(allSnippetsData[selectedProfCat]);
        if (careLinesInJSON.length === 0) {
            careLinesContainer.innerHTML = "<p>Nenhuma linha de cuidado encontrada para esta categoria profissional no JSON.</p>";
            return;
        }

        try {
            // Solicita ao background apenas as linhas de cuidado habilitadas para a categoria selecionada
            const enabledCareLinesForProfCat = await sendMessage({ action: "getEnabledCareLines", professionalCategory: selectedProfCat });

            careLinesInJSON.forEach(careLine => {
                const lbl = document.createElement("label");
                const chk = document.createElement("input");
                chk.type = "checkbox";
                chk.value = careLine;
                chk.dataset.profCat = selectedProfCat; // Armazena a categoria para o evento
                chk.checked = enabledCareLinesForProfCat.includes(careLine);
                chk.addEventListener("change", updateEnabledCareLines);

                lbl.appendChild(chk);
                lbl.appendChild(document.createTextNode(careLine));
                careLinesContainer.appendChild(lbl);
            });
        } catch (error) {
            console.error("Erro ao carregar linhas de cuidado habilitadas:", error);
            careLinesContainer.innerHTML = `<p>Erro ao carregar linhas de cuidado: ${error.message}</p>`;
        }
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

    await loadProfessionalCategories();
});
