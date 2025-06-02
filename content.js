let targetElement = null;
let customMenu = null;
let currentInsertionMode = "both"; // Padrão inicial
let pinButtons = []; // Array para rastrear os botões 📌

async function showCustomMenu(textareaElement) {
    targetElement = textareaElement;

    if (customMenu) {
        customMenu.remove();
        customMenu = null;
    }

    customMenu = document.createElement("div");
    customMenu.style.position = "absolute";
    customMenu.style.border = "1px solid #ccc";
    customMenu.style.background = "white";
    customMenu.style.padding = "10px";
    customMenu.style.zIndex = "10000"; 
    customMenu.style.boxShadow = "0px 2px 5px rgba(0,0,0,0.2)";
    customMenu.style.fontFamily = "Arial, sans-serif";
    customMenu.style.fontSize = "14px";

    const rect = textareaElement.getBoundingClientRect();
    let topPosition = window.scrollY + rect.bottom + 5;
    let leftPosition = window.scrollX + rect.left;
    customMenu.style.top = `${topPosition}px`;
    customMenu.style.left = `${leftPosition}px`;
    customMenu.style.minWidth = `280px`; 
    customMenu.style.maxWidth = `450px`; 

    const title = document.createElement("h4");
    title.textContent = "Selecionar Máscara";
    title.style.margin = "0 0 10px 0";
    customMenu.appendChild(title);

    chrome.runtime.sendMessage({ action: "getSnippetsDataForInPageMenu" }, (response) => {
        if (chrome.runtime.lastError || (response && response.error)) {
            console.error("Erro ao buscar dados para o menu:", chrome.runtime.lastError || response.error);
            customMenu.innerHTML = `<p>Erro ao carregar snippets: ${response.error || 'Verifique as configurações e sincronize.'}</p>`;
            document.body.appendChild(customMenu);
            setTimeout(() => { document.addEventListener("click", handleClickOutsideMenu, true); }, 0);
            return;
        }

        const { snippetsForProfCat, enabledCareLinesForProfCat, lastSelectedCareLineForProfCat } = response;

        if (Object.keys(snippetsForProfCat || {}).length === 0) {
            customMenu.innerHTML = "<p>Nenhum snippet encontrado para sua categoria profissional. Verifique as configurações.</p>";
            document.body.appendChild(customMenu);
            setTimeout(() => { document.addEventListener("click", handleClickOutsideMenu, true); }, 0);
            return;
        }

        if (!enabledCareLinesForProfCat || enabledCareLinesForProfCat.length === 0) {
            customMenu.innerHTML = "<p>Nenhuma linha de cuidado habilitada para sua categoria. Verifique as Opções da extensão.</p>";
            document.body.appendChild(customMenu);
            setTimeout(() => { document.addEventListener("click", handleClickOutsideMenu, true); }, 0);
            return;
        }

        const careLineLabel = document.createElement("label");
        careLineLabel.textContent = "Linha de Cuidado: ";
        careLineLabel.style.display = "block";
        careLineLabel.style.marginBottom = "5px";
        customMenu.appendChild(careLineLabel);

        const careLineSelect = document.createElement("select");
        careLineSelect.style.width = "100%";
        careLineSelect.style.marginBottom = "10px";
        customMenu.appendChild(careLineSelect);

        const snippetTypesContainer = document.createElement("div");
        snippetTypesContainer.style.marginTop = "10px";
        customMenu.appendChild(snippetTypesContainer);

        enabledCareLinesForProfCat.forEach(careLine => {
            if (snippetsForProfCat[careLine]) {
                const option = document.createElement("option");
                option.value = careLine;
                option.textContent = careLine;
                careLineSelect.appendChild(option);
            }
        });

        if (careLineSelect.options.length === 0) {
            customMenu.innerHTML = "<p>Nenhuma linha de cuidado com snippets encontrada. Verifique os snippets e as opções.</p>";
            document.body.appendChild(customMenu);
            setTimeout(() => { document.addEventListener("click", handleClickOutsideMenu, true); }, 0);
            return;
        }

        function renderSnippetTypes(selectedCareLine) {
            snippetTypesContainer.innerHTML = "";
            if (!selectedCareLine || !snippetsForProfCat[selectedCareLine]) {
                snippetTypesContainer.innerHTML = "<p>Selecione uma linha de cuidado válida.</p>";
                return;
            }

            const snippetTypes = snippetsForProfCat[selectedCareLine]; 
            if (typeof snippetTypes !== 'object' || Object.keys(snippetTypes).length === 0) {
                snippetTypesContainer.innerHTML = "<p>Nenhum tipo de snippet (Subjetivo, Objetivo, etc.) definido para esta linha de cuidado no JSON.</p>";
                return;
            }

            const list = document.createElement("ul");
            list.style.listStyle = "none";
            list.style.padding = "0";
            list.style.margin = "0";
            list.style.maxHeight = "200px";
            list.style.overflowY = "auto";
            list.style.border = "1px solid #eee";

            Object.entries(snippetTypes).forEach(([typeName, typeContent]) => {
                const li = document.createElement("li");
                li.textContent = typeName;
                li.style.padding = "8px 10px";
                li.style.borderBottom = "1px solid #f0f0f0";
                li.style.cursor = "pointer";
                li.addEventListener("mouseenter", () => li.style.backgroundColor = "#f9f9f9");
                li.addEventListener("mouseleave", () => li.style.backgroundColor = "white");
                li.addEventListener("click", (e) => {
                    e.stopPropagation(); 
                    pasteSnippetIntoTextarea(typeContent);
                    if (customMenu) customMenu.remove();
                    document.removeEventListener("click", handleClickOutsideMenu, true);
                });
                list.appendChild(li);
            });
            if (list.lastChild) list.lastChild.style.borderBottom = "none";
            snippetTypesContainer.appendChild(list);
        }

        careLineSelect.addEventListener("change", () => {
            const selectedCareLineValue = careLineSelect.value;
            renderSnippetTypes(selectedCareLineValue);
            chrome.runtime.sendMessage({
                action: "setLastSelectedCareLine",
                careLine: selectedCareLineValue
            });
        });

        let careLineToRenderInitially = null;
        if (lastSelectedCareLineForProfCat && enabledCareLinesForProfCat.includes(lastSelectedCareLineForProfCat) && snippetsForProfCat[lastSelectedCareLineForProfCat]) {
            careLineSelect.value = lastSelectedCareLineForProfCat;
            careLineToRenderInitially = lastSelectedCareLineForProfCat;
        } else if (careLineSelect.options.length > 0) {
            careLineSelect.selectedIndex = 0;
            careLineToRenderInitially = careLineSelect.value;
            chrome.runtime.sendMessage({ action: "setLastSelectedCareLine", careLine: careLineToRenderInitially });
        }

        if (careLineToRenderInitially) {
            renderSnippetTypes(careLineToRenderInitially);
        } else {
            snippetTypesContainer.innerHTML = "<p>Nenhuma linha de cuidado disponível ou selecionada.</p>";
        }

        document.body.appendChild(customMenu);
        setTimeout(() => {
            document.addEventListener("click", handleClickOutsideMenu, true);
        }, 0);
    });
}

