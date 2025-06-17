if (typeof window !== "undefined" && window.location) {
    console.log("[ContentJS] Script injetado em:", window.location.href);
}
let targetElement = null;
let customMenu = null;
let currentInsertionMode = "both";
let pinButtons = [];
let pinsTemporarilyDisabledForThisTab = false;
const SESSION_DISABLED_FLAG_KEY = 'pinsDisabledForTab'; // For content script's session storage

const INSERTION_MODE_KEY = "insertionMode";
const ALLOWED_SITES_KEY = "allowedSites";

async function checkInitialPinDisabledState() {
    try {
        // First, check content script's sessionStorage (quick check for current page load)
        if (sessionStorage.getItem(SESSION_DISABLED_FLAG_KEY) === 'true') {
            console.log('[ContentJS] Pins initially disabled for this tab (sessionStorage flag).');
            pinsTemporarilyDisabledForThisTab = true;
            // No need to call removeAllPinButtons() here, as injectButtons will be blocked.
            return; // Stop further checks if sessionStorage flag is already set
        }

        // If no sessionStorage flag, check chrome.storage.session via background
        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: "getTabId" }, (res) => {
                if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
                if (res && res.tabId) resolve(res);
                else reject(new Error("Failed to get Tab ID from background."));
            });
        });
        const currentTabId = response.tabId;

        console.log('[ContentJS] checkInitialPinDisabledState: Asking background if tab', currentTabId, 'is disabled.');
        const bgResponse = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: "checkIfTabIsDisabled", tabId: currentTabId }, (response) => {
                if (chrome.runtime.lastError) {
                    return reject(new Error(chrome.runtime.lastError.message));
                }
                if (response.error) {
                    return reject(new Error(response.error));
                }
                resolve(response);
            });
        });

        if (bgResponse.isDisabled) {
            console.log('[ContentJS] Pins initially disabled for this tab (from background check).');
            pinsTemporarilyDisabledForThisTab = true;
            sessionStorage.setItem(SESSION_DISABLED_FLAG_KEY, 'true');
        } else {
            console.log('[ContentJS] Pins initially enabled for this tab (from background check).');
            // Ensure local sessionStorage flag is also cleared if background says not disabled
            sessionStorage.removeItem(SESSION_DISABLED_FLAG_KEY);
            pinsTemporarilyDisabledForThisTab = false; // Explicitly set to false
        }
    } catch (error) {
        console.warn("[ContentJS] Error checking initial pin disabled state:", error.message);
        // Proceed with pins enabled if there's an error, or decide on a safer default.
        // For now, default to enabled if check fails.
        pinsTemporarilyDisabledForThisTab = false;
    }
    // After state is determined, existing logic that calls injectButtons (e.g. in applyInsertionMode)
    // will run, and injectButtons will use the 'pinsTemporarilyDisabledForThisTab' flag.
}

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
    if (pinsTemporarilyDisabledForThisTab) {
        console.log("[ContentJS] Pin injection skipped as pins are temporarily disabled for this tab.");
        return;
    }
    // Also check sessionStorage as a backup, though the global flag should be primary
    if (sessionStorage.getItem(SESSION_DISABLED_FLAG_KEY) === 'true' && !pinsTemporarilyDisabledForThisTab) {
        // This case might happen if the global flag wasn't set but sessionStorage was (e.g. script re-injected without full reload)
        console.log("[ContentJS] Pin injection skipped due to sessionStorage flag (re-syncing global flag).");
        pinsTemporarilyDisabledForThisTab = true;
        return;
    }

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

        // Check if the element is disabled
        if (el.disabled || el.hasAttribute('disabled')) {
            console.log("[ContentJS] Skipping disabled element:", el);
            return;
        }

        el.setAttribute("data-pin-injected", "true");
        const button = document.createElement("button");
        button.innerHTML = "📌";
        button.classList.add("snippet-pin-button");
        button.dataset.snippetButton = "true";
        button.style.position = "absolute";

        // Dynamically set z-index
        const computedZIndex = window.getComputedStyle(el).zIndex;
        const elementZIndexNumber = parseInt(computedZIndex, 10);
        if (!isNaN(elementZIndexNumber)) {
            button.style.zIndex = elementZIndexNumber + 1;
        } else {
            button.style.zIndex = 1; // Default z-index if element's zIndex is 'auto' or not a number
        }

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

