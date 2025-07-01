type ShortcutsHelp = Record<string, string>;
type HelpData = {
  shortcuts: ShortcutsHelp;
  shortcutsStandardWithVimLike: ShortcutsHelp;
  description: string;
};

export async function showHelp(closeCallback: () => void) {
  const helpInfo = await loadHelp();
  const helpDialog = buildHelp(helpInfo);
  document.body.appendChild(helpDialog);

  showDialog(helpDialog, closeCallback);
}

function showDialog(dialog: HTMLDialogElement, callback: () => void) {
  function withDialogDocumentKeydownHandler(ev: KeyboardEvent) {
    if (ev.key === 'Escape' || (ev.ctrlKey && ['c', '/'].includes(ev.key))) {
      ev.preventDefault();
      ev.stopImmediatePropagation();

      document.removeEventListener('keydown', withDialogDocumentKeydownHandler, true);

      dialog.close();
      callback();
    }
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
  const shortcuts = buildShortcutsTables(
    helpInfo.shortcuts,
    helpInfo.shortcutsStandardWithVimLike
  );
  dialog.append(
    desc,
    document.createElement('hr'),
    settings,
    document.createElement('hr'),
    ...shortcuts
  );

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
    { value: KEYBOARD_MODE.standard, name: 'Standard' },
    { value: KEYBOARD_MODE.standardWithVimLike, name: 'Standard with vim like' }
  ] as const satisfies { value: KeyboardMode; name: string }[];

  const select = document.createElement('select');
  const label = document.createElement('label');
  label.textContent = 'Keyboard Mode: ';

  select.addEventListener('change', (ev) => {
    const selectedMode = (ev.target as HTMLSelectElement).value;

    gKeyboardMode = selectedMode as KeyboardMode;

    updateStandardWithVimLikeShortcutTableDisplay(
      document.querySelector('dialog #shortcutsStandardWithVimLike') as HTMLElement
    );

    localStorage.setItem('keyboard-mode', selectedMode);
  });

  label.appendChild(select);

  const currMode = ((localStorage.getItem('keyboard-mode') as KeyboardMode) ||
    null ||
    KEYBOARD_MODE.standard) satisfies KeyboardMode;

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

function updateStandardWithVimLikeShortcutTableDisplay(table: HTMLElement) {
  table.style.display = gKeyboardMode === KEYBOARD_MODE.standardWithVimLike ? '' : 'none';
  if (table.previousElementSibling?.tagName === 'HR') {
    (table.previousElementSibling as HTMLElement).style.display = table.style.display;
  }
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

  // chrome.storage.local.get(['theme'], (result) => {
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

function buildShortcutsTables(
  shortcuts: HelpData['shortcuts'],
  shortcutsStandardWithVimLike: HelpData['shortcutsStandardWithVimLike']
) {
  const shortcutsTables: HTMLElement[] = [_buildShortcutsTable(shortcuts)];

  const standardWithVimLikeShortcutsTable = _buildShortcutsTable(
    shortcutsStandardWithVimLike
  );
  standardWithVimLikeShortcutsTable.id = 'shortcutsStandardWithVimLike';

  shortcutsTables.push(document.createElement('hr'), standardWithVimLikeShortcutsTable);

  updateStandardWithVimLikeShortcutTableDisplay(standardWithVimLikeShortcutsTable);

  return shortcutsTables;
}

function _buildShortcutsTable(shortcuts: ShortcutsHelp) {
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
