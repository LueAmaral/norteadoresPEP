console.log("[ContentJS] Script injetado em:", window.location.href);
let targetElement = null;
let customMenu = null;
let currentInsertionMode = "both";
let pinButtons = [];

const INSERTION_MODE_KEY = "insertionMode";
const ALLOWED_SITES_KEY = "allowedSites";

async function showCustomMenu(textareaElement) {
    targetElement = textareaElement;

    if (customMenu) {
        customMenu.remove();
        document.removeEventListener("click", handleClickOutsideMenu, true);
    }

    customMenu = document.createElement("div");
    customMenu.id = "snippetMasterExtensionMenu";

    customMenu.style.position = "absolute";
    customMenu.style.backgroundColor = "#ffffff";
    customMenu.style.border = "1px solid #162b47";
    customMenu.style.padding = "10px";
    customMenu.style.zIndex = "2147483647";
    customMenu.style.color = "#384b5e";
    customMenu.style.maxHeight = "250px";
    customMenu.style.minWidth = "200px";
    customMenu.style.overflowY = "auto";
    customMenu.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
    customMenu.style.fontSize = "10px";
    customMenu.style.fontFamily = "Verdana, sans-serif";

    const textareaRect = textareaElement.getBoundingClientRect();
    const menuHeight = 250;
    const menuWidth = 200;

    let top = textareaRect.top + window.scrollY;
    let left = textareaRect.right + window.scrollX - menuWidth;

    if (left < 0) left = 5;
    if (left + menuWidth > window.innerWidth - 5) {
        left = window.innerWidth - menuWidth - 5;
    }
    if (top < 0) top = 5;
    if (
        top + menuHeight > window.innerHeight - 5 &&
        textareaRect.top > menuHeight
    ) {
        top = textareaRect.top + window.scrollY - menuHeight - 5;
    } else if (top + menuHeight > window.innerHeight - 5) {
        top = window.innerHeight - menuHeight - 5;
    }

    customMenu.style.top = `${top}px`;
    customMenu.style.left = `${left}px`;

    chrome.runtime.sendMessage(
        { action: "getSnippetsDataForInPageMenu" },
        (response) => {
            if (chrome.runtime.lastError) {
                console.error(
                    "[ContentJS - showCustomMenu] Erro ao buscar dados para o menu:",
                    chrome.runtime.lastError.message
                );
                customMenu.textContent = "Erro ao carregar snippets.";
            } else if (response && response.error) {
                customMenu.textContent = response.error;
            } else if (
                response &&
                response.snippetsForProfCat &&
                response.enabledCareLinesForProfCat
            ) {
                const {
                    snippetsForProfCat,
                    enabledCareLinesForProfCat,
                    lastSelectedCareLineForProfCat,
                } = response;
                if (
                    !enabledCareLinesForProfCat ||
                    enabledCareLinesForProfCat.length === 0
                ) {
                    customMenu.textContent =
                        "Nenhuma linha de cuidado habilitada para sua categoria profissional. Verifique as Opções.";
                } else {
                    customMenu.innerHTML = "";

                    const careLineLabel = document.createElement("label");
                    careLineLabel.textContent = "Linha de Cuidado: ";
                    careLineLabel.style.display = "block";
                    careLineLabel.style.marginBottom = "5px";
                    careLineLabel.style.color = "#162b47";
                    careLineLabel.style.fontWeight = "bold";
                    customMenu.appendChild(careLineLabel);

                    const careLineSelect = document.createElement("select");
                    careLineSelect.style.width = "100%";
                    careLineSelect.style.marginBottom = "10px";
                    careLineSelect.style.fontFamily = "Verdana, sans-serif";
                    careLineSelect.style.fontSize = "10px";
                    careLineSelect.style.border = "1px solid #ccc";
                    careLineSelect.style.backgroundColor = "#ffffff";
                    careLineSelect.style.color = "#384b5e";
                    careLineSelect.style.padding = "4px";

                    enabledCareLinesForProfCat.forEach((careLineName) => {
                        const option = document.createElement("option");
                        option.value = careLineName;
                        option.textContent = careLineName;
                        careLineSelect.appendChild(option);
                    });
                    customMenu.appendChild(careLineSelect);

                    const snippetListUL = document.createElement("ul");
                    snippetListUL.style.listStyleType = "none";
                    snippetListUL.style.paddingLeft = "0";
                    snippetListUL.style.maxHeight = "150px";
                    snippetListUL.style.overflowY = "auto";
                    customMenu.appendChild(snippetListUL);

                    function populateSnippetsForCareLine(selectedCareLine) {
                        snippetListUL.innerHTML = "";
                        const snippets = snippetsForProfCat[selectedCareLine];
                        if (snippets && Object.keys(snippets).length > 0) {
                            Object.entries(snippets).forEach(
                                ([snippetName, snippetData]) => {
                                    const li = document.createElement("li");
                                    li.textContent = snippetName;
                                    li.style.padding = "6px";
                                    li.style.borderBottom = "1px solid #eeeeee";
                                    li.style.cursor = "pointer";
                                    li.style.lineHeight = "1.3";
                                    li.onmouseover = () => {
                                        li.style.backgroundColor =
                                            "rgba(0, 173, 184, 0.15)";
                                    };
                                    li.onmouseout = () => {
                                        li.style.backgroundColor =
                                            "transparent";
                                    };
                                    li.addEventListener("click", () => {
                                        let contentToPaste = "";
                                        if (
                                            typeof snippetData === "object" &&
                                            snippetData !== null &&
                                            typeof snippetData.content !==
                                                "undefined"
                                        ) {
                                            contentToPaste =
                                                snippetData.content;
                                        } else if (
                                            typeof snippetData === "string"
                                        ) {
                                            contentToPaste = snippetData;
                                        } else {
                                            console.warn(
                                                "[ContentJS - showCustomMenu] Snippet format not recognized:",
                                                snippetName,
                                                snippetData
                                            );
                                        }
                                        pasteSnippetIntoTextarea(
                                            textareaElement,
                                            contentToPaste
                                        );
                                        if (customMenu) customMenu.remove();
                                        document.removeEventListener(
                                            "click",
                                            handleClickOutsideMenu,
                                            true
                                        );
                                    });
                                    snippetListUL.appendChild(li);
                                }
                            );
                        } else {
                            const li = document.createElement("li");
                            li.textContent =
                                "Nenhum snippet para esta linha de cuidado.";
                            li.style.padding = "6px";
                            li.style.fontStyle = "italic";
                            snippetListUL.appendChild(li);
                        }
                    }

                    careLineSelect.addEventListener("change", () => {
                        const newSelectedCareLine = careLineSelect.value;
                        populateSnippetsForCareLine(newSelectedCareLine);
                        chrome.runtime.sendMessage({
                            action: "setLastSelectedCareLine",
                            careLine: newSelectedCareLine,
                        });
                    });

                    if (
                        lastSelectedCareLineForProfCat &&
                        enabledCareLinesForProfCat.includes(
                            lastSelectedCareLineForProfCat
                        )
                    ) {
                        careLineSelect.value = lastSelectedCareLineForProfCat;
                    } else if (enabledCareLinesForProfCat.length > 0) {
                        careLineSelect.value = enabledCareLinesForProfCat[0];
                    }
                    populateSnippetsForCareLine(careLineSelect.value);
                }
            } else {
                customMenu.textContent = "Falha ao carregar snippets.";
            }
            document.body.appendChild(customMenu);
            document.addEventListener("click", handleClickOutsideMenu, true);
        }
    );
}