const observer =
    typeof MutationObserver !== "undefined"
        ? new MutationObserver((mutationsList) => {
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
})
        : null;

const COMMAND_TRIGGER_CHAR = "/";
const TEXT_NODE_TYPE = typeof Node !== "undefined" ? Node.TEXT_NODE : 3;
let pendingCommandRequest = null;

let snippetCommands = [];
let snippetCommandsLoading = false;

function extractCommands(obj) {
    for (const key in obj) {
        const val = obj[key];
        if (val && typeof val === "object") {
            if (typeof val.command === "string") {
                snippetCommands.push(val.command);
            } else {
                extractCommands(val);
            }
        }
    }
}

function loadSnippetCommands(callback) {
    if (snippetCommandsLoading) {
        if (callback) setTimeout(callback, 50);
        return;
    }
    snippetCommandsLoading = true;
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: "getAllSnippets" }, (response) => {
            snippetCommandsLoading = false;
            if (chrome.runtime.lastError) {
                console.error("[ContentJS] Error fetching snippets:", chrome.runtime.lastError.message);
            } else if (response && typeof response === "object" && Object.keys(response).length > 0) {
                snippetCommands = [];
                extractCommands(response);
            } else if (typeof require === "function") {
                try {
                    const localSnippets = require("./snippets.json");
                    snippetCommands = [];
                    extractCommands(localSnippets);
                } catch (e) {
                    console.warn("[ContentJS] Fallback snippet load failed:", e.message);
                }
            }
            if (callback) callback();
        });
    } else if (typeof require === "function") {
        try {
            const localSnippets = require("./snippets.json");
            snippetCommands = [];
            extractCommands(localSnippets);
        } catch (e) {
            // ignore
        }
        snippetCommandsLoading = false;
        if (callback) callback();
    } else {
        snippetCommandsLoading = false;
        if (callback) callback();
    }
}

loadSnippetCommands();

let autocompleteMenu = null;
let selectedSuggestionIndex = -1;

if (typeof document !== "undefined") {
    document.addEventListener("click", (e) => {
        if (autocompleteMenu && !autocompleteMenu.contains(e.target)) {
            hideAutocompleteMenu();
        }
    });

    document.addEventListener(
        "blur",
        () => {
            hideAutocompleteMenu();
        },
        true
    );
}

function createAutocompleteMenu() {
    const div = document.createElement("div");
    div.style.position = "absolute";
    div.style.background = "#fff";
    div.style.border = "1px solid #ccc";
    div.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
    div.style.fontSize = "12px";
    div.style.fontFamily = "Verdana, sans-serif";
    div.style.zIndex = 2147483647;
    div.style.maxHeight = "150px";
    div.style.overflowY = "auto";
    return div;
}

function getCaretClientRect(el) {
    if (typeof window === "undefined") return null;
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        const style = window.getComputedStyle(el);
        const div = document.createElement("div");
        const props = [
            "fontFamily",
            "fontSize",
            "fontWeight",
            "fontStyle",
            "letterSpacing",
            "textTransform",
            "padding",
            "border",
            "boxSizing",
            "whiteSpace",
            "wordWrap",
            "lineHeight",
        ];
        props.forEach((p) => {
            div.style[p] = style[p];
        });
        div.style.position = "absolute";
        div.style.visibility = "hidden";
        div.style.whiteSpace = "pre-wrap";
        div.style.wordWrap = "break-word";
        div.style.left = "-9999px";
        div.style.top = "0";
        div.style.width = el.offsetWidth + "px";
        div.textContent = el.value.substring(0, el.selectionStart || 0);
        const span = document.createElement("span");
        span.textContent = "\u200b"; // zero-width space
        div.appendChild(span);
        document.body.appendChild(div);
        const rect = span.getBoundingClientRect();
        document.body.removeChild(div);
        return rect;
    } else if (el.isContentEditable && typeof window.getSelection === "function") {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return null;
        const range = sel.getRangeAt(0).cloneRange();
        range.collapse(false);
        let rect = range.getClientRects()[0];
        if (!rect) {
            const span = document.createElement("span");
            span.appendChild(document.createTextNode("\u200b"));
            range.insertNode(span);
            rect = span.getBoundingClientRect();
            span.parentNode.removeChild(span);
            sel.removeAllRanges();
            sel.addRange(range);
        }
        return rect;
    }
    return null;
}

