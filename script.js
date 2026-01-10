// Загрузка страницы
document.addEventListener('DOMContentLoaded', () => {
    console.log('Сайт ODYSSEY загружен');
    // Обработка миниатюр в карточках: показать плейсхолдер при ошибке загрузки
    document.querySelectorAll('.card-image').forEach(wrapper => {
        const img = wrapper.querySelector('img.card-thumb');
        const placeholder = wrapper.querySelector('.placeholder-image');
        if (!img) return;
        img.addEventListener('load', () => {
            if (placeholder) placeholder.style.display = 'none';
            img.style.display = 'block';
        });
        img.addEventListener('error', () => {
            img.style.display = 'none';
            if (placeholder) placeholder.style.display = 'flex';
        });
        // Если изображение уже нет в папке, триггерим проверку
        if (!img.complete || img.naturalWidth === 0) {
            // small delay to allow browser to attempt load
            setTimeout(() => { if (img.naturalWidth === 0) img.dispatchEvent(new Event('error')); }, 300);
        }
    });
});

// Плавное переход к страницам
document.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', (e) => {
        const href = link.getAttribute('href');
        if (href && href.endsWith('.html')) {
            // Плавный переход
            document.body.style.opacity = '0.8';
            setTimeout(() => {
                window.location.href = href;
            }, 200);
        }
    });
});