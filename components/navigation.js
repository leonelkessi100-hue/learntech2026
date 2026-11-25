/* LearnTech navigation component. It enhances the existing HTML navigation
   without changing article text, links, or page content. */
(() => {
  'use strict';
  const brand = 'LearnTech';

  document.addEventListener('DOMContentLoaded', () => {
    document.documentElement.classList.add('LearnTech-ready');

    document.querySelectorAll('img').forEach((image) => {
      if (!image.hasAttribute('loading')) image.loading = 'lazy';
      if (!image.hasAttribute('decoding')) image.decoding = 'async';
      if (!image.alt?.trim()) image.alt = `${brand} article image`;
    });

    const menu = document.getElementById('mobile-menu');
    const nav = document.querySelector('nav');
    if (menu && nav && !document.getElementById('LearnTechMenuButton')) {
      const button = document.createElement('button');
      button.id = 'LearnTechMenuButton';
      button.type = 'button';
      button.className = 'md:hidden ml-3 rounded-lg px-3 py-2 text-sm font-bold border border-white/20';
      button.setAttribute('aria-controls', 'mobile-menu');
      button.setAttribute('aria-expanded', 'false');
      button.textContent = 'Menu';

      const close = () => {
        menu.classList.add('hidden');
        button.setAttribute('aria-expanded', 'false');
      };
      button.addEventListener('click', () => {
        const isClosed = menu.classList.contains('hidden');
        menu.classList.toggle('hidden', !isClosed);
        button.setAttribute('aria-expanded', String(isClosed));
      });
      menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', close));
      nav.append(button);
    }
  });
})();
