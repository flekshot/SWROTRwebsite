/* ============================================================
   Coruscant Theme JS — Rise of the Republic
   Подключать в конце <body> ПОСЛЕ gsap/lenis (если они есть).
   Автоматически добавляет на страницу:
     • звёздное небо (#starfield, canvas)
     • сканлайны (.scanlines + .scan-beam)
     • силуэт Корусанта с маяками (.coruscant-skyline)
     • трафик спидеров (.speeder-traffic)
     • мобильное hamburger-меню (из .site-nav .nav-links)
     • подсветку активного пункта меню по URL
     • плавный скролл Lenis + reveal-анимации GSAP
   Все блоки с проверками — если элемент уже есть на странице,
   повторно он не создаётся.
   ============================================================ */
(function () {
    'use strict';

    const body = document.body;

    const inject = (html) => {
        const tpl = document.createElement('template');
        tpl.innerHTML = html.trim();
        const node = tpl.content.firstChild;
        body.appendChild(node);
        return node;
    };

    // ── Звёздное небо ──────────────────────────────────────────
    let canvas = document.getElementById('starfield');
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'starfield';
        body.prepend(canvas);
    }
    if (!canvas.dataset.animated) {
        canvas.dataset.animated = '1';
        const ctx = canvas.getContext('2d');
        let stars = [];

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            const count = Math.min(220, Math.floor(canvas.width * canvas.height / 7000));
            stars = Array.from({ length: count }, () => ({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                r: Math.random() * 1.3 + 0.3,
                base: 0.25 + Math.random() * 0.65,
                speed: 0.4 + Math.random() * 1.4,
                phase: Math.random() * Math.PI * 2
            }));
        };

        const tick = (t) => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (const s of stars) {
                ctx.globalAlpha = s.base * (0.55 + 0.45 * Math.sin(t / 1000 * s.speed + s.phase));
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
            requestAnimationFrame(tick);
        };

        window.addEventListener('resize', resize);
        resize();
        requestAnimationFrame(tick);
    }

    // ── Сканлайны ──────────────────────────────────────────────
    if (!document.querySelector('.scanlines')) inject('<div class="scanlines"></div>');
    if (!document.querySelector('.scan-beam')) inject('<div class="scan-beam"></div>');

    // ── Силуэт Корусанта ───────────────────────────────────────
    if (!document.querySelector('.coruscant-skyline')) {
        inject(`<div class="coruscant-skyline">
            <span class="skyline-beacon b1"></span>
            <span class="skyline-beacon b2"></span>
            <span class="skyline-beacon gold b3"></span>
        </div>`);
    }

    // ── Трафик спидеров ────────────────────────────────────────
    if (!document.querySelector('.speeder-traffic')) {
        inject(`<div class="speeder-traffic">
            <div class="speeder s1"></div>
            <div class="speeder rtl s2"></div>
            <div class="speeder s3"></div>
            <div class="speeder rtl s4"></div>
            <div class="speeder s5"></div>
            <div class="speeder rtl s6"></div>
        </div>`);
    }

    // ── Мобильное меню ─────────────────────────────────────────
    const nav = document.querySelector('.site-nav');
    const navInner = nav && nav.querySelector('.nav-inner');
    const navLinks = nav && nav.querySelector('.nav-links');
    if (nav && navInner && navLinks) {
        let toggle = nav.querySelector('.menu-toggle');
        if (!toggle) {
            toggle = document.createElement('button');
            toggle.className = 'menu-toggle';
            toggle.setAttribute('aria-label', 'Меню');
            toggle.innerHTML = '<span></span><span></span><span></span>';
            navInner.appendChild(toggle);
        }
        let menu = document.getElementById('mobile-menu');
        if (!menu) {
            menu = document.createElement('div');
            menu.id = 'mobile-menu';
            menu.className = 'mobile-menu';
            menu.innerHTML = navLinks.innerHTML;
            body.appendChild(menu);
        }
        if (!toggle.dataset.wired) {
            toggle.dataset.wired = '1';
            toggle.addEventListener('click', () => {
                toggle.classList.toggle('open');
                menu.classList.toggle('open');
            });
            menu.addEventListener('click', (e) => {
                if (e.target.tagName === 'A') {
                    toggle.classList.remove('open');
                    menu.classList.remove('open');
                }
            });
        }
    }

    // ── Активный пункт меню по текущему URL ────────────────────
    const page = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.site-nav .nav-link, .mobile-menu a').forEach((a) => {
        if (a.getAttribute('href') === page) a.classList.add('active');
    });

    // ── Плавный скролл Lenis ───────────────────────────────────
    if (window.Lenis && !window.__rotrLenis) {
        const lenis = new Lenis({
            duration: 1.2,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t))
        });
        window.__rotrLenis = lenis;
        const raf = (time) => {
            lenis.raf(time);
            requestAnimationFrame(raf);
        };
        requestAnimationFrame(raf);
    }

    // ── GSAP reveal-анимации ───────────────────────────────────
    if (window.gsap && !window.__rotrGsapInit) {
        window.__rotrGsapInit = true;
        if (window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

        if (document.querySelector('.hero-reveal')) {
            gsap.from('.hero-reveal', {
                y: 40,
                opacity: 0,
                duration: 1.2,
                stagger: 0.2,
                ease: 'power3.out',
                clearProps: 'all'
            });
        }

        if (window.ScrollTrigger) {
            gsap.utils.toArray('.section-reveal').forEach((el) => {
                gsap.to(el, {
                    scrollTrigger: {
                        trigger: el,
                        start: 'top 90%',
                        toggleActions: 'play none none reverse'
                    },
                    y: 0,
                    opacity: 1,
                    duration: 0.8,
                    ease: 'power2.out'
                });
            });
            window.addEventListener('load', () => ScrollTrigger.refresh());
        }
    }
})();