function handleClickOutsideMenu(event) {
    if (customMenu && !customMenu.contains(event.target)) {
        const isPinButtonClick = event.target.closest(
            "button.snippet-pin-button"
        );
        if (!isPinButtonClick) {
            customMenu.remove();
            customMenu = null;
            document.removeEventListener("click", handleClickOutsideMenu, true);
        }
    }
}

function pasteSnippetIntoTextarea(elementToPasteInto, content) {
    if (elementToPasteInto) {
        elementToPasteInto.focus();
        if (typeof elementToPasteInto.value !== "undefined") {
            const start = elementToPasteInto.selectionStart || 0;
            const end = elementToPasteInto.selectionEnd || 0;
            const currentValue = elementToPasteInto.value || "";
            elementToPasteInto.value =
                currentValue.substring(0, start) +
                content +
                currentValue.substring(end);
            const pos = start + content.length;
            elementToPasteInto.setSelectionRange(pos, pos);
        } else if (elementToPasteInto.isContentEditable) {
            document.execCommand(
                "insertHTML",
                false,
                content.replace(/\n/g, "<br>")
            );
        }
        elementToPasteInto.dispatchEvent(new Event("input", { bubbles: true }));
    }
}

function injectButtons() {
    const textareas = document.querySelectorAll(
        'textarea:not([data-pin-injected="true"]), div[contenteditable="true"]:not([data-pin-injected="true"])'
    );
    textareas.forEach((el) => {
        if (
            (el.offsetWidth === 0 && el.offsetHeight === 0) ||
            getComputedStyle(el).display === "none"
        ) {
            return;
        }
        el.setAttribute("data-pin-injected", "true");
        const button = document.createElement("button");
        button.innerHTML = "📌";
        button.classList.add("snippet-pin-button");
        button.dataset.snippetButton = "true";
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
        button.setAttribute("aria-label", "Inserir snippet");
        button.setAttribute("title", "Inserir snippet");

        const parent = el.offsetParent || document.body;
        if (
            parent !== document.body &&
            getComputedStyle(parent).position === "static"
        ) {
            parent.style.position = "relative";
        }
        parent.appendChild(button);
        positionPinButton(button, el);
        button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            showCustomMenu(el);
        });
        const resizeObserver = new ResizeObserver(() =>
            positionPinButton(button, el)
        );
        resizeObserver.observe(el);
        pinButtons.push({ button, textarea: el, observer: resizeObserver });
    });
}