function hideAutocompleteMenu() {
    if (autocompleteMenu && autocompleteMenu.parentNode) {
        autocompleteMenu.parentNode.removeChild(autocompleteMenu);
    }
    autocompleteMenu = null;
    selectedSuggestionIndex = -1;
}

function showAutocompleteMenu(el, suggestions) {
    if (!autocompleteMenu) {
        autocompleteMenu = createAutocompleteMenu();
        document.body.appendChild(autocompleteMenu);
    }
    autocompleteMenu.innerHTML = "";
    suggestions.forEach((s, idx) => {
        const item = document.createElement("div");
        item.textContent = s.command;
        item.style.padding = "4px";
        item.style.cursor = "pointer";
        item.addEventListener("mouseover", () => selectSuggestion(idx));
        item.addEventListener("mousedown", (e) => {
            e.preventDefault();
            applySuggestion(el, s);
        });
        autocompleteMenu.appendChild(item);
    });
    const elRect = el.getBoundingClientRect();
    const caretRect = getCaretClientRect(el) || elRect;
    autocompleteMenu.style.minWidth = elRect.width + "px";
    autocompleteMenu.style.left = caretRect.left + window.scrollX + "px";
    autocompleteMenu.style.top = caretRect.bottom + window.scrollY + "px";
    autocompleteMenu.style.visibility = "hidden";
    selectedSuggestionIndex = 0;
    highlightSuggestion();
    const menuHeight = autocompleteMenu.offsetHeight;
    let top = caretRect.bottom + window.scrollY;
    if (top + menuHeight > window.innerHeight) {
        top = caretRect.top + window.scrollY - menuHeight;
    }
    autocompleteMenu.style.top = top + "px";
    autocompleteMenu.style.visibility = "visible";
}

function selectSuggestion(index) {
    selectedSuggestionIndex = index;
    highlightSuggestion();
}

function highlightSuggestion() {
    if (!autocompleteMenu) return;
    Array.from(autocompleteMenu.children).forEach((child, idx) => {
        child.style.background = idx === selectedSuggestionIndex ? "#e6f0ff" : "transparent";
    });
}

function applySuggestion(el, snippet) {
    const commandTyped = getCommandBeforeCursor(el);
    if (!commandTyped) return;
    if (typeof chrome !== "undefined" && chrome.runtime) {
        chrome.runtime.sendMessage(
            { action: "getSnippetByCommandName", command: snippet.command },
            (response) => {
                if (chrome.runtime.lastError) {
                    console.error(
                        "[ContentJS] Error fetching snippet:",
                        chrome.runtime.lastError.message
                    );
                    hideAutocompleteMenu();
                    return;
                }
                if (response && response.content) {
                    insertTextAtCursor(
                        el,
                        response.content,
                        commandTyped,
                        response.richText
                    );
                }
                hideAutocompleteMenu();
            }
        );
    } else {
        hideAutocompleteMenu();
    }
}

function updateAutocomplete(el) {
    const commandTyped = getCommandBeforeCursor(el);
    if (!commandTyped || commandTyped.length < 2) {
        hideAutocompleteMenu();
        return;
    }
    if (snippetCommands.length === 0) {
        loadSnippetCommands(() => updateAutocomplete(el));
        return;
    }
    const typed = commandTyped.slice(2).toLowerCase();
    const matches = snippetCommands
        .filter((c) => c.toLowerCase().startsWith(typed))
        .slice(0, 5)
        .map((c) => ({ command: c }));
    if (matches.length === 0) {
        hideAutocompleteMenu();
        return;
    }
    showAutocompleteMenu(el, matches);
}

