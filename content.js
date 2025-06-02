console.log("[ContentJS] Script injetado em:", window.location.href); // Log para depuração
let targetElement = null;
let customMenu = null;
let currentInsertionMode = "both"; // Padrão inicial
let pinButtons = []; // Array para rastrear os botões 📌

const INSERTION_MODE_KEY = "insertionMode"; // Definir a constante aqui

async function showCustomMenu(textareaElement) {
    targetElement = textareaElement;
    console.log("[ContentJS - showCustomMenu] Iniciando para o elemento:", textareaElement);

    if (customMenu) {
        console.log("[ContentJS - showCustomMenu] Removendo menu customizado existente.");
        customMenu.remove();
        document.removeEventListener("click", handleClickOutsideMenu, true);
    }

    customMenu = document.createElement("div");
    customMenu.id = "snippetMasterExtensionMenu";
    console.log("[ContentJS - showCustomMenu] Elemento de menu criado:", customMenu);

    customMenu.style.position = "absolute";
    customMenu.style.backgroundColor = "white";
    customMenu.style.border = "1px solid #ccc";
    customMenu.style.padding = "10px";
    customMenu.style.zIndex = "2147483647"; // Z-index muito alto para tentar sobrepor outros elementos
    customMenu.style.color = "black"; // Cor do texto preta
    customMenu.style.maxHeight = "250px"; // Altura máxima aumentada
    customMenu.style.minWidth = "200px"; // Largura mínima
    customMenu.style.overflowY = "auto"; // Rolagem vertical se necessário
    customMenu.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)"; // Sombra para destaque
    customMenu.style.fontSize = "14px"; // Tamanho de fonte base
    customMenu.style.fontFamily = "Arial, sans-serif"; // Fonte padrão

    const textareaRect = textareaElement.getBoundingClientRect();
    const menuHeight = 250; // Altura máxima definida para o menu
    const menuWidth = 200; // Largura mínima definida para o menu

    // Tenta posicionar no canto superior direito da textarea
    // Ajusta se sair da tela
    let top = textareaRect.top + window.scrollY;
    let left = textareaRect.right + window.scrollX - menuWidth; // Assume menuWidth como largura inicial

    // Ajuste para não sair da viewport à esquerda
    if (left < 0) left = 5;
    // Ajuste para não sair da viewport à direita (considerando uma margem)
    if (left + menuWidth > window.innerWidth - 5) {
        left = window.innerWidth - menuWidth - 5;
    }
    // Ajuste para não sair da viewport no topo
    if (top < 0) top = 5;
    // Ajuste para não sair da viewport abaixo (considerando uma margem)
    // Se o menu for muito alto, pode precisar de mais lógica aqui
    if (top + menuHeight > window.innerHeight - 5 && textareaRect.top > menuHeight) {
        // Se há espaço acima da textarea, posiciona acima
        top = textareaRect.top + window.scrollY - menuHeight - 5;
    } else if (top + menuHeight > window.innerHeight - 5) {
        // Senão, apenas limita ao final da tela
        top = window.innerHeight - menuHeight - 5;
    }

    customMenu.style.top = `${top}px`;
    customMenu.style.left = `${left}px`;

    console.log(`[ContentJS - showCustomMenu] Posicionando menu em: top=${top}px, left=${left}px`);
    console.log("[ContentJS - showCustomMenu] Enviando mensagem getSnippetsDataForInPageMenu ao background.");

    chrome.runtime.sendMessage({ action: "getSnippetsDataForInPageMenu" }, (response) => {
        console.log("[ContentJS - showCustomMenu] Resposta recebida de getSnippetsDataForInPageMenu:", response);
        if (chrome.runtime.lastError) {
            console.error("[ContentJS - showCustomMenu] Erro ao buscar dados para o menu:", chrome.runtime.lastError.message);
            customMenu.textContent = "Erro ao carregar snippets.";
            document.body.appendChild(customMenu);
            document.addEventListener("click", handleClickOutsideMenu, true);
            return;
        }

        if (response && response.error) {
            console.error("[ContentJS - showCustomMenu] Erro retornado pelo background:", response.error);
            customMenu.textContent = response.error;
            document.body.appendChild(customMenu);
            document.addEventListener("click", handleClickOutsideMenu, true);
            return;
        }

        if (!response) {
            console.error("[ContentJS - showCustomMenu] Resposta inválida ou vazia do background.");
            customMenu.textContent = "Falha ao carregar dados (resposta inválida).";
            document.body.appendChild(customMenu);
            document.addEventListener("click", handleClickOutsideMenu, true);
            return;
        }

        console.log("[ContentJS - showCustomMenu] Dados recebidos para o menu:", response);
        const { snippetsForProfCat, enabledCareLinesForProfCat, lastSelectedCareLineForProfCat } = response;

        if (!enabledCareLinesForProfCat || enabledCareLinesForProfCat.length === 0) {
            console.log("[ContentJS - showCustomMenu] Nenhuma linha de cuidado habilitada.");
            customMenu.textContent = "Nenhuma linha de cuidado habilitada para sua categoria profissional. Verifique as Opções.";
            document.body.appendChild(customMenu);
            document.addEventListener("click", handleClickOutsideMenu, true);
            return;
        }
        
        console.log("[ContentJS - showCustomMenu] Linhas de cuidado habilitadas:", enabledCareLinesForProfCat);
        console.log("[ContentJS - showCustomMenu] Última linha de cuidado selecionada:", lastSelectedCareLineForProfCat);


        // Seletor para Linhas de Cuidado
        const careLineSelectContainer = document.createElement("div");
        careLineSelectContainer.style.marginBottom = "10px";
        customMenu.appendChild(careLineSelectContainer);

        const careLineLabel = document.createElement("label");
        careLineLabel.textContent = "Linha de Cuidado: ";
        careLineLabel.style.display = "block";
        careLineLabel.style.marginBottom = "5px";
        careLineSelectContainer.appendChild(careLineLabel);

        const careLineSelect = document.createElement("select");
        careLineSelect.style.width = "100%";
        careLineSelect.style.marginBottom = "10px";
        careLineSelectContainer.appendChild(careLineSelect);

        const snippetTypesContainer = document.createElement("div");
        snippetTypesContainer.style.marginTop = "10px";
        customMenu.appendChild(snippetTypesContainer);

        enabledCareLinesForProfCat.forEach(careLineName => {
            if (typeof careLineName !== 'string') {
                console.warn("[ContentJS - showCustomMenu] Item em enabledCareLinesForProfCat não é uma string:", careLineName);
            }
            const option = document.createElement("option");
            option.value = String(careLineName); // Garante que seja string
            option.textContent = String(careLineName); // Garante que seja string
            careLineSelect.appendChild(option); // CORRIGIDO: de selectCareLine para careLineSelect
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
            list.style.listStyleType = "none";
            list.style.paddingLeft = "0";
            list.style.maxHeight = "150px"; // Altura máxima para a lista de snippets
            list.style.overflowY = "auto";

            function renderSnippetList(selectedCareLine) {
                list.innerHTML = ""; // Limpa snippets anteriores
                console.log(`[ContentJS - showCustomMenu] Renderizando snippets para a linha de cuidado: ${selectedCareLine}`);

                const snippetsInCategory = snippetsForProfCat && snippetsForProfCat[selectedCareLine] ? snippetsForProfCat[selectedCareLine] : {};
                const snippetKeys = Object.keys(snippetsInCategory);
                console.log(`[ContentJS - showCustomMenu] Snippets encontrados para ${selectedCareLine}:`, snippetKeys);

                if (snippetKeys.length === 0) {
                    const li = document.createElement("li");
                    li.textContent = "Nenhum snippet para esta linha de cuidado.";
                    li.style.color = "#777";
                    list.appendChild(li);
                    return;
                }

                snippetKeys.forEach(key => {
                    const snippet = snippetsInCategory[key];
                    const li = document.createElement("li");
                    li.textContent = key; // Ou snippet.name se você tiver um nome
                    li.style.padding = "8px";
                    li.style.borderBottom = "1px solid #eee";
                    li.style.cursor = "pointer";
                    li.onmouseover = () => { li.style.backgroundColor = "#f0f0f0"; };
                    li.onmouseout = () => { li.style.backgroundColor = "transparent"; };
                    li.addEventListener("click", () => {
                        console.log(`[ContentJS - showCustomMenu] Snippet '${key}' clicado. Objeto/String snippet completo:`, snippet); 
                        // Se 'snippet' já for a string de conteúdo, snippet.content será undefined.
                        // Vamos assumir que 'snippet' é a própria string de conteúdo.
                        pasteSnippetIntoTextarea(snippet); // Alterado de snippet.content para snippet
                        customMenu.remove();
                        document.removeEventListener("click", handleClickOutsideMenu, true);
                    });
                    list.appendChild(li);
                });
            }

            careLineSelect.addEventListener("change", (e) => { // CORRIGIDO: de selectCareLine para careLineSelect
                const newSelectedCareLine = e.target.value;
                console.log(`[ContentJS - showCustomMenu] Linha de cuidado alterada para: ${newSelectedCareLine}`);
                renderSnippetList(newSelectedCareLine);
                // Salva a última linha de cuidado selecionada para esta categoria profissional
                chrome.runtime.sendMessage({ 
                    action: "setLastSelectedCareLine", 
                    careLine: newSelectedCareLine 
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error("[ContentJS - showCustomMenu] Erro ao salvar última linha de cuidado:", chrome.runtime.lastError.message);
                    } else if (response && response.success) {
                        console.log("[ContentJS - showCustomMenu] Última linha de cuidado salva com sucesso.");
                    } else {
                        console.warn("[ContentJS - showCustomMenu] Falha ao salvar última linha de cuidado, resposta:", response);
                    }
                });
            });

            // Renderiza inicialmente com a última selecionada ou a primeira da lista
            let initialCareLineToRender = lastSelectedCareLineForProfCat && enabledCareLinesForProfCat.includes(lastSelectedCareLineForProfCat) 
                                        ? lastSelectedCareLineForProfCat 
                                        : enabledCareLinesForProfCat[0];
            
            if (initialCareLineToRender) {
                careLineSelect.value = initialCareLineToRender; // CORRIGIDO: de selectCareLine para careLineSelect
                renderSnippetList(initialCareLineToRender);
            } else {
                console.warn("[ContentJS - showCustomMenu] Nenhuma linha de cuidado inicial para renderizar.");
                list.textContent = "Nenhuma linha de cuidado disponível para seleção.";
            }
            
            customMenu.appendChild(careLineSelectContainer);
            customMenu.appendChild(list);

            console.log("[ContentJS - showCustomMenu] Adicionando menu ao body e listener de clique externo.");
            document.body.appendChild(customMenu);
            document.addEventListener("click", handleClickOutsideMenu, true);
            console.log("[ContentJS - showCustomMenu] Menu deveria estar visível agora.");
        }

        renderSnippetTypes(careLineSelect.value);

        // customMenu.appendChild(careLineSelectContainer); // Já adicionado dentro de renderSnippetTypes
        // customMenu.appendChild(snippetTypesContainer); // Já adicionado dentro de renderSnippetTypes

        document.body.appendChild(customMenu);
        setTimeout(() => {
            document.addEventListener("click", handleClickOutsideMenu, true);
        }, 0);
        console.log("[ContentJS - showCustomMenu] Menu deveria estar visível agora após correções.");
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
    if (currentInsertionMode === "command") {
        removeAllPinButtons();
        return;
    }
    // console.log("[ContentJS] Tentando injetar botões pin.");

    const textareas = document.querySelectorAll('textarea:not([data-pin-injected="true"])');
    // console.log(`[ContentJS] Textareas encontradas para injeção: ${textareas.length}`);

    textareas.forEach((textarea) => {
        if ((textarea.offsetWidth === 0 && textarea.offsetHeight === 0) || getComputedStyle(textarea).display === 'none') {
            // console.log("[ContentJS] Ignorando textarea oculta, sem dimensões ou display:none:", textarea);
            return; 
        }

        textarea.setAttribute('data-pin-injected', 'true');
        // console.log("[ContentJS] Injetando pin para textarea:", textarea);

        const button = document.createElement("button");
        button.innerHTML = "📌";
        button.classList.add("snippet-pin-button");
        button.style.position = "absolute";
        button.style.zIndex = "2147483640"; 
        button.style.cursor = "pointer";
        button.style.background = "transparent";
        button.style.border = "none";
        button.style.padding = "2px";
        button.style.fontSize = "16px";
        button.style.width = "24px"; 
        button.style.height = "24px";
        button.style.display = "flex"; 
        button.style.alignItems = "center";
        button.style.justifyContent = "center";
        button.setAttribute('aria-label', 'Inserir snippet');
        button.setAttribute('title', 'Inserir snippet');

        const parent = textarea.offsetParent || document.body;
        if (parent !== document.body && getComputedStyle(parent).position === 'static') {
            // console.log("[ContentJS] Definindo position:relative para o offsetParent da textarea:", parent);
            parent.style.position = 'relative';
        }
        parent.appendChild(button);
        
        positionPinButton(button, textarea);

        button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            console.log("[ContentJS - injectButtons] Botão Pin clicado! Target Textarea:", textarea);
            showCustomMenu(textarea); // Chama a função para mostrar o menu
        });

        const resizeObserver = new ResizeObserver(() => {
            // console.log("[ContentJS] ResizeObserver acionado para textarea:", textarea);
            positionPinButton(button, textarea);
        });
        resizeObserver.observe(textarea);
        
        // Armazena o observer junto com o botão e textarea para poder desconectá-lo depois
        pinButtons.push({ button, textarea, observer: resizeObserver }); 
    });
    // console.log(`[ContentJS] Total de botões pin rastreados: ${pinButtons.length}`);
}

