type Theme = 'light' | 'dark' | 'system';
type UsableTheme = Prettify<Exclude<Theme, 'system'>>;

const getTheme = (): UsableTheme => {
  const cachedTheme = localStorage.getItem('theme') as Theme | null;

  if (cachedTheme && cachedTheme !== 'system') {
    return cachedTheme;
  }

  const systemSettingDark = window.matchMedia('(prefers-color-scheme: dark)');

  if (systemSettingDark.matches) {
    return 'dark';
  }

  return 'light';
};

(() => {
  const theme = getTheme();

  if (theme === 'dark') {
    return;
  }

  document.documentElement.setAttribute('theme', 'light');
})();