function getCommandBeforeCursor(el) {
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        const pos = el.selectionStart || 0;
        const text = el.value.substring(0, pos);
        const match = text.match(/(\/\/[\w\d_-]+)$/);
        return match ? match[1] : null;
    } else if (el.isContentEditable && typeof window !== "undefined") {
        const sel = typeof window.getSelection === "function" ? window.getSelection() : null;
        if (!sel || sel.rangeCount === 0) return null;
        const range = sel.getRangeAt(0);
        const container = range.startContainer;
        const offset = range.startOffset;
        if (
            range.collapsed &&
            container &&
            container.nodeType === TEXT_NODE_TYPE &&
            offset >= 0 &&
            container.textContent
        ) {
            const text = container.textContent.substring(0, offset);
            const match = text.match(/(\/\/[\w\d_-]+)$/);
            return match ? match[1] : null;
        }
    }
    return null;
}

function handleTextInput(event) {
    console.log('[ContentJS_CMD] handleTextInput triggered. Key:', event.key, 'Target:', event.target.tagName, event.target.isContentEditable);
    const el = event.target;
    targetElement = el;

    if (el.tagName !== "TEXTAREA" && !el.isContentEditable) {
        return;
    }
    if (customMenu && customMenu.isConnected) return;

    if (!(currentInsertionMode === "command" || currentInsertionMode === "both")) {
        return;
    }

    const key = event.key;

    if (autocompleteMenu) {
        if (key === "ArrowDown") {
            event.preventDefault();
            const count = autocompleteMenu.children.length;
            if (count > 0) {
                selectedSuggestionIndex = (selectedSuggestionIndex + 1) % count;
                highlightSuggestion();
            }
            return;
        } else if (key === "ArrowUp") {
            event.preventDefault();
            const count = autocompleteMenu.children.length;
            if (count > 0) {
                selectedSuggestionIndex =
                    (selectedSuggestionIndex - 1 + count) % count;
                highlightSuggestion();
            }
            return;
        } else if (key === "Enter") {
            event.preventDefault();
            const item = autocompleteMenu.children[selectedSuggestionIndex];
            if (item) {
                applySuggestion(el, { command: item.textContent });
            }
            return;
        } else if (key === "Escape") {
            hideAutocompleteMenu();
            return;
        }
    }

    if (key === "Backspace") {
        if (el.isContentEditable && typeof window !== "undefined") {
            const sel = typeof window.getSelection === "function" ? window.getSelection() : null;
            let container = null;
            let offset = 0;
            if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                container = range.startContainer;
                offset = range.startOffset;
            }
            if (
                container &&
                container.nodeType === TEXT_NODE_TYPE &&
                offset > 0 &&
                container.textContent
            ) {
                const prevChar = container.textContent.substring(offset - 1, offset);
                // Inspecting prevChar avoids ReferenceError when deleting
            }
        }
        setTimeout(() => updateAutocomplete(el), 0);
        return; // let Backspace proceed normally
    }

    if (key === "Enter" || key === " ") {
        const commandTyped = getCommandBeforeCursor(el);
        if (commandTyped && commandTyped.length > 2) {
            event.preventDefault();
            const commandName = commandTyped.slice(2).toLowerCase();
            chrome.runtime.sendMessage(
                { action: "getSnippetByCommandName", command: commandName },
                (response) => {
                    if (chrome.runtime.lastError) {
                        console.error(
                            "[ContentJS] Error fetching snippet by command:",
                            chrome.runtime.lastError.message
                        );
                        return;
                    }
                    if (response && response.content) {
                        insertTextAtCursor(
                            el,
                            response.content,
                            commandTyped,
                            response.richText
                        );
                    } else {
                        console.log(
                            `[ContentJS] Command '${commandName}' (typed as '${commandTyped}') not found.`
                        );
                        if (key === "Enter") {
                            if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
                                pasteSnippetIntoTextarea(el, "\n");
                            } else if (el.isContentEditable) {
                                document.execCommand("insertHTML", false, "<br>");
                                el.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
                            }
                        } else if (key === " ") {
                            if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
                                pasteSnippetIntoTextarea(el, " ");
                            } else if (el.isContentEditable) {
                                document.execCommand("insertText", false, " ");
                                el.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
                            }
                        }
                    }
                }
            );
        }
    }

    if (
        key.length === 1 ||
        key === "Backspace" ||
        key === "Delete"
    ) {
        setTimeout(() => updateAutocomplete(el), 0);
    }
}