function handleClickOutsideMenu(event) {
    if (customMenu && !customMenu.contains(event.target)) {
        const isButtonClick = event.target.closest('button[data-snippet-button="true"]');
        if (!isButtonClick) {
            customMenu.remove();
            customMenu = null;
            document.removeEventListener("click", handleClickOutsideMenu, true);
        }
    }
}

function pasteSnippetIntoTextarea(content) {
    if (targetElement) {
        targetElement.focus();
        const start = targetElement.selectionStart || 0;
        const end = targetElement.selectionEnd || 0;
        const value = targetElement.value || "";
        const antes = value.substring(0, start);
        const depois = value.substring(end);
        targetElement.value = antes + content + depois;
        const pos = antes.length + content.length;
        targetElement.setSelectionRange(pos, pos);
        targetElement.dispatchEvent(new Event("input", { bubbles: true }));
    }
}

// Insere o botão ao lado de cada textarea
function injectButtons() {
    if (!currentInsertionMode.includes("button")) {
        removeAllPinButtons(); // Remove botões se o modo não incluir "button"
        return;
    }

    const textareas = document.querySelectorAll("textarea:not([data-pin-injected='true'])");
    textareas.forEach((el) => {
        // Verifica se já existe um botão para este textarea
        let existingButton = el.previousElementSibling;
        if (existingButton && existingButton.classList && existingButton.classList.contains("snippet-pin-button")) {
            el.dataset.pinInjected = "true"; // Marca como já injetado se o botão já existe
            if (!pinButtons.includes(existingButton)) pinButtons.push(existingButton);
            return; 
        }

        const button = document.createElement("button");
        button.textContent = "📌";
        button.classList.add("snippet-pin-button"); // Adiciona uma classe para identificação
        button.style.position = "absolute";
        button.style.zIndex = "9999";
        button.style.cursor = "pointer";
        button.style.backgroundColor = "#f0f0f0";
        button.style.border = "1px solid #ccc";
        button.style.borderRadius = "4px";
        button.style.padding = "2px 5px";
        button.style.fontSize = "14px";
        button.style.lineHeight = "1";
        button.style.marginLeft = "-25px"; // Ajuste para posicionar ao lado
        button.style.marginTop = "5px";

        // Posicionamento relativo ao textarea
        el.style.position = "relative"; // Garante que o textarea seja o contexto de posicionamento
        // Insere o botão *antes* do textarea no DOM para facilitar o posicionamento e evitar que ele cubra o conteúdo do textarea
        el.parentNode.insertBefore(button, el);
        positionPinButton(button, el);
        
        button.addEventListener("click", (e) => {
            e.stopPropagation(); // Evita que o clique no botão dispare outros eventos
            showCustomMenu(el);
        });
        el.dataset.pinInjected = "true"; // Marca que o botão foi injetado
        pinButtons.push(button); // Adiciona o botão ao array de rastreamento
    });
}