function positionPinButton(button, textarea) {
    if (!textarea.offsetParent || textarea.offsetWidth === 0 || textarea.offsetHeight === 0 || getComputedStyle(textarea).display === 'none') {
        button.style.display = 'none';
        return;
    }
    button.style.display = 'flex';

    // O botão é filho do textarea.offsetParent.
    // textarea.offsetTop e textarea.offsetLeft são as coordenadas da textarea relativas ao seu offsetParent.
    // Posiciona o botão no canto superior direito da textarea, mas ligeiramente para fora dela.
    let top = textarea.offsetTop;
    let left = textarea.offsetLeft + textarea.offsetWidth + 2; // 2px à direita da textarea

    // Ajustes simples para evitar que o botão saia completamente da viewport se o offsetParent for o body.
    // Uma solução mais robusta poderia envolver verificar os limites do offsetParent.
    const buttonHeight = button.offsetHeight || 24;
    const buttonWidth = button.offsetWidth || 24;

    // Se o pai for o corpo do documento, podemos tentar ajustar com base no scroll e tamanho da janela.
    if (button.offsetParent === document.body) {
        const docRect = document.documentElement.getBoundingClientRect();
        const maxTop = window.scrollY + window.innerHeight - buttonHeight - 5; // 5px de margem inferior
        const maxLeft = window.scrollX + window.innerWidth - buttonWidth - 5; // 5px de margem direita
        
        top = Math.max(window.scrollY + 5, Math.min(top, maxTop));
        left = Math.max(window.scrollX + 5, Math.min(left, maxLeft));
    } 
    // Para offsetParents que não são o body, esses ajustes podem ser mais complexos
    // e podem depender do overflow e tamanho do offsetParent.
    // Por enquanto, a lógica acima é uma simplificação.

    button.style.top = `${top}px`;
    button.style.left = `${left}px`;
}

