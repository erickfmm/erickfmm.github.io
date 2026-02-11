const counters = document.querySelectorAll('.counter');
const yearElement = document.getElementById('year');

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

if (counters.length) {
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

    counters.forEach((counter) => observer.observe(counter));
}