function positionPinButton(button, textarea) {
    if (
        !textarea.offsetParent ||
        textarea.offsetWidth === 0 ||
        textarea.offsetHeight === 0 ||
        getComputedStyle(textarea).display === "none"
    ) {
        button.style.display = "none";
        return;
    }
    button.style.display = "flex";
    let top = textarea.offsetTop;
    let left = textarea.offsetLeft + textarea.offsetWidth + 2;
    button.style.top = `${top}px`;
    button.style.left = `${left}px`;
}

function removeAllPinButtons() {
    pinButtons.forEach(({ button, textarea, observer }) => {
        if (observer) observer.disconnect();
        if (button.parentElement) button.parentElement.removeChild(button);
        if (textarea) textarea.removeAttribute("data-pin-injected");
    });
    pinButtons = [];
}

const observer = new MutationObserver((mutationsList) => {
    if (currentInsertionMode === "button" || currentInsertionMode === "both") {
        for (const mutation of mutationsList) {
            if (
                mutation.type === "childList" &&
                mutation.addedNodes.length > 0
            ) {
                let needsInject = false;
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (
                            node.matches &&
                            (node.matches("textarea") ||
                                node.matches("div[contenteditable='true']"))
                        ) {
                            needsInject = true;
                        } else if (
                            node.querySelector &&
                            (node.querySelector("textarea") ||
                                node.querySelector(
                                    "div[contenteditable='true']"
                                ))
                        ) {
                            needsInject = true;
                        }
                    }
                });
                if (needsInject) {
                    injectButtons();
                    break;
                }
            }
        }
    }
});

const COMMAND_TRIGGER_CHAR = "/";
let currentCommand = "";
let commandActive = false;
let lastKeyWasSlash = false;

