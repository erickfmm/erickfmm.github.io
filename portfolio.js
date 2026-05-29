(function () {
    document.documentElement.classList.add('js-enabled');

    const counterNodes = document.querySelectorAll('.counter');
    const yearElement = document.getElementById('year');
    const revealItems = document.querySelectorAll('.reveal');
    const mobileNavToggle = document.querySelector('.mobile-nav-toggle');
    const mobileNavPanel = document.getElementById('mobile-nav-panel');
    const mobileNavLinks = mobileNavPanel ? mobileNavPanel.querySelectorAll('a') : [];

    if (yearElement) {
        yearElement.textContent = new Date().getFullYear();
    }

    const animateCounter = (element) => {
        const target = Number(element.getAttribute('data-target')) || 0;
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

    if (counterNodes.length) {
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
    }

    if (revealItems.length) {
        const revealObserver = new IntersectionObserver(
            (entries, obs) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-visible');
                        obs.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.25, rootMargin: '0px 0px -60px 0px' }
        );

        revealItems.forEach((item) => revealObserver.observe(item));
    }

    if (mobileNavToggle && mobileNavPanel) {
        const closeMobileMenu = () => {
            mobileNavPanel.hidden = true;
            mobileNavToggle.setAttribute('aria-expanded', 'false');
            mobileNavToggle.setAttribute('aria-label', 'Abrir menú de navegación');
        };

        const openMobileMenu = () => {
            mobileNavPanel.hidden = false;
            mobileNavToggle.setAttribute('aria-expanded', 'true');
            mobileNavToggle.setAttribute('aria-label', 'Cerrar menú de navegación');
        };

        mobileNavToggle.addEventListener('click', () => {
            const isExpanded = mobileNavToggle.getAttribute('aria-expanded') === 'true';
            if (isExpanded) {
                closeMobileMenu();
            } else {
                openMobileMenu();
            }
        });

        mobileNavLinks.forEach((link) => {
            link.addEventListener('click', closeMobileMenu);
        });

        window.addEventListener('resize', () => {
            if (window.innerWidth >= 900) {
                closeMobileMenu();
            }
        });
    }
})();