function resetCommandState() {
    if (pendingCommandRequest) {
        pendingCommandRequest.canceled = true;
        pendingCommandRequest = null;
    }
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
            container.nodeType === TEXT_NODE_TYPE &&
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
    // console.log( // Original log replaced by the one below
    //     `[ContentJS] applyInsertionMode: currentInsertionMode IS NOW '${currentInsertionMode}', typeof='${typeof currentInsertionMode}'`
    // );
    console.log('[ContentJS_CMD] applyInsertionMode: currentInsertionMode is now', currentInsertionMode);

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
        `[ContentJS_CMD] applyInsertionMode: Checking for command features. currentInsertionMode is '${currentInsertionMode}'. Enables Command? Result: ${enablesCommand}`
    );
    // console.log( // Original log replaced by the one above
    //     `[ContentJS] Checking for button features: currentInsertionMode is '${currentInsertionMode}'. Enables Button? Result: ${enablesButton}`
    // );
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

    // console.log( // Original log replaced by the one above (CMD version)
    //    `[ContentJS] Checking for command features: currentInsertionMode is '${currentInsertionMode}'. Enables Command? Result: ${enablesCommand}`
    // );
    if (enablesCommand) {
        try {
            console.log('[ContentJS_CMD] applyInsertionMode: Adding keydown listener for commands.');
            // console.log( // Original log replaced by the one above
            //     "[ContentJS] Attempting to ADD keydown listener for commands."
            // );
            document.addEventListener("keydown", handleTextInput, true);
            console.log("[ContentJS] ADDED keydown listener for commands.");
        } catch (e) {
            console.error("[ContentJS] Error adding command listener:", e);
        }
    }
    console.log(`[ContentJS] MODE APPLIED: ${currentInsertionMode}`);
}

async function initAfterAllowed() { // Make it async
   await checkInitialPinDisabledState(); // Wait for this check

   chrome.runtime.sendMessage({ action: "getInsertionMode" }, (response) => {
        if (chrome.runtime.lastError) { // Add error check
            console.error('[ContentJS_CMD] initAfterAllowed: Error getting insertion mode:', chrome.runtime.lastError.message);
            applyInsertionMode("both"); // Example fallback
            return;
        }
        let mode = response && response.mode ? response.mode : "both";
        console.log( // Add this log
            '[ContentJS_CMD] initAfterAllowed: Received insertion mode from background:', mode, '(Raw response:', response, ')'
        );
        // console.log( // Original log replaced by the one above
        //     "[ContentJS] Modo de inserção inicial recebido (raw):",
        //     response ? response.mode : undefined
        // );
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

if (typeof chrome !== "undefined" && chrome.runtime && chrome.storage) {
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        if (request.action === "temporarilyDisablePins") {
            console.log("[ContentJS] Received 'temporarilyDisablePins' message.");
            pinsTemporarilyDisabledForThisTab = true;
            sessionStorage.setItem(SESSION_DISABLED_FLAG_KEY, 'true'); // For current page lifecycle
            removeAllPinButtons();
            sendResponse({success: true, status: "Pins disabled on tab"});
        } else if (request.action === "temporarilyEnablePins") {
            console.log("[ContentJS] Received 'temporarilyEnablePins' message.");
            pinsTemporarilyDisabledForThisTab = false;
            sessionStorage.removeItem(SESSION_DISABLED_FLAG_KEY);
            // Re-inject buttons.
            chrome.runtime.sendMessage({ action: "getInsertionMode" }, (response) => {
                if (chrome.runtime.lastError) { // Add error check
                    console.error('[ContentJS_CMD] temporarilyEnablePins: Error getting insertion mode:', chrome.runtime.lastError.message);
                    applyInsertionMode("both"); // Example fallback
                    sendResponse({success: false, error: "Failed to get insertion mode for re-enabling pins"});
                    return;
                }
                let mode = response && response.mode ? response.mode : "both";
                console.log(
                    '[ContentJS_CMD] temporarilyEnablePins: Received insertion mode from background:', mode, '(Raw response:', response, ')'
                );
                applyInsertionMode(mode); // This will call injectButtons if mode allows
                sendResponse({success: true, status: "Pins enabled on tab, mode: " + mode });
            });
            return true; // Indicates asynchronous response
        }
        // Keep other message listeners if any
    });

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
}
