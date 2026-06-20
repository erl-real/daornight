export const LoadingUI = {
    overlay: document.getElementById('loading-overlay'),
    text: document.getElementById('loading-text'),
    show: (msg) => {
        if (LoadingUI.overlay) LoadingUI.overlay.style.display = 'flex';
        if (msg && LoadingUI.text) LoadingUI.text.innerText = msg;
    },
    hide: () => {
        if (LoadingUI.overlay) LoadingUI.overlay.style.display = 'none';
    },
    update: (percent) => {}
};