function handleTextInput(event) {
    const el = event.target;
    targetElement = el;

    if (el.tagName !== "TEXTAREA" && !el.isContentEditable) {
        resetCommandState();
        return;
    }
    if (customMenu && customMenu.isConnected) return;

    const key = event.key;

    if (
        !(currentInsertionMode === "command" || currentInsertionMode === "both")
    ) {
        resetCommandState();
        return;
    }

    if (key === COMMAND_TRIGGER_CHAR && !commandActive) {
        if (lastKeyWasSlash) {
            currentCommand = "//";
            commandActive = true;
            lastKeyWasSlash = false;
        } else {
            lastKeyWasSlash = true;
        }
        return;
    } else {
        lastKeyWasSlash = false;
    }

    if (commandActive) {
        if (key === "Backspace") {
            currentCommand = currentCommand.slice(0, -1);
            if (currentCommand.length < 2) {
                resetCommandState();
            }
            return;
        }

        if (key.length === 1 && /[\w\d_-]/.test(key)) {
            currentCommand += key;
            return;
        }

        if (key === " " || key === "Enter") {
            if (currentCommand.length > 2) {
                event.preventDefault();
                const commandName = currentCommand.slice(2).toLowerCase();

                chrome.runtime.sendMessage(
                    { action: "getSnippetByCommandName", command: commandName },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            console.error(
                                "[ContentJS] Error fetching snippet by command:",
                                chrome.runtime.lastError.message
                            );
                            resetCommandState();
                            return;
                        }
                        if (response && response.content) {
                            insertTextAtCursor(
                                el,
                                response.content,
                                currentCommand,
                                response.richText
                            );
                        } else {
                            console.log(
                                `[ContentJS] Command '${commandName}' (typed as '${currentCommand}') not found.`
                            );
                        }
                        resetCommandState();
                    }
                );
            } else {
                resetCommandState();
            }
            return;
        }

        if (
            key.length === 1 &&
            !/[\w\d_-]/.test(key) &&
            key !== COMMAND_TRIGGER_CHAR
        ) {
            resetCommandState();
        } else if (
            key.length > 1 &&
            ![
                "Shift",
                "Control",
                "Alt",
                "Meta",
                "ArrowLeft",
                "ArrowRight",
                "ArrowUp",
                "ArrowDown",
                "Home",
                "End",
                "PageUp",
                "PageDown",
                "Escape",
                "Tab",
            ].includes(key)
        ) {
            resetCommandState();
        }
        if (key === "Escape") {
            resetCommandState();
        }
    }
}

function resetCommandState() {
    currentCommand = "";
    commandActive = false;
}

function insertTextAtCursor(el, textToInsert, commandTyped, isRich) {
    if (!commandTyped || commandTyped.length === 0) {
        console.warn(
            "[ContentJS] insertTextAtCursor called with no commandTyped. Inserting text at cursor."
        );
        pasteSnippetIntoTextarea(el, textToInsert);
        return;
    }

    const htmlVersion = isRich
        ? textToInsert
        : textToInsert.replace(/\n/g, "<br>");

    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        const val = el.value || "";
        const selEnd = el.selectionEnd || 0;
        let commandActualStartPos = selEnd - commandTyped.length;

        if (commandActualStartPos < 0) {
            commandActualStartPos = 0;
        }

        if (val.substring(commandActualStartPos, selEnd) === commandTyped) {
            el.value =
                val.substring(0, commandActualStartPos) +
                textToInsert +
                val.substring(selEnd);
            const newCursorPos = commandActualStartPos + textToInsert.length;
            el.selectionStart = el.selectionEnd = newCursorPos;
        } else {
            console.warn(
                `[ContentJS] Mismatch when trying to delete command '${commandTyped}' in textarea. Expected text '${commandTyped}' not found immediately before cursor at ${selEnd}. Found: '${val.substring(
                    commandActualStartPos,
                    selEnd
                )}'. Inserting at current cursor.`
            );
            el.value =
                val.substring(0, selEnd) + textToInsert + val.substring(selEnd);
            const newCursorPos = selEnd + textToInsert.length;
            el.selectionStart = el.selectionEnd = newCursorPos;
        }
        el.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (el.isContentEditable) {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) {
            document.execCommand("insertHTML", false, htmlVersion);
            if (el)
                el.dispatchEvent(
                    new Event("input", { bubbles: true, cancelable: true })
                );
            return;
        }
        const range = sel.getRangeAt(0);
        const container = range.startContainer;
        const offset = range.startOffset;

        if (
            range.collapsed &&
            container.nodeType === Node.TEXT_NODE &&
            offset >= commandTyped.length &&
            container.textContent.substring(
                offset - commandTyped.length,
                offset
            ) === commandTyped
        ) {
            range.setStart(container, offset - commandTyped.length);
            range.deleteContents();
            const html = htmlVersion;
            const temp = document.createElement("div");
            temp.innerHTML = html;
            const frag = document.createDocumentFragment();
            while (temp.firstChild) frag.appendChild(temp.firstChild);
            range.insertNode(frag);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        } else {
            console.warn(
                "[ContentJS] Could not reliably select and delete command in contentEditable for replacement. Snippet will be inserted at current cursor."
            );
            document.execCommand("insertHTML", false, htmlVersion);
        }
        if (el)
            el.dispatchEvent(
                new Event("input", { bubbles: true, cancelable: true })
            );
    }
}

