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
    console.log('d', ev);
    ev.preventDefault();
    ev.stopImmediatePropagation();

    if (ev.key !== 'Escape') {
      return;
    }
    document.removeEventListener('keydown', withDialogDocumentKeydownHandler, true);
    console.log('close in dialog', dialog);
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
  const desc = buildDescription(helpInfo.description);
  const shortcuts = buildShortcutsTable(helpInfo.shortcuts);
  dialog.append(desc, document.createElement('hr'), shortcuts);

  Object.assign(dialog.style, {
    backgroundColor: '#252526',
    color: '#cccccc',
    border: 'solid 2px #333333',
    borderRadius: '4px'
  } as CSSStyleDeclaration);

  dialog.addEventListener('keydown', function (ev) {
    ev.preventDefault();
    if (ev.key === 'Esc') {
      closeDialog(this);
    }
  });

  return dialog;
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
