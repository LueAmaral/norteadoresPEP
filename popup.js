document.addEventListener('DOMContentLoaded', function() {
    const profCatSelect = document.getElementById('popupProfCatSelect');
    const insertionModeRadios = document.querySelectorAll('input[name="popupInsertionMode"]');
    const openEditorBtn = document.getElementById('popupOpenEditorBtn');
    const openOptionsPageButton = document.getElementById('openOptionsPageButton');
    const statusEl = document.getElementById('popupStatus');

    function showStatus(message, isError = false, duration = 2000) {
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.className = isError ? 'error' : 'success';
            if (duration > 0) {
                setTimeout(() => {
                    if (statusEl.textContent === message) { // Clear only if message hasn't changed
                        statusEl.textContent = '';
                        statusEl.className = '';
                    }
                }, duration);
            }
        } else {
            console.log("Popup Status:", message);
        }
    }

    // Helper to send messages to background.js
    function sendMessage(message) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Message error:", chrome.runtime.lastError.message, "For message:", message);
                    return reject(chrome.runtime.lastError);
                }
                if (response && response.success === false && response.error) {
                     console.error("Message failed:", response.error, "For message:", message);
                    return reject(new Error(response.error));
                }
                resolve(response);
            });
        });
    }

    // Populate Professional Categories
    async function loadProfCategories() {
        try {
            const snippets = await sendMessage({ action: "getAllSnippets" });
            const categories = snippets ? Object.keys(snippets) : [];

            profCatSelect.innerHTML = '<option value="">Selecione...</option>'; // Default option
            if (categories.length === 0) {
                profCatSelect.innerHTML = '<option value="">Sem categorias</option>';
            } else {
                categories.forEach(cat => {
                    const option = document.createElement('option');
                    option.value = cat;
                    option.textContent = cat;
                    profCatSelect.appendChild(option);
                });
            }

            const currentProfCat = await sendMessage({ action: "getProfessionalCategory" });
            if (currentProfCat && categories.includes(currentProfCat)) {
                profCatSelect.value = currentProfCat;
            }
        } catch (error) {
            console.error("Error loading professional categories:", error);
            profCatSelect.innerHTML = '<option value="">Erro ao carregar</option>';
            showStatus("Erro ao carregar categorias.", true);
        }
    }

    // Save Professional Category
    profCatSelect.addEventListener('change', async () => {
        const selectedCategory = profCatSelect.value;
        if (selectedCategory) {
            try {
                await sendMessage({ action: "setProfessionalCategory", category: selectedCategory });
                showStatus("Categoria salva!", false);
            } catch (error) {
                console.error("Error saving professional category:", error);
                showStatus("Erro ao salvar categoria.", true);
            }
        }
    });

    // Load and Save Insertion Mode
    async function loadInsertionMode() {
        try {
            const data = await sendMessage({ action: "getInsertionMode" });
            const currentMode = data && data.mode ? data.mode : "both"; // Default to 'both'
            insertionModeRadios.forEach(radio => {
                radio.checked = radio.value === currentMode;
            });
        } catch (error) {
            console.error("Error loading insertion mode:", error);
            showStatus("Erro ao carregar modo.", true);
        }
    }

    insertionModeRadios.forEach(radio => {
        radio.addEventListener('change', async (event) => {
            const selectedMode = event.target.value;
            try {
                await sendMessage({ action: "setInsertionMode", mode: selectedMode });
                showStatus("Modo de inserção salvo!", false);
            } catch (error) {
                console.error("Error saving insertion mode:", error);
                showStatus("Erro ao salvar modo.", true);
            }
        });
    });

    // Button to open Snippet Editor
    if (openEditorBtn) {
        openEditorBtn.addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('editor.html') });
        });
    }

    // Button to open Full Options Page
    if (openOptionsPageButton) {
        openOptionsPageButton.addEventListener('click', () => {
            if (chrome.runtime.openOptionsPage) {
                chrome.runtime.openOptionsPage();
            } else {
                chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
            }
        });
    } else {
        console.error("Button with ID 'openOptionsPageButton' not found in popup.html");
    }

    // Initial loads
    loadProfCategories();
    loadInsertionMode();
});
