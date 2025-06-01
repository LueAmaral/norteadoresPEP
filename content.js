// Guarda o elemento alvo para colar o snippet
let targetElement = null;

// Insere o botão “” ao lado de cada input/textarea
function injectButtons() {
    const inputs = document.querySelectorAll("input[type=text], textarea");
    inputs.forEach((el) => {
        if (el.dataset.snippetInjected) return;
        el.dataset.snippetInjected = "1";

        // Cria botão pequeno
        const btn = document.createElement("button");
        btn.textContent = ""; // ícone simples (fonte padrão)
        btn.title = "Inserir máscara";
        btn.style.marginLeft = "4px";
        btn.style.cursor = "pointer";
        btn.style.padding = "2px 6px";
        btn.style.fontSize = "12px";

        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            targetElement = el;
            // Pede ao background que abra o popup
            chrome.runtime.sendMessage({ action: "openPopup" });
        });

        // Insere depois do campo
        el.parentNode.insertBefore(btn, el.nextSibling);
    });
}

// Ao carregar ou mutações dinâmicas, tenta injetar
injectButtons();
new MutationObserver(injectButtons).observe(document.body, { childList: true, subtree: true });

// Recebe o snippet do popup e cola no elemento armazenado
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "pasteSnippet" && targetElement) {
        targetElement.focus();
        const start = targetElement.selectionStart || 0;
        const end = targetElement.selectionEnd || 0;
        const value = targetElement.value || "";
        // Insere o conteúdo no cursor
        const antes = value.substring(0, start);
        const depois = value.substring(end);
        targetElement.value = antes + msg.content + depois;
        // Reposiciona o cursor após o texto inserido
        const pos = antes.length + msg.content.length;
        targetElement.setSelectionRange(pos, pos);
        targetElement.dispatchEvent(new Event("input", { bubbles: true }));
    }
});