function applyInsertionMode(mode) {
    console.log(
        `[ContentJS] applyInsertionMode: raw mode='${mode}', typeof mode='${typeof mode}'`
    );
    const trimmedMode = typeof mode === "string" ? mode.trim() : mode || "both";
    currentInsertionMode = trimmedMode;
    console.log(
        `[ContentJS] applyInsertionMode: currentInsertionMode IS NOW '${currentInsertionMode}', typeof='${typeof currentInsertionMode}'`
    );

    console.log("[ContentJS] Removing existing command listener (if any).");
    document.removeEventListener("keydown", handleTextInput, true);
    resetCommandState();

    if (observer) {
        console.log("[ContentJS] Disconnecting observer.");
        observer.disconnect();
    }
    removeAllPinButtons();
    console.log("[ContentJS] Removed all pin buttons.");

    const enablesButton =
        currentInsertionMode === "button" || currentInsertionMode === "both";
    const enablesCommand =
        currentInsertionMode === "command" || currentInsertionMode === "both";

    console.log(
        `[ContentJS] Checking for button features: currentInsertionMode is '${currentInsertionMode}'. Enables Button? Result: ${enablesButton}`
    );
    if (enablesButton) {
        try {
            console.log(
                "[ContentJS] Attempting to INJECT pin buttons and start observer."
            );
            injectButtons();
            if (observer) {
                observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                });
            }
            console.log(
                "[ContentJS] INJECTED pin buttons and started observer."
            );
        } catch (e) {
            console.error(
                "[ContentJS] Error injecting pin buttons/starting observer:",
                e
            );
        }
    }

    console.log(
        `[ContentJS] Checking for command features: currentInsertionMode is '${currentInsertionMode}'. Enables Command? Result: ${enablesCommand}`
    );
    if (enablesCommand) {
        try {
            console.log(
                "[ContentJS] Attempting to ADD keydown listener for commands."
            );
            document.addEventListener("keydown", handleTextInput, true);
            console.log("[ContentJS] ADDED keydown listener for commands.");
        } catch (e) {
            console.error("[ContentJS] Error adding command listener:", e);
        }
    }
    console.log(`[ContentJS] MODE APPLIED: ${currentInsertionMode}`);
}

function initAfterAllowed() {
    chrome.runtime.sendMessage({ action: "getInsertionMode" }, (response) => {
        let mode = response && response.mode ? response.mode : "both";
        console.log(
            "[ContentJS] Modo de inserção inicial recebido (raw):",
            response ? response.mode : undefined
        );
        applyInsertionMode(mode);
    });

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === "local" && changes[INSERTION_MODE_KEY]) {
            let newMode = changes[INSERTION_MODE_KEY].newValue;
            console.log(
                "[ContentJS] Mudança no modo de inserção detectada (raw):",
                newMode
            );
            applyInsertionMode(newMode);
        }
    });

    function repositionAllPins() {
        if (
            currentInsertionMode === "button" ||
            currentInsertionMode === "both"
        ) {
            pinButtons.forEach((pb) => {
                if (
                    document.body.contains(pb.textarea) &&
                    document.body.contains(pb.button)
                ) {
                    positionPinButton(pb.button, pb.textarea);
                }
            });
        }
    }
    window.addEventListener("scroll", repositionAllPins, true);
    window.addEventListener("resize", repositionAllPins);
}

chrome.storage.local.get(ALLOWED_SITES_KEY, (res) => {
    const allowed = res[ALLOWED_SITES_KEY] || [];
    const host = window.location.hostname;
    if (allowed.length > 0 && !allowed.some((s) => host.includes(s))) {
        console.log(
            `[ContentJS] Site '${host}' não está na lista de permitidos. Extensão desativada.`
        );
        return;
    }
    initAfterAllowed();
});
