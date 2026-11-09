(function () {
    document.documentElement.classList.add('js-enabled');

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const counterNodes = document.querySelectorAll('.counter');
    const yearElement = document.getElementById('year');
    const revealItems = document.querySelectorAll('.reveal');
    const mobileNavToggle = document.querySelector('.mobile-nav-toggle');
    const mobileNavPanel = document.getElementById('mobile-nav-panel');
    const mobileNavLinks = mobileNavPanel ? mobileNavPanel.querySelectorAll('a') : [];

    if (yearElement) {
        yearElement.textContent = new Date().getFullYear();
    }

    if (!prefersReducedMotion) {
        counterNodes.forEach((counter) => {
            counter.textContent = '0';
        });
    }

    const animateCounter = (element) => {
        const target = Number(element.getAttribute('data-target')) || 0;

        if (prefersReducedMotion) {
            element.textContent = target.toString();
            return;
        }

        const duration = 1200;
        const start = performance.now();

        const step = (now) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const value = Math.floor(eased * target);
            element.textContent = value.toString();

            if (progress < 1) {
                requestAnimationFrame(step);
            } else {
                element.textContent = target.toString();
            }
        };

        requestAnimationFrame(step);
    };

    if (counterNodes.length && 'IntersectionObserver' in window) {
        const observer = new IntersectionObserver(
            (entries, obs) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        animateCounter(entry.target);
                        obs.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.6 }
        );

        counterNodes.forEach((counter) => observer.observe(counter));
    } else {
        counterNodes.forEach(animateCounter);
    }

    if (revealItems.length) {
        if (prefersReducedMotion || !('IntersectionObserver' in window)) {
            revealItems.forEach((item) => item.classList.add('is-visible'));
        } else {
            const revealObserver = new IntersectionObserver(
                (entries, obs) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting) {
                            entry.target.classList.add('is-visible');
                            obs.unobserve(entry.target);
                        }
                    });
                },
                { threshold: 0.2, rootMargin: '0px 0px -60px 0px' }
            );

            revealItems.forEach((item) => revealObserver.observe(item));
        }
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
