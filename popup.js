document.addEventListener('DOMContentLoaded', function() {
    const profCatSelect = document.getElementById('popupProfCatSelect');
    const insertionModeRadios = document.querySelectorAll('input[name="popupInsertionMode"]');
    const openEditorBtn = document.getElementById('popupOpenEditorBtn');
    const openOptionsPageButton = document.getElementById('openOptionsPageButton');
    const statusEl = document.getElementById('popupStatus');
    const tempDisablePinToggle = document.getElementById('tempDisablePinToggle');

    const DISABLED_TABS_KEY = 'disabledPinTabs';

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

    async function loadTempDisableState() {
        if (!tempDisablePinToggle) {
            console.warn("tempDisablePinToggle element not found in popup.js");
            return;
        }

        tempDisablePinToggle.disabled = true; // Disable while loading

        try {
            const tabs = await new Promise((resolve, reject) => {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
                    if (tabs && tabs.length > 0 && tabs[0].id !== undefined) resolve(tabs); // Check for tab ID
                    else reject(new Error("No active tab with ID found"));
                });
            });
            const currentTabId = tabs[0].id;

            const result = await new Promise((resolve, reject) => {
                chrome.storage.session.get([DISABLED_TABS_KEY], (res) => {
                    if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
                    resolve(res);
                });
            });

            const disabledTabs = result[DISABLED_TABS_KEY] || [];
            tempDisablePinToggle.checked = disabledTabs.includes(currentTabId);
            tempDisablePinToggle.disabled = false; // Re-enable after successful load

        } catch (error) {
            console.error("Error loading temp disable state:", error.message);
            // Keep it disabled if there was an error determining state
            showStatus("Erro ao carregar estado do pin para esta aba.", true, 0);
        }
    }

    if (tempDisablePinToggle) {
        tempDisablePinToggle.addEventListener('change', async () => {
            if (tempDisablePinToggle.disabled) return;

            let currentTabId;
            try {
                const tabs = await new Promise((resolve, reject) => {
                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
                        if (tabs && tabs.length > 0 && tabs[0].id !== undefined) resolve(tabs);
                        else reject(new Error("No active tab with ID found for toggle change"));
                    });
                });
                currentTabId = tabs[0].id;

                const result = await new Promise((resolve, reject) => {
                    chrome.storage.session.get([DISABLED_TABS_KEY], (res) => {
                        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
                        resolve(res);
                    });
                });
                let disabledTabs = result[DISABLED_TABS_KEY] || [];

                const actionToContentScript = tempDisablePinToggle.checked ? "temporarilyDisablePins" : "temporarilyEnablePins";

                if (tempDisablePinToggle.checked) {
                    if (!disabledTabs.includes(currentTabId)) {
                        disabledTabs.push(currentTabId);
                    }
                } else {
                    disabledTabs = disabledTabs.filter(id => id !== currentTabId);
                }

                await new Promise((resolve, reject) => {
                    chrome.storage.session.set({ [DISABLED_TABS_KEY]: disabledTabs }, () => {
                        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
                        resolve();
                    });
                });

                // Send message to content script
                chrome.tabs.sendMessage(currentTabId, { action: actionToContentScript }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.warn("Could not send message to content script or no listener for:", actionToContentScript, "Tab ID:", currentTabId, "Error:", chrome.runtime.lastError.message);
                        // Optionally inform user if content script communication is vital and failed
                        // showStatus("A página precisa ser recarregada para aplicar totalmente.", true, 3000);
                    }
                    // You can check response here if content script sends one, e.g. if (response && response.success) ...
                });

                showStatus(tempDisablePinToggle.checked ? "Pins desativados nesta aba." : "Pins reativados nesta aba.", false);

            } catch (error) {
                console.error("Error changing temp disable state:", error.message);
                showStatus("Erro ao alterar estado do pin.", true);
                // Attempt to revert UI on error, or disable toggle until next popup open
                // For simplicity, current state might be briefly inconsistent with storage if set fails.
                // loadTempDisableState(); // Could reload state to revert UI
            }
        });
    }

    // Initial loads
    loadProfCategories();
    loadInsertionMode();
    loadTempDisableState(); // Add this new call
});
