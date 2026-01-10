// Загрузка страницы
document.addEventListener('DOMContentLoaded', () => {
    console.log('Сайт ODYSSEY загружен');
});

// Плавное преди к страницам
document.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', (e) => {
        const href = link.getAttribute('href');
        if (href.endsWith('.html')) {
            window.location.href = href;
        }
    });
});