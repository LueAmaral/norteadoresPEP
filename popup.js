document.addEventListener('DOMContentLoaded', function() {
    const openOptionsPageButton = document.getElementById('openOptionsPageButton');

    if (openOptionsPageButton) {
        openOptionsPageButton.addEventListener('click', function() {
            if (chrome.runtime.openOptionsPage) {
                chrome.runtime.openOptionsPage();
            } else {
                // Fallback for browsers that might not support openOptionsPage (e.g., older versions)
                // Or if running in a context where it's not available.
                window.open(chrome.runtime.getURL('options.html'));
            }
        });
    } else {
        console.error("Button with ID 'openOptionsPageButton' not found in popup.html");
    }
});