function removeAllPinButtons() {
    // console.log("[ContentJS] Removendo todos os botões pin.");
    pinButtons.forEach(({ button, textarea, observer }) => { // Adicionado observer aqui
        if (observer) { // Checa se o observer existe
            observer.disconnect();
            // console.log("[ContentJS] ResizeObserver desconectado para textarea:", textarea);
        }
        if (button.parentElement) {
            button.parentElement.removeChild(button);
        }
        if (textarea) { // Checa se textarea existe
            textarea.removeAttribute('data-pin-injected');
        }
    });
    pinButtons = []; // Limpa o array
}

// Observador para injetar botões em textareas que aparecem dinamicamente
const observer = new MutationObserver((mutationsList) => {
    if (currentInsertionMode.includes("button")) {
        // Otimização: verificar se as mutações realmente adicionaram elementos relevantes
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                let needsInject = false;
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.matches && node.matches("textarea, div[contenteditable='true'], input[type='text']")) {
                            needsInject = true;
                        } else if (node.querySelector && node.querySelector("textarea, div[contenteditable='true'], input[type='text']")) {
                            needsInject = true;
                        }
                    }
                });
                if (needsInject) {
                    // console.log("[ContentJS] Mutação detectada (nós adicionados), chamando injectButtons.");
                    injectButtons();
                    break; 
                }
            }
        }
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

    if (event.type === "keydown") {
        if (key === COMMAND_TRIGGER_CHAR) {
            currentCommand = COMMAND_TRIGGER_CHAR;
            commandActive = true;
        } else if (commandActive && key.length === 1 && /[\w\d_]/.test(key)) {
            currentCommand += key;
        } else if (commandActive && (key === " " || key === "Enter")) {
            if (currentCommand.length > 1) {
                const commandName = currentCommand.slice(1).toLowerCase();
                chrome.runtime.sendMessage({ action: "getSnippetByCommandName", command: commandName }, (response) => {
                    if (response && response.content) {
                        insertTextAtCursor(el, response.content);
                        event.preventDefault();
                    }
                });
            }
            resetCommandState();
        } else {
            resetCommandState();
        }
    }
}

