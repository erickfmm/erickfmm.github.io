(function () {
    const yearElement = document.getElementById('year');
    const mobileNavToggle = document.querySelector('.mobile-nav-toggle');
    const mobileNavPanel = document.getElementById('mobile-nav-panel');
    const mobileNavLinks = mobileNavPanel ? mobileNavPanel.querySelectorAll('a') : [];

    if (yearElement) {
        yearElement.textContent = new Date().getFullYear();
    }

    if (mobileNavToggle && mobileNavPanel) {
        const closeMobileMenu = (restoreFocus) => {
            const wasOpen = !mobileNavPanel.hidden;
            mobileNavPanel.hidden = true;
            mobileNavToggle.setAttribute('aria-expanded', 'false');
            mobileNavToggle.setAttribute('aria-label', mobileNavToggle.dataset.openLabel || 'Abrir menú de navegación');

            if (restoreFocus && wasOpen) {
                mobileNavToggle.focus();
            }
        };

        const openMobileMenu = () => {
            mobileNavPanel.hidden = false;
            mobileNavToggle.setAttribute('aria-expanded', 'true');
            mobileNavToggle.setAttribute('aria-label', mobileNavToggle.dataset.closeLabel || 'Cerrar menú de navegación');
        };

        mobileNavToggle.addEventListener('click', () => {
            const isExpanded = mobileNavToggle.getAttribute('aria-expanded') === 'true';
            if (isExpanded) {
                closeMobileMenu(true);
            } else {
                openMobileMenu();
            }
        });

        mobileNavLinks.forEach((link) => {
            link.addEventListener('click', () => closeMobileMenu(false));
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !mobileNavPanel.hidden) {
                closeMobileMenu(true);
            }
        });

        window.addEventListener('resize', () => {
            if (window.innerWidth >= 960) {
                closeMobileMenu(false);
            }
        });
    }
})();
