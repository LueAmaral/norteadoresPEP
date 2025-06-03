let targetElement = null;
let customMenu = null;
let currentInsertionMode = "both";
let pinButtons = [];

const INSERTION_MODE_KEY = "insertionMode";

function createMenuElement() {
    const menu = document.createElement("div");
    menu.id = "snippetMasterExtensionMenu";
    menu.classList.add("snippet-master-menu");
    return menu;
}

function positionMenu(menuElement, textareaElement) {
    const textareaRect = textareaElement.getBoundingClientRect();
    // Use computed style for menu dimensions if they are set in CSS, otherwise fallback
    const computedStyle = getComputedStyle(menuElement);
    const menuHeight = parseInt(computedStyle.maxHeight, 10) || 250; // Fallback if not set
    const menuWidth = parseInt(computedStyle.minWidth, 10) || 200;  // Fallback if not set

    let top = textareaRect.top + window.scrollY;
    let left = textareaRect.right + window.scrollX - menuWidth;

    if (left < 0) left = 5;
    if (left + menuWidth > window.innerWidth - 5) {
        left = window.innerWidth - menuWidth - 5;
    }
    if (top < 0) top = 5;
    if (top + menuHeight > window.innerHeight - 5 && textareaRect.top > menuHeight) {
        top = textareaRect.top + window.scrollY - menuHeight - 5; // Position above if not enough space below
    } else if (top + menuHeight > window.innerHeight - 5) {
        top = Math.max(5, window.innerHeight - menuHeight - 5); // Adjust if still too low, ensuring it's not off-screen
    }

    menuElement.style.top = `${top}px`;
    menuElement.style.left = `${left}px`;
}

function createCareLineSelect(enabledCareLinesForProfCat, lastSelectedCareLineForProfCat, snippetsForProfCat, snippetListUL, textareaElement) {
    const careLineLabel = document.createElement("label");
    careLineLabel.textContent = "Linha de Cuidado: ";
    careLineLabel.classList.add("snippet-menu-label");

    const careLineSelect = document.createElement("select");
    careLineSelect.classList.add("snippet-menu-select");

    enabledCareLinesForProfCat.forEach(careLineName => {
        const option = document.createElement("option");
        option.value = careLineName;
        option.textContent = careLineName;
        careLineSelect.appendChild(option);
    });

    careLineSelect.addEventListener("change", () => {
        const newSelectedCareLine = careLineSelect.value;
        populateSnippetsList(snippetListUL, snippetsForProfCat, newSelectedCareLine, textareaElement);
        chrome.runtime.sendMessage({ action: "setLastSelectedCareLine", careLine: newSelectedCareLine });
    });

    if (lastSelectedCareLineForProfCat && enabledCareLinesForProfCat.includes(lastSelectedCareLineForProfCat)) {
        careLineSelect.value = lastSelectedCareLineForProfCat;
    } else if (enabledCareLinesForProfCat.length > 0) {
        careLineSelect.value = enabledCareLinesForProfCat[0];
        // Optionally, save this default selection back to storage if desired
        // chrome.runtime.sendMessage({ action: "setLastSelectedCareLine", careLine: enabledCareLinesForProfCat[0] });
    }

    return { careLineLabel, careLineSelect };
}

function populateSnippetsList(snippetListUL, snippetsForProfCat, selectedCareLine, textareaElement) {
    snippetListUL.innerHTML = ""; // Clear previous snippets
    const snippets = snippetsForProfCat[selectedCareLine];

    if (snippets && Object.keys(snippets).length > 0) {
        Object.entries(snippets).forEach(([snippetName, snippetData]) => {
            const li = document.createElement("li");
            li.textContent = snippetName;
            li.classList.add("snippet-menu-item");
            li.addEventListener("click", () => {
                let contentToPaste = "";
                if (typeof snippetData === 'object' && snippetData !== null && typeof snippetData.content !== 'undefined') {
                    contentToPaste = snippetData.content;
                } else if (typeof snippetData === 'string') {
                    contentToPaste = snippetData;
                }
                pasteSnippetIntoTextarea(textareaElement, contentToPaste);
                if (customMenu) customMenu.remove();
                document.removeEventListener("click", handleClickOutsideMenu, true);
            });
            snippetListUL.appendChild(li);
        });
    } else {
        const li = document.createElement("li");
        li.textContent = "Nenhum snippet para esta linha de cuidado.";
        li.classList.add("snippet-menu-empty-item");
        snippetListUL.appendChild(li);
    }
}

