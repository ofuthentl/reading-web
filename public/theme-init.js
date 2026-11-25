(function () {
  try {
    var raw = localStorage.getItem('ofu-library-theme');
    var theme =
      raw === 'light' || raw === 'noon' || raw === 'dim' || raw === 'midnight'
        ? raw
        : raw === 'dark'
          ? 'dim'
          : window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dim'
            : 'light';
    var root = document.documentElement;
    root.dataset.theme = theme;
    if (theme === 'dim' || theme === 'midnight') {
      root.classList.add('dark');
    }
    var colors = {
      light: '#fcfbf8',
      noon: '#f6f1e7',
      dim: '#0d1117',
      midnight: '#060608',
    };
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', colors[theme] || '#fcfbf8');
  } catch (_) {}
})();
