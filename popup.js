document.addEventListener("DOMContentLoaded", async () => {
    const PROFESSIONAL_CATEGORY_KEY = "professionalCategory";
    const ENABLED_CARE_LINES_KEY = "enabledCareLines";
    const STORAGE_KEY = "snippets";
    const LAST_SELECTED_PROF_CAT_POPUP_KEY = "lastSelectedProfCatPopup";
    const LAST_SELECTED_CARE_LINE_POPUP_KEY = "lastSelectedCareLinePopup";

    const profCatSelect = document.getElementById("professionalCategorySelect");
    const careLineSelect = document.getElementById("careLineSelect");
    const snippetsListEl = document.getElementById("snippetsList");

    let allSnippetsData = {};
    let enabledCareLinesData = {};

    async function loadProfessionalCategories() {
        try {
            const storage = await chrome.storage.local.get([STORAGE_KEY, LAST_SELECTED_PROF_CAT_POPUP_KEY, ENABLED_CARE_LINES_KEY]);
            allSnippetsData = storage[STORAGE_KEY] || {};
            enabledCareLinesData = storage[ENABLED_CARE_LINES_KEY] || {};
            const lastSelectedProfCat = storage[LAST_SELECTED_PROF_CAT_POPUP_KEY];

            const professionalCategories = Object.keys(allSnippetsData);
            profCatSelect.innerHTML = '<option value="">Selecione...</option>';

            if (professionalCategories.length === 0) {
                snippetsListEl.innerHTML = "<li>Nenhuma categoria profissional encontrada. Sincronize ou adicione snippets.</li>";
                careLineSelect.innerHTML = '<option value="">---</option>';
                return;
            }

            professionalCategories.forEach(cat => {
                const option = document.createElement("option");
                option.value = cat;
                option.textContent = cat;
                profCatSelect.appendChild(option);
            });

            let categoryToLoadCareLines = null;
            if (lastSelectedProfCat && professionalCategories.includes(lastSelectedProfCat)) {
                profCatSelect.value = lastSelectedProfCat;
                categoryToLoadCareLines = lastSelectedProfCat;
            } else if (professionalCategories.length > 0) {
                profCatSelect.value = professionalCategories[0];
                categoryToLoadCareLines = professionalCategories[0];
                await chrome.storage.local.set({ [LAST_SELECTED_PROF_CAT_POPUP_KEY]: categoryToLoadCareLines });
            }

            if (categoryToLoadCareLines) {
                await loadCareLines(categoryToLoadCareLines);
            } else {
                careLineSelect.innerHTML = '<option value="">Selecione Categoria Prof.</option>';
                snippetsListEl.innerHTML = "<li>Selecione uma categoria profissional.</li>";
            }
        } catch (error) {
            console.error("Erro ao carregar categorias profissionais:", error);
            snippetsListEl.innerHTML = "<li>Erro ao carregar categorias.</li>";
        }
    }

    async function loadCareLines(professionalCategory) {
        try {
            const storage = await chrome.storage.local.get([LAST_SELECTED_CARE_LINE_POPUP_KEY]);
            const lastSelectedCareLinesAllProfCats = storage[LAST_SELECTED_CARE_LINE_POPUP_KEY] || {};
            const lastSelectedCareLineForCurrentProfCat = lastSelectedCareLinesAllProfCats[professionalCategory];

            careLineSelect.innerHTML = '<option value="">Selecione...</option>';

            if (!professionalCategory || !allSnippetsData[professionalCategory]) {
                snippetsListEl.innerHTML = "<li>Nenhuma linha de cuidado para esta categoria.</li>";
                careLineSelect.innerHTML = '<option value="">---</option>';
                await renderSnippets(professionalCategory, null); // Clear snippets
                return;
            }

            const careLinesInSnippets = Object.keys(allSnippetsData[professionalCategory]);
            const enabledCareLinesForProfCat = enabledCareLinesData[professionalCategory] || [];

            const availableCareLines = careLinesInSnippets.filter(cl => enabledCareLinesForProfCat.includes(cl));

            if (availableCareLines.length === 0) {
                snippetsListEl.innerHTML = "<li>Nenhuma linha de cuidado habilitada ou definida para esta categoria. Verifique as Opções.</li>";
                careLineSelect.innerHTML = '<option value="">---</option>';
                await renderSnippets(professionalCategory, null); // Clear snippets
                return;
            }

            availableCareLines.forEach(careLineName => {
                const option = document.createElement("option");
                option.value = careLineName;
                option.textContent = careLineName;
                careLineSelect.appendChild(option);
            });

            let careLineToLoadSnippets = null;
            if (lastSelectedCareLineForCurrentProfCat && availableCareLines.includes(lastSelectedCareLineForCurrentProfCat)) {
                careLineSelect.value = lastSelectedCareLineForCurrentProfCat;
                careLineToLoadSnippets = lastSelectedCareLineForCurrentProfCat;
            } else if (availableCareLines.length > 0) {
                careLineSelect.value = availableCareLines[0];
                careLineToLoadSnippets = availableCareLines[0];
                lastSelectedCareLinesAllProfCats[professionalCategory] = careLineToLoadSnippets;
                await chrome.storage.local.set({ [LAST_SELECTED_CARE_LINE_POPUP_KEY]: lastSelectedCareLinesAllProfCats });
            }

            if (careLineToLoadSnippets) {
                await renderSnippets(professionalCategory, careLineToLoadSnippets);
            } else {
                 snippetsListEl.innerHTML = "<li>Selecione uma linha de cuidado.</li>";
            }

        } catch (error) {
            console.error(`Erro ao carregar linhas de cuidado para ${professionalCategory}:`, error);
            snippetsListEl.innerHTML = "<li>Erro ao carregar linhas de cuidado.</li>";
        }
    }

    async function renderSnippets(professionalCategory, careLineName) {
        snippetsListEl.innerHTML = "";

        if (!professionalCategory || !careLineName) {
            snippetsListEl.innerHTML = "<li>Selecione Categoria Profissional e Linha de Cuidado.</li>";
            return;
        }

        if (!allSnippetsData[professionalCategory] || !allSnippetsData[professionalCategory][careLineName]) {
            snippetsListEl.innerHTML = "<li>Nenhum snippet encontrado para esta seleção.</li>";
            return;
        }

        const snippets = allSnippetsData[professionalCategory][careLineName];
        if (Object.keys(snippets).length === 0) {
            snippetsListEl.innerHTML = "<li>Nenhum snippet nesta linha de cuidado.</li>";
            return;
        }

        for (const snippetName in snippets) {
            if (snippets.hasOwnProperty(snippetName)) {
                const snippetData = snippets[snippetName];
                const li = document.createElement("li");
                li.textContent = snippetName; // Display the snippet key as its name

                li.addEventListener("click", async () => {
                    let contentToPaste = "";
                    if (typeof snippetData === 'object' && snippetData !== null && typeof snippetData.content !== 'undefined') {
                        contentToPaste = snippetData.content;
                    } else if (typeof snippetData === 'string') { // Legacy format where the value is directly the content
                        contentToPaste = snippetData;
                    }

                    try {
                        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                        if (tabs[0] && tabs[0].id) {
                            await chrome.tabs.sendMessage(tabs[0].id, { action: "pasteSnippet", content: contentToPaste });
                        }
                        window.close();
                    } catch (error) {
                        console.error("Erro ao colar snippet:", error);
                        // Optionally: display error in popup if window doesn't close
                        // snippetsListEl.innerHTML = `<li>Erro ao colar: ${error.message}</li>`;
                    }
                });
                snippetsListEl.appendChild(li);
            }
        }
    }

    profCatSelect.addEventListener("change", async () => {
        const selectedProfCat = profCatSelect.value;
        if (selectedProfCat) {
            await chrome.storage.local.set({ [LAST_SELECTED_PROF_CAT_POPUP_KEY]: selectedProfCat });
            await loadCareLines(selectedProfCat);
        } else {
            careLineSelect.innerHTML = '<option value="">Selecione Categoria Prof.</option>';
            snippetsListEl.innerHTML = "<li>Selecione uma categoria profissional.</li>";
        }
    });

    careLineSelect.addEventListener("change", async () => {
        const selectedCareLine = careLineSelect.value;
        const selectedProfCat = profCatSelect.value;
        if (selectedCareLine && selectedProfCat) {
            const storageData = await chrome.storage.local.get(LAST_SELECTED_CARE_LINE_POPUP_KEY);
            let lastSelectedCareLinesAllProfCats = storageData[LAST_SELECTED_CARE_LINE_POPUP_KEY] || {};
            lastSelectedCareLinesAllProfCats[selectedProfCat] = selectedCareLine;
            await chrome.storage.local.set({ [LAST_SELECTED_CARE_LINE_POPUP_KEY]: lastSelectedCareLinesAllProfCats });
            await renderSnippets(selectedProfCat, selectedCareLine);
        } else {
            snippetsListEl.innerHTML = "<li>Selecione uma linha de cuidado.</li>";
        }
    });

    // Initial load
    await loadProfessionalCategories();
});