async function showCustomMenu(textareaElement) {
    targetElement = textareaElement;

    if (customMenu) {
        customMenu.remove();
        document.removeEventListener("click", handleClickOutsideMenu, true);
    }

    customMenu = createMenuElement();
    // Append to body early to allow getComputedStyle in positionMenu (if needed for dimensions)
    document.body.appendChild(customMenu);
    positionMenu(customMenu, textareaElement);


    chrome.runtime.sendMessage({ action: "getSnippetsDataForInPageMenu" }, (response) => {
        if (chrome.runtime.lastError || (response && response.error)) {
            customMenu.textContent = response && response.error ? response.error : "Erro ao carregar snippets.";
            return;
        }

        if (response && response.snippetsForProfCat && response.enabledCareLinesForProfCat) {
            const { snippetsForProfCat, enabledCareLinesForProfCat, lastSelectedCareLineForProfCat } = response;

            if (!enabledCareLinesForProfCat || enabledCareLinesForProfCat.length === 0) {
                customMenu.textContent = "Nenhuma linha de cuidado habilitada. Verifique as Opções.";
                return;
            }

            customMenu.innerHTML = ''; // Clear previous content (like error messages)

            const snippetListUL = document.createElement("ul");
            snippetListUL.classList.add("snippet-menu-list");

            const { careLineLabel, careLineSelect } = createCareLineSelect(
                enabledCareLinesForProfCat,
                lastSelectedCareLineForProfCat,
                snippetsForProfCat, /* Pass snippetsForProfCat */
                snippetListUL,      /* Pass snippetListUL */
                textareaElement     /* Pass textareaElement */
            );

            customMenu.appendChild(careLineLabel);
            customMenu.appendChild(careLineSelect);
            customMenu.appendChild(snippetListUL);

            // Initial population of snippets for the selected care line
            populateSnippetsList(snippetListUL, snippetsForProfCat, careLineSelect.value, textareaElement);
        } else {
            customMenu.textContent = "Falha ao carregar snippets (resposta inesperada).";
        }
        // Event listener for clicks outside the menu should be added *after* menu is populated
        // and only if it's not already added.
        document.removeEventListener("click", handleClickOutsideMenu, true); // Remove if existing
        document.addEventListener("click", handleClickOutsideMenu, true);
    });
}

function handleClickOutsideMenu(event) {
    if (customMenu && !customMenu.contains(event.target) && !event.target.closest('button.snippet-pin-button')) {
        customMenu.remove();
        customMenu = null;
        document.removeEventListener("click", handleClickOutsideMenu, true);
    }
}


function pasteSnippetIntoTextarea(elementToPasteInto, content) {
    if (elementToPasteInto) {
        elementToPasteInto.focus();
        if (typeof elementToPasteInto.value !== "undefined") {
            const start = elementToPasteInto.selectionStart || 0;
            const end = elementToPasteInto.selectionEnd || 0;
            const currentValue = elementToPasteInto.value || "";
            elementToPasteInto.value = currentValue.substring(0, start) + content + currentValue.substring(end);
            const pos = start + content.length;
            elementToPasteInto.setSelectionRange(pos, pos);
        } else if (elementToPasteInto.isContentEditable) {
            document.execCommand("insertText", false, content);
        }
        elementToPasteInto.dispatchEvent(new Event("input", { bubbles: true }));
    }
}