function resetCommandState() {
    currentCommand = "";
    commandActive = false;
}

function insertTextAtCursor(el, text) {
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const value = el.value;
        el.value = value.substring(0, start) + text + value.substring(end);
        el.selectionStart = el.selectionEnd = start + text.length;
        el.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (el.isContentEditable) {
        document.execCommand("insertText", false, text);
    }
}

// Substituir o listener de input por keydown
window.addEventListener("keydown", handleTextInput, true);

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
    let mode = response && response.mode ? response.mode : (typeof response === 'string' ? response : "both");
    console.log("[ContentJS] Modo de inserção inicial recebido:", mode);
    applyInsertionMode(mode); 
    if (currentInsertionMode.includes("button")) {
        observer.observe(document.body, { childList: true, subtree: true });
    }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "local" && changes[INSERTION_MODE_KEY]) {
        let newMode = changes[INSERTION_MODE_KEY].newValue;
        console.log("[ContentJS] Mudança no modo de inserção detectada:", newMode);
        const oldModeIncludesButton = currentInsertionMode.includes("button");
        applyInsertionMode(newMode); 
        
        const newModeIncludesButton = currentInsertionMode.includes("button");

        if (newModeIncludesButton && !oldModeIncludesButton) {
            console.log("[ContentJS] Ativando MutationObserver.");
            injectButtons(); // Garante que os botões sejam injetados imediatamente
            observer.observe(document.body, { childList: true, subtree: true });
        } else if (!newModeIncludesButton && oldModeIncludesButton) {
            console.log("[ContentJS] Desativando MutationObserver.");
            observer.disconnect();
            removeAllPinButtons(); // Remove os botões se o modo for desativado
        }
    }
    // ... outros listeners de onChanged ...
});

// Adicionar um listener global de scroll e resize para reposicionar todos os botões
// Isso é um pouco "força bruta", mas ajuda a manter os botões no lugar.
// Pode ser otimizado com um debounce/throttle.
function repositionAllPins() {
    if (currentInsertionMode.includes("button")) {
        pinButtons.forEach(pb => {
            if (document.body.contains(pb.textarea) && document.body.contains(pb.button)) {
                positionPinButton(pb.button, pb.textarea);
            }
        });
    }
}
window.addEventListener('scroll', repositionAllPins, true);
window.addEventListener('resize', repositionAllPins);