function positionPinButton(button, textarea) {
    // Tenta posicionar o botão no canto superior direito do textarea
    // Esta função pode precisar de ajustes dependendo do layout da página alvo
    const rect = textarea.getBoundingClientRect();
    const parentRect = textarea.offsetParent ? textarea.offsetParent.getBoundingClientRect() : { top: 0, left: 0 };

    // Posicionamento inicial simples. Pode ser melhorado.
    button.style.top = `${textarea.offsetTop + 5}px`;
    button.style.left = `${textarea.offsetLeft + textarea.offsetWidth - 25}px`; 
}

function removeAllPinButtons() {
    pinButtons.forEach(button => {
        if (button.parentNode) {
            button.parentNode.removeChild(button);
        }
    });
    pinButtons = []; // Limpa o array
    // Remove o atributo data-pin-injected para que os botões possam ser reinjetados se necessário
    document.querySelectorAll("textarea[data-pin-injected='true']").forEach(el => {
        el.removeAttribute("data-pin-injected");
    });
}

// Observador para injetar botões em textareas que aparecem dinamicamente
const observer = new MutationObserver(() => {
    if (currentInsertionMode.includes("button")) {
        injectButtons();
    }
});

// --- Implementação do comando /snippet ---

// Configuração (poderia vir das opções da extensão no futuro)
const COMMAND_TRIGGER_CHAR = "/";
const COMMAND_ACTIVATION_KEY = " "; 

let currentCommand = "";
let commandActive = false;