function injectButtons() {
    const textareas = document.querySelectorAll('textarea:not([data-pin-injected="true"]), div[contenteditable="true"]:not([data-pin-injected="true"])');
    textareas.forEach((el) => {
        if ((el.offsetWidth === 0 && el.offsetHeight === 0) || getComputedStyle(el).display === 'none') {
            return;
        }
        el.setAttribute('data-pin-injected', 'true');

        const button = document.createElement("button");
        button.innerHTML = "📌"; // Using an emoji/icon
        button.classList.add("snippet-pin-button"); // Styles are in styles.css
        button.dataset.snippetButton = "true";
        button.setAttribute('aria-label', 'Inserir snippet');
        button.setAttribute('title', 'Inserir snippet');

        const parent = el.offsetParent || document.body; // Prefer offsetParent for positioning
        if (parent !== document.body && getComputedStyle(parent).position === 'static') {
            parent.style.position = 'relative';
        }
        parent.appendChild(button);
        positionPinButton(button, el);
        button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            showCustomMenu(el);
        });
        const resizeObserver = new ResizeObserver(() => positionPinButton(button, el));
        resizeObserver.observe(el);
        pinButtons.push({ button, textarea: el, observer: resizeObserver });
    });
}

function positionPinButton(button, textarea) {
    if (!textarea.offsetParent || textarea.offsetWidth === 0 || textarea.offsetHeight === 0 || getComputedStyle(textarea).display === 'none') {
        button.style.display = 'none'; // Hide button if textarea is not visible
        return;
    }
    button.style.display = 'flex'; // Ensure it's visible if textarea is

    // Position relative to the textarea
    let top = textarea.offsetTop;
    let left = textarea.offsetLeft + textarea.offsetWidth + 2; // 2px offset from the right edge

    button.style.top = `${top}px`;
    button.style.left = `${left}px`;
}

function removeAllPinButtons() {
    pinButtons.forEach(({ button, textarea, observer }) => {
        if (observer) observer.disconnect();
        if (button.parentElement) button.parentElement.removeChild(button);
        if (textarea) textarea.removeAttribute('data-pin-injected');
    });
    pinButtons = [];
}

