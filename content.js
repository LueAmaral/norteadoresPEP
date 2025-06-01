// Guarda o elemento alvo para colar o snippet
let targetElement = null;
let customMenu = null; // Referência ao menu customizado

// Função para criar e mostrar o menu customizado
async function showCustomMenu(textareaElement) {
    targetElement = textareaElement;

    // Remove menu anterior, se existir
    if (customMenu) {
        customMenu.remove();
        customMenu = null;
    }

    // Cria o contêiner do menu
    customMenu = document.createElement("div");
    customMenu.style.position = "absolute";
    customMenu.style.border = "1px solid #ccc";
    customMenu.style.background = "white";
    customMenu.style.padding = "10px";
    customMenu.style.zIndex = "10000"; // Para ficar sobre outros elementos
    customMenu.style.boxShadow = "0px 2px 5px rgba(0,0,0,0.2)";
    customMenu.style.fontFamily = "Arial, sans-serif";
    customMenu.style.fontSize = "14px";

    // Posiciona o menu abaixo da textarea
    const rect = textareaElement.getBoundingClientRect();
    let topPosition = window.scrollY + rect.bottom + 5;
    let leftPosition = window.scrollX + rect.left;
    customMenu.style.top = `${topPosition}px`;
    customMenu.style.left = `${leftPosition}px`;
    customMenu.style.minWidth = `280px`; // Largura mínima para o menu
    customMenu.style.maxWidth = `450px`; // Largura máxima

    // Adiciona um título
    const title = document.createElement("h4");
    title.textContent = "Selecionar Máscara";
    title.style.margin = "0 0 10px 0";
    customMenu.appendChild(title);

    // Busca dados do background script
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

        // Cria o select de Linhas de Cuidado
        const careLineLabel = document.createElement("label");
        careLineLabel.textContent = "Linha de Cuidado: ";
        careLineLabel.style.display = "block";
        careLineLabel.style.marginBottom = "5px";
        customMenu.appendChild(careLineLabel);

        const careLineSelect = document.createElement("select");
        careLineSelect.style.width = "100%";
        careLineSelect.style.marginBottom = "10px";
        customMenu.appendChild(careLineSelect);

        // Div para os tipos de snippet (Subjetivo, Objetivo, etc.)
        const snippetTypesContainer = document.createElement("div");
        snippetTypesContainer.style.marginTop = "10px";
        customMenu.appendChild(snippetTypesContainer);

        // Popula select de Linhas de Cuidado
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

        // Função para renderizar os tipos de snippet para uma Linha de Cuidado
        function renderSnippetTypes(selectedCareLine) {
            snippetTypesContainer.innerHTML = "";
            if (!selectedCareLine || !snippetsForProfCat[selectedCareLine]) {
                snippetTypesContainer.innerHTML = "<p>Selecione uma linha de cuidado válida.</p>";
                return;
            }

            const snippetTypes = snippetsForProfCat[selectedCareLine]; // Ex: { Subjetivo: "...", Objetivo: "..." }
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
                    e.stopPropagation(); // Evita que o clique feche o menu imediatamente se o listener de click outside estiver ativo
                    pasteSnippetIntoTextarea(typeContent);
                    if (customMenu) customMenu.remove();
                    document.removeEventListener("click", handleClickOutsideMenu, true);
                });
                list.appendChild(li);
            });
            // Remove a última borda
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
            // Salva esta como a última selecionada se nenhuma válida existia ou a anterior não é mais válida
            chrome.runtime.sendMessage({ action: "setLastSelectedCareLine", careLine: careLineToRenderInitially });
        }

        if (careLineToRenderInitially) {
            renderSnippetTypes(careLineToRenderInitially);
        } else {
            snippetTypesContainer.innerHTML = "<p>Nenhuma linha de cuidado disponível ou selecionada.</p>";
        }

        document.body.appendChild(customMenu);
        // Adiciona listener para fechar o menu ao clicar fora
        // Timeout para evitar que o clique que abriu o menu o feche imediatamente
        setTimeout(() => {
            document.addEventListener("click", handleClickOutsideMenu, true);
        }, 0);
    });
}

function handleClickOutsideMenu(event) {
    if (customMenu && !customMenu.contains(event.target)) {
        // Verifica se o clique não foi no botão que abre o menu
        const isButtonClick = event.target.closest('button[data-snippet-button="true"]');
        if (!isButtonClick) {
            customMenu.remove();
            customMenu = null;
            document.removeEventListener("click", handleClickOutsideMenu, true);
        }
    }
}

// Função para colar o snippet na textarea alvo
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
    const textareas = document.querySelectorAll("textarea");
    textareas.forEach((el) => {
        if (el.dataset.snippetInjected) return;
        el.dataset.snippetInjected = "1";

        const btn = document.createElement("button");
        btn.textContent = "📌";
        btn.title = "Inserir máscara (menu na página)";
        btn.style.marginLeft = "4px";
        btn.style.cursor = "pointer";
        btn.style.padding = "2px 6px";
        btn.style.fontSize = "12px";
        btn.dataset.snippetButton = "true"; // Marca o botão

        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Se o menu já estiver aberto e for para o mesmo target, fecha.
            // Senão, abre/move o menu.
            if (customMenu && targetElement === el) {
                customMenu.remove();
                customMenu = null;
                document.removeEventListener("click", handleClickOutsideMenu, true);
            } else {
                showCustomMenu(el);
            }
        });
        el.parentNode.insertBefore(btn, el.nextSibling);
    });
}

// Ao carregar ou mutações dinâmicas, tenta injetar
injectButtons();
new MutationObserver(injectButtons).observe(document.body, { childList: true, subtree: true });

// Listener para mensagens (se necessário no futuro, por exemplo, colar via atalho)
/*
chrome.runtime.onMessage.addListener((msg) => {
    // Exemplo: se você reintroduzir um atalho de teclado que precise colar algo
    // if (msg.action === "pasteViaShortcut" && targetElement) {
    //     pasteSnippetIntoTextarea(msg.content);
    // }
});
*/
