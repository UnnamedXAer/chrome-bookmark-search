type HelpData = {
  shortcuts: Record<string, string>;
  description: string;
};

export async function showHelp() {
  const helpInfo = await loadHelp();
  const helpDialog = buildHelp(helpInfo);
  document.body.appendChild(helpDialog);

  showDialog(helpDialog);
}

function closeDialog(dialog: HTMLDialogElement) {
  return dialog.close();
}

function showDialog(dialog: HTMLDialogElement) {
  function withDialogDocumentKeydownHandler(ev: KeyboardEvent) {
    ev.preventDefault();
    ev.stopImmediatePropagation();

    if (ev.key !== 'Escape') {
      return;
    }
    document.removeEventListener('keydown', withDialogDocumentKeydownHandler, true);
    dialog.close();
  }

  document.addEventListener('keydown', withDialogDocumentKeydownHandler, true);
  return dialog.showModal();
}

function buildHelp(helpInfo: HelpData) {
  let dialog = document.querySelector('dialog');
  if (dialog) {
    return dialog;
  }

  dialog = document.createElement('dialog');
  dialog.id = 'helpDialog';
  const settings = buildSettings();
  const desc = buildDescription(helpInfo.description);
  const shortcuts = buildShortcutsTable(helpInfo.shortcuts);
  dialog.append(
    desc,
    document.createElement('hr'),
    settings,
    document.createElement('hr'),
    shortcuts
  );

  dialog.addEventListener('keydown', function (ev) {
    ev.preventDefault();
    if (ev.key === 'Esc') {
      closeDialog(this);
    }
  });

  return dialog;
}

function buildSettings() {
  const settingsEl = document.createElement('fieldset');

  const legend = document.createElement('legend');
  legend.textContent = 'Settings';

  const themeEl = buildThemeSelect();
  const keyboardModeEl = buildKeyboardModeSelect();

  settingsEl.append(legend, themeEl, keyboardModeEl);

  return settingsEl;
}

function buildKeyboardModeSelect(): HTMLElement {
  const modes = [
    { value: 'standard', name: 'Standard' },
    { value: 'vim-like', name: 'Vim-like' }
  ] as const satisfies Prettify<ValueName<KeyboardMode>>;

  const select = document.createElement('select');
  const label = document.createElement('label');
  label.textContent = 'Keyboard Mode: ';

  select.addEventListener('change', (ev) => {
    const selectedMode = (ev.target as HTMLSelectElement).value;

    gKeyboardMode.value = selectedMode as KeyboardMode;
    localStorage.setItem('keyboard-mode', selectedMode);
  });

  label.appendChild(select);

  const currMode = ((localStorage.getItem('keyboard-mode') as KeyboardMode) ||
    null ||
    'standard') satisfies KeyboardMode;

  modes.forEach((mode) => {
    const option = document.createElement('option');
    option.value = mode.value;
    option.textContent = mode.name;
    if (mode.value === currMode) {
      option.selected = true;
    }
    select.appendChild(option);
  });
  return label;
}

function buildThemeSelect(): HTMLElement {
  const themes = [
    { name: 'Light', value: 'light' },
    { name: 'Dark', value: 'dark' },
    { name: 'System', value: 'system' }
  ] as const satisfies Prettify<ValueName<Theme>>;

  const select = document.createElement('select');
  const label = document.createElement('label');
  label.textContent = 'Theme: ';

  select.addEventListener('change', (ev) => {
    const selectedTheme = (ev.target as HTMLSelectElement).value;

    localStorage.setItem('theme', selectedTheme);
    // chrome.storage.local.set({ theme: selectedTheme });
    const newTheme = getTheme();

    document.documentElement.setAttribute('theme', newTheme);
  });

  label.appendChild(select);

  // currTheme = document.documentElement.getAttribute('theme') || 'dark';
  // chrome.storage.local.get(['theme'], (result) => {
  // const theme = result.theme || 'dark';
  const currTheme = (localStorage.getItem('theme') || 'system') as Theme;

  // console.log('Current theme:', currTheme);
  themes.forEach((theme) => {
    const option = document.createElement('option');
    option.value = theme.value;
    option.textContent = theme.name;
    if (theme.value === currTheme) {
      option.selected = true;
    }
    select.appendChild(option);
  });
  return label;
}

function buildDescription(description: HelpData['description']) {
  const el = document.createElement('p');
  el.textContent = description;
  return description;
}

function buildShortcutsTable(shortcuts: HelpData['shortcuts']) {
  const table = document.createElement('table');
  for (const shortcut in shortcuts) {
    const tr = document.createElement('tr');
    let td = document.createElement('td');
    td.textContent = shortcut;
    tr.appendChild(td);
    td = document.createElement('td');
    td.textContent = shortcuts[shortcut];
    tr.appendChild(td);
    table.appendChild(tr);
  }

  return table;
}

async function loadHelp(): Promise<HelpData> {
  const data = await fetch('./help.json');
  const helpInfo = await data.json();

  return helpInfo;
}