const observer = new MutationObserver((mutationsList) => {
    if (currentInsertionMode === "button" || currentInsertionMode === "both") {
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                let needsInject = false;
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.matches && (node.matches("textarea") || node.matches("div[contenteditable='true']"))) {
                            needsInject = true;
                        } else if (node.querySelector && (node.querySelector("textarea") || node.querySelector("div[contenteditable='true']"))) {
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

function handleTextInput(event) {
    const el = event.target;
    targetElement = el;

    if (el.tagName !== "TEXTAREA" && !el.isContentEditable) {
        resetCommandState();
        return;
    }
    if (customMenu && customMenu.isConnected) return;

    const key = event.key;

    if (!(currentInsertionMode === "command" || currentInsertionMode === "both")) {
        resetCommandState();
        return;
    }

    if (key === COMMAND_TRIGGER_CHAR && !commandActive) {
        currentCommand = key;
        commandActive = true;
        return;
    }

    if (commandActive) {
        if (key === "Backspace") {
            currentCommand = currentCommand.slice(0, -1);
            // Check if the command is now empty or just the trigger char without the trigger char actually being in the input
            if (currentCommand === "" ||
                (currentCommand === COMMAND_TRIGGER_CHAR &&
                 ( (el.value && el.selectionEnd > 0 && el.value.charAt(el.selectionEnd - 1) !== COMMAND_TRIGGER_CHAR) ||
                   (!el.value && el.isContentEditable && sel.rangeCount > 0 && sel.getRangeAt(0).startOffset > 0 && sel.getRangeAt(0).startContainer.textContent.charAt(sel.getRangeAt(0).startOffset -1) !== COMMAND_TRIGGER_CHAR )
                 )
                )
            ) {
                resetCommandState();
            }
            return;
        }

        // Allow alphanumeric and underscore for command name
        if (key.length === 1 && /^[a-z0-9_]$/i.test(key)) {
            currentCommand += key;
            return;
        }

        if (key === " " || key === "Enter") {
            if (currentCommand.length > 1) {
                event.preventDefault();
                const commandName = currentCommand.slice(1).toLowerCase();

                chrome.runtime.sendMessage({ action: "getSnippetByCommandName", command: commandName }, (response) => {
                    if (chrome.runtime.lastError) {
                        if (chrome.runtime.lastError || (response && response.error)) {
                            // Optionally, notify user command failed if desired, for now just resets
                            resetCommandState();
                            return;
                        }
                        if (response && response.content) {
                            insertTextAtCursor(el, response.content, currentCommand);
                        }
                        resetCommandState();
                    });
                } else {
                     // Command was just "/" or empty after backspace
                    resetCommandState();
                }
                return; // Important to return after handling Enter/Space
            }
            // If the key is not alphanumeric, not underscore, not Backspace, and not Enter/Space, reset.
            // Also allow specific control keys to not reset the command state.
            const allowedControlKeys = ["Shift", "Control", "Alt", "Meta", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown", "Tab"];
            if (key === "Escape") {
                 resetCommandState();
                 return;
            }
            if (key.length === 1 && !/^[a-z0-9_]$/i.test(key) && key !== COMMAND_TRIGGER_CHAR) {
                 resetCommandState();
            } else if (key.length > 1 && !allowedControlKeys.includes(key)) {
                 resetCommandState();
            }
        }
    }


function resetCommandState() {
    currentCommand = "";
    commandActive = false;
}

function insertTextAtCursor(el, textToInsert, commandTyped) {
    if (!commandTyped || commandTyped.length === 0) {
        pasteSnippetIntoTextarea(el, textToInsert);
        return;
    }

    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        const val = el.value || "";
        const selEnd = el.selectionEnd || 0;
        let commandActualStartPos = selEnd - commandTyped.length;

        if (commandActualStartPos < 0) { commandActualStartPos = 0; }

        if (val.substring(commandActualStartPos, selEnd) === commandTyped) {
            el.value = val.substring(0, commandActualStartPos) + textToInsert + val.substring(selEnd);
            const newCursorPos = commandActualStartPos + textToInsert.length;
            el.selectionStart = el.selectionEnd = newCursorPos;
        } else {
            el.value = val.substring(0, selEnd) + textToInsert + val.substring(selEnd);
            const newCursorPos = selEnd + textToInsert.length;
            el.selectionStart = el.selectionEnd = newCursorPos;
        }
        el.dispatchEvent(new Event("input", { bubbles: true }));

    } else if (el.isContentEditable) {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) {
            document.execCommand("insertText", false, textToInsert);
            if (el) el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            return;
        }
        const range = sel.getRangeAt(0);
        const container = range.startContainer;
        const offset = range.startOffset;

        if (range.collapsed && container.nodeType === Node.TEXT_NODE &&
            offset >= commandTyped.length &&
            container.textContent.substring(offset - commandTyped.length, offset) === commandTyped) {
            range.setStart(container, offset - commandTyped.length);
            range.deleteContents();
            range.insertNode(document.createTextNode(textToInsert));
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        } else {
            document.execCommand("insertText", false, textToInsert);
        }
        if (el) el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    }
}

function applyInsertionMode(mode) {
    const trimmedMode = typeof mode === 'string' ? mode.trim() : (mode || 'both');
    currentInsertionMode = trimmedMode;

    document.removeEventListener("keydown", handleTextInput, true);
    resetCommandState();

    if (observer) {
        observer.disconnect();
    }
    removeAllPinButtons();

    const enablesButton = currentInsertionMode === "button" || currentInsertionMode === "both";
    const enablesCommand = currentInsertionMode === "command" || currentInsertionMode === "both";

    if (enablesButton) {
        try {
            injectButtons();
            if (observer) {
                observer.observe(document.body, { childList: true, subtree: true });
            }
        } catch (e) {
        }
    }

    if (enablesCommand) {
        try {
            document.addEventListener("keydown", handleTextInput, true);
        } catch (e) {
        }
    }
}

chrome.runtime.sendMessage({ action: "getInsertionMode" }, (response) => {
    let mode = response && response.mode ? response.mode : "both";
    applyInsertionMode(mode);
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "local" && changes[INSERTION_MODE_KEY]) {
        let newMode = changes[INSERTION_MODE_KEY].newValue;
        applyInsertionMode(newMode);
    }
});

function repositionAllPins() {
    if (currentInsertionMode === "button" || currentInsertionMode === "both") {
        pinButtons.forEach(pb => {
            if (document.body.contains(pb.textarea) && document.body.contains(pb.button)) {
                positionPinButton(pb.button, pb.textarea);
            }
        });
    }
}
window.addEventListener('scroll', repositionAllPins, true);
window.addEventListener('resize', repositionAllPins);
