/**
 * ARGON MEDICAL OS — EMR UI Manager
 * Handles UI interactions, tabs, toasts, and themes.
 * Extracted from emr-app.js (Phase 4 Modularization)
 */

window.ArgonUIManager = {
    // Toast Notifications
    toast: function (msg, type = '') {
        const t = document.getElementById('toast');
        if (!t) return;
        t.textContent = msg;
        t.className = type ? 'show ' + type : 'show';
        setTimeout(() => t.className = '', 3000);
    },

    // Theme Toggling
    toggleTheme: function () {
        const currentTheme = document.body.getAttribute('data-theme');
        const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.body.setAttribute('data-theme', nextTheme);
        localStorage.setItem('argon_theme', nextTheme);
        this.updateThemeIcon(nextTheme);
    },

    updateThemeIcon: function (theme) {
        const btn = document.getElementById('themeBtn');
        if (btn) btn.innerHTML = theme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    }
};

// Global polyfills to keep backward compatibility with emr-app.js existing code
window.toast = function(msg, type) { return window.ArgonUIManager.toast(msg, type); };
window.toggleTheme = function() { return window.ArgonUIManager.toggleTheme(); };
window.updateThemeIcon = function(theme) { return window.ArgonUIManager.updateThemeIcon(theme); };