function handleTextInput(event) {
    const el = event.target;
    // Verifica se o elemento é um textarea ou contenteditable
    if (el.tagName !== "TEXTAREA" && (!el.isContentEditable || el.isContentEditable === "false")) {
        resetCommandState();
        return;
    }

    if (customMenu && customMenu.isConnected) {
        return;
    }

    const key = event.key;

    // Verifica se o modo de comando está ativo
    if (!currentInsertionMode.includes("command")) {
        resetCommandState(); // Garante que o estado do comando seja resetado se o modo não estiver ativo
        return;
    }

    const currentText = el.value || el.textContent; 

    if (commandActive) {
        if (key === COMMAND_ACTIVATION_KEY || key === "Enter") {
            event.preventDefault(); 
            const commandToExecute = currentCommand;
            resetCommandState();
            
            chrome.runtime.sendMessage({ action: "getSnippetByCommandName", command: commandToExecute }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Erro ao buscar snippet por comando:", chrome.runtime.lastError.message);
                    insertTextAtCursor(el, `${COMMAND_TRIGGER_CHAR}${commandToExecute}${key === "Enter" ? "" : key}`);
                    return;
                }
                if (response && response.found && response.content) {
                    const textToRemove = `${COMMAND_TRIGGER_CHAR}${commandToExecute}`;
                    
                    if (el.value !== undefined) { 
                        const cursorPos = el.selectionStart;
                        const textBefore = el.value.substring(0, cursorPos - textToRemove.length);
                        const textAfter = el.value.substring(cursorPos);
                        el.value = textBefore + response.content + textAfter;
                        el.selectionStart = el.selectionEnd = (textBefore + response.content).length;
                    } else if (el.isContentEditable) { 
                        const selection = window.getSelection();
                        const range = selection.getRangeAt(0);
                        range.setStart(range.startContainer, range.startOffset - textToRemove.length);
                        range.deleteContents();
                        range.insertNode(document.createTextNode(response.content));
                        range.collapse(false); 
                    }
                    targetElement = el; 
                } else {
                    insertTextAtCursor(el, `${COMMAND_TRIGGER_CHAR}${commandToExecute}${key === "Enter" ? "" : key}`);
                }
            });

        } else if (key === "Escape" || key.startsWith("Arrow") || (event.ctrlKey || event.metaKey)) {
            resetCommandState();
        } else if (key === "Backspace") {
            if (currentCommand.length > 0) {
                currentCommand = currentCommand.slice(0, -1);
            } else {
                resetCommandState(); 
            }
        } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) { 
            currentCommand += key;
            event.preventDefault(); 
        } else {
        }
    } else if (key === COMMAND_TRIGGER_CHAR) {
        const cursorPos = el.selectionStart !== undefined ? el.selectionStart : window.getSelection().getRangeAt(0).startOffset;
        const charBefore = currentText[cursorPos-1];
        if (cursorPos === 0 || charBefore === undefined || /\s|[\.,;\(\)]/.test(charBefore)) {
            commandActive = true;
            currentCommand = "";
        } 
    }
}

function resetCommandState() {
    commandActive = false;
    currentCommand = "";
}

function insertTextAtCursor(el, text) {
    if (el.value !== undefined) {
        const start = el.selectionStart;
        const end = el.selectionEnd;
        el.value = el.value.substring(0, start) + text + el.value.substring(end);
        el.selectionStart = el.selectionEnd = start + text.length;
    } else if (el.isContentEditable) {
        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(text));
        range.collapse(false);
    }
}

// --- Controle de Modo de Inserção ---
function applyInsertionMode(mode) {
    currentInsertionMode = mode;
    console.log("Modo de inserção aplicado em content.js:", currentInsertionMode);

    if (currentInsertionMode.includes("button")) {
        injectButtons();
        observer.observe(document.body, { childList: true, subtree: true });
    } else {
        removeAllPinButtons();
        observer.disconnect();
    }

    if (currentInsertionMode.includes("command")) {
        document.addEventListener("keydown", handleTextInput, true);
    } else {
        document.removeEventListener("keydown", handleTextInput, true);
        resetCommandState(); // Garante que o estado do comando seja limpo ao desativar
    }
}

// Carrega o modo de inserção inicial e ouve por mudanças
chrome.runtime.sendMessage({ action: "getInsertionMode" }, (response) => {
    if (response && response.mode) {
        applyInsertionMode(response.mode);
    } else {
        applyInsertionMode("both"); // Padrão se nada for encontrado
    }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "local" && changes.insertionMode) {
        applyInsertionMode(changes.insertionMode.newValue);
    }
});

// Inicializa a injeção de botões (se aplicável) e observador de mutação
// A chamada inicial a injectButtons e observer.observe é agora feita dentro de applyInsertionMode
