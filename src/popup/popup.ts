type Prettify<T> = {
  [K in keyof T]: Prettify<T[K]>;
} & {};

type ValueName<K extends string> = (K extends infer X
  ? { value: X; name: X extends string ? Capitalize<X> : never }
  : never)[];

const KEYBOARD_MODE = {
  standard: 'standard',
  standardWithVimLike: 'standardWithVimLike'
} as const;

type KeyboardMode = keyof typeof KEYBOARD_MODE;
let gKeyboardMode: KeyboardMode = KEYBOARD_MODE.standard;

type EventMetaKeys = Pick<KeyboardEvent, 'ctrlKey' | 'shiftKey' | 'altKey'>;

type MaybeElement = Element | null | undefined;
let gFilterIdleCallbackReference: number | null = null;

class ListItem {
  type: 'b' | 't';
  title: string;
  url: string;
  id?: string | number;
  currentActive: boolean;

  constructor(
    type: 'b' | 't',
    title: string,
    url: string,
    currentActive: boolean,
    id?: string | number
  ) {
    this.title = title;
    this.type = type;
    this.url = url;
    this.id = id;
    this.currentActive = currentActive;
  }
}

let gBookmarksAndTabs: ListItem[] = [];
let gCurrentTab: chrome.tabs.Tab | undefined;

async function readBookmarksAndTabsData() {
  const [_currentTab, allTabs, allBookmarks] = await Promise.all([
    chrome.tabs
      .query({
        active: true,
        lastFocusedWindow: true
      })
      .then((tabs) => tabs.at(0)),
    chrome.tabs.query({}),
    chrome.bookmarks.getTree()
  ]);
  gCurrentTab = _currentTab;

  allTabs.forEach((t) => {
    if (!t.url) {
      return;
    }

    gBookmarksAndTabs.push(
      new ListItem(
        't',
        t.title || t.url!.replace(/http(s)?:\/\//, '').substring(0, 50),
        t.url!,
        !!t.id && t.id === gCurrentTab?.id,
        t.id
      )
    );
  });

  allBookmarks.forEach((bookmarks) => {
    if (bookmarks.children) {
      bookmarks.children.forEach((b) => {
        if (b.children) {
          mapBookmarksTree(b.children);
        }
      });
    }
  });
}

function mapBookmarksTree(
  bookmarksTreeNodes: chrome.bookmarks.BookmarkTreeNode[],
  prefix: string = ''
) {
  for (const node of bookmarksTreeNodes) {
    if (node.children?.length) {
      mapBookmarksTree(node.children, `${prefix}/${node.title}/`);
    }

    if (!node.url) {
      continue;
    }

    gBookmarksAndTabs.push(
      new ListItem('b', prefix + node.title, node.url, false, node.id)
    );
  }
}

function searchBoxInputHandler() {
  if (gFilterIdleCallbackReference !== null) {
    cancelIdleCallback(gFilterIdleCallbackReference);
  }
  gFilterIdleCallbackReference = requestIdleCallback(() => {
    gFilterIdleCallbackReference = null;
    filterList();
  });
}

function filterList() {
  const fragment = document.createDocumentFragment();

  const searchText = gInput.value.toLowerCase().trimStart();
  const searchTextLen = searchText.length;

  gBookmarksAndTabs.forEach((item, i) => {
    if (searchTextLen > 0 && !item.title.toLowerCase().includes(searchText)) {
      return;
    }

    const li = document.createElement('li');
    li.classList.add('result-item', item.type);
    li.classList.add(item.type);
    li.setAttribute('data-url', item.url);

    if (searchTextLen > 0) {
      let prevTextEnd = 0;
      const titleLower = item.title.toLowerCase();
      let title = item.title;

      let idx = titleLower.indexOf(searchText, prevTextEnd);
      while (idx !== -1) {
        const span = document.createElement('span');
        span.className = 'highlighted';
        span.textContent = title.substring(idx, idx + searchTextLen);
        const preText = item.title.substring(prevTextEnd, idx);

        li.append(preText, span);

        prevTextEnd = idx + searchTextLen;
        idx = titleLower.indexOf(searchText, prevTextEnd);
      }

      if (prevTextEnd < title.length) {
        li.append(title.substring(prevTextEnd));
      }
    } else {
      li.textContent = item.title;
    }

    if (item.type === 't' && item.id !== void 0) {
      li.setAttribute('data-tabId', item.id.toString());
      if (item.currentActive) {
        li.classList.add('currTab');
      }
    }

    fragment.appendChild(li);
  });

  if (fragment.childElementCount) {
    (fragment.firstChild as HTMLLIElement).classList.add('active');
  }

  gSearchResults.replaceChildren(fragment);
}

interface OpenUrlConfig {
  forceInCurrentTab?: boolean;
  newTab?: boolean;
  newWindow?: boolean;
}

async function openUrl(url: string, tabId?: number, config: OpenUrlConfig = {}) {
  if (config.forceInCurrentTab) {
    await openUrlInCurrentTab(url);
    // no-wait
    closeTabIfNotCurrent(tabId);
  } else if (config.newWindow) {
    await createNewWindowWithUrl(url, true);
  } else if (config.newTab) {
    await createNewTabWithUrl(url, true);
  } else if (tabId !== void 0) {
    await focusOnTab(tabId);
  } else {
    await openUrlInCurrentTab(url);
  }

  closeMarkedTabs();

  return window.close();
}

function focusOnTab(tabId: number) {
  return chrome.tabs
    .update(tabId, {
      active: true
    })
    .then((tab) => {
      if (!tab) {
        return;
      }

      return chrome.windows.update(tab.windowId, {
        focused: true
      });
    });
}

function openUrlInCurrentTab(url: string) {
  return chrome.tabs.update({
    url: url
  });
}

function createNewTabWithUrl(url: string, active: boolean) {
  return chrome.tabs.create({
    url,
    active
  });
}

function createNewWindowWithUrl(url: string, active: boolean) {
  return chrome.windows.create({
    focused: active,
    url
  });
}

function listClickHandler(ev: MouseEvent) {
  if (!(ev.target instanceof HTMLLIElement)) {
    return;
  }

  const openUrlConfig = getOpenUrlConfig(ev, KEYBOARD_MODE.standard);
  itemSelected(ev.target, openUrlConfig);
}

function handleDocumentKeydown(ev: KeyboardEvent) {
  switch (gKeyboardMode) {
    case KEYBOARD_MODE.standardWithVimLike:
      handleSearchBoxKeydownInVimLikeMode(ev);
      return;

    case KEYBOARD_MODE.standard:
    // fallthrough
    default:
      handleSearchBoxKeydownInStandardMode(ev);
      return;
  }
}
function handleSearchBoxKeydownInVimLikeMode(ev: KeyboardEvent) {
  if (ev.ctrlKey) {
    switch (ev.key) {
      case 'c':
        searchBoxClearOrCancel(ev, gInput);
        return;

      case 'j':
        searchResultsMoveUpDown(ev, 'ArrowDown', false);
        return;

      case 'k':
        searchResultsMoveUpDown(ev, 'ArrowUp', false);
        return;

      case 'd':
        searchResultsMovePageUpDown(ev, 'PageDown');
        return;

      case 'u':
        searchResultsMovePageUpDown(ev, 'PageUp');
        return;

      case 'g':
        searchResultsMoveStartEnd(ev, 'Home', true);
        return;

      case 'G':
        searchResultsMoveStartEnd(ev, 'End', true);
        return;

      case 'y':
      case 'Y':
        searchBoxItemSelected(ev);
        return;
    }
  }

  handleSearchBoxKeydownInStandardMode(ev);
}

function handleSearchBoxKeydownInStandardMode(ev: KeyboardEvent) {
  const { key: evKey, altKey: evAltKey, ctrlKey: evCtrlKey, shiftKey: evShiftKey } = ev;

  switch (evKey) {
    case 'Alt': {
      ev.preventDefault();

      return;
    }
    case 'Enter': {
      searchBoxItemSelected(ev);

      return;
    }
    case 'Escape': {
      searchBoxClearOrCancel(ev, gInput);

      return;
    }
    case 'x': {
      if (!evCtrlKey) {
        break;
      }

      searchResultsToggleCloseTab(ev);

      return;
    }
    case 'w': {
      if (!evCtrlKey) {
        break;
      }

      searchResultsCloseSelectedTab(ev);

      return;
    }

    case 's': {
      if (!evCtrlKey) {
        break;
      }

      ev.preventDefault();

      return;
    }

    case 'Tab':
    case 'ArrowUp':
    case 'ArrowDown': {
      if (evCtrlKey) {
        break;
      }

      searchResultsMoveUpDown(ev, evKey, evShiftKey);

      return;
    }
    case 'Home':
    case 'End': {
      if (!evCtrlKey) {
        break;
      }

      searchResultsMoveStartEnd(ev, evKey, evCtrlKey);

      return;
    }
    case 'PageDown':
    case 'PageUp': {
      searchResultsMovePageUpDown(ev, evKey);

      return;
    }

    case '/': {
      if (!evCtrlKey) {
        break;
      }

      openInformationDialog();

      return;
    }
    default:
      break;
  }

  if (document.activeElement !== gInput) {
    gInput.focus();
  }
}

function getOpenUrlConfig(ev: EventMetaKeys, keyboardMode: KeyboardMode): OpenUrlConfig {
  if (keyboardMode === KEYBOARD_MODE.standardWithVimLike) {
    return {
      newTab: ev.altKey,
      newWindow: ev.shiftKey,
      forceInCurrentTab: ev.shiftKey && ev.altKey
    };
  }

  return {
    newTab: ev.ctrlKey,
    newWindow: ev.shiftKey,
    forceInCurrentTab: ev.shiftKey && ev.ctrlKey
  };
}

function searchBoxItemSelected(ev: EventMetaKeys & { key: KeyboardEvent['key'] }) {
  const li = gSearchResults.querySelector('li.active');
  if (!(li instanceof HTMLLIElement)) {
    return;
  }

  const openUrlConfig = getOpenUrlConfig(
    ev,
    ev.key === 'Enter' ? KEYBOARD_MODE.standard : gKeyboardMode
  );

  itemSelected(li, openUrlConfig);
}

function searchBoxClearOrCancel(
  ev: Pick<Event, 'preventDefault'>,
  input: HTMLInputElement
) {
  ev.preventDefault();

  if (input.value) {
    input.focus();
    input.value = '';
    searchBoxInputHandler();
    return;
  }

  window.close();
}

function searchResultsMovePageUpDown(
  ev: Pick<KeyboardEvent, 'preventDefault'>,
  evKey: KeyboardEvent['key']
) {
  ev.preventDefault();

  const len = gSearchResults.childElementCount;
  if (len < 2) {
    return;
  }

  const PAGE_SIZE = 25;

  const li = gSearchResults.querySelector('li.active');
  if (li instanceof HTMLLIElement) {
    li.classList.remove('active');
  }

  let newActiveElement: MaybeElement;

  const isPageUp = evKey === 'PageUp';
  if (isPageUp || evKey === 'PageDown') {
    for (let i = 0; i < gSearchResults.children.length; i++) {
      if (gSearchResults.children[i] === li) {
        let newIdx: number;
        if (isPageUp) {
          newIdx = Math.max(0, i - PAGE_SIZE);
        } else {
          newIdx = Math.min(len - 1, i + PAGE_SIZE);
        }
        newActiveElement = gSearchResults.children[newIdx] as Element;
        break;
      }
    }
  }

  setActiveLI(newActiveElement, isPageUp ? 'end' : 'start');
}

function searchResultsMoveStartEnd(
  ev: Pick<KeyboardEvent, 'preventDefault'>,
  evKey: KeyboardEvent['key'],
  evCtrlKey: KeyboardEvent['ctrlKey']
) {
  if (evCtrlKey) {
    ev.preventDefault();
  }

  if (gSearchResults.childElementCount < 2) {
    return;
  }

  const li = gSearchResults.querySelector('li.active');
  if (li instanceof HTMLLIElement) {
    li.classList.remove('active');
  }

  const newActiveElement =
    evKey === 'Home' ? gSearchResults.firstElementChild : gSearchResults.lastElementChild;

  setActiveLI(newActiveElement, 'nearest');
}

function searchResultsToggleCloseTab(ev: Pick<Event, 'preventDefault'>) {
  ev.preventDefault();
  // must be a tab, not bookmark.
  const li = gSearchResults.querySelector('li.active.t');
  if (!(li instanceof HTMLLIElement)) {
    return;
  }

  li.toggleAttribute('data-close-tab');
}

function searchResultsCloseSelectedTab(ev: Pick<KeyboardEvent, 'preventDefault'>) {
  ev.preventDefault();

  const li = gSearchResults.querySelector('li.active.t');
  if (!(li instanceof HTMLLIElement)) {
    return;
  }

  closeTabAndSetClosestActive(li);
}

function searchResultsMoveUpDown(
  ev: Pick<KeyboardEvent, 'preventDefault'>,
  evKey: KeyboardEvent['key'],
  evShiftKey: KeyboardEvent['shiftKey']
) {
  ev.preventDefault();

  if (gSearchResults.childElementCount < 2) {
    return;
  }

  let _key = evKey;
  if (_key === 'Tab') {
    if (document.activeElement !== gInput) {
      requestAnimationFrame(() => gInput.focus());
    }
    _key = evShiftKey ? 'ArrowUp' : 'ArrowDown';
  }

  const li = gSearchResults.querySelector('li.active');
  if (!(li instanceof HTMLLIElement)) {
    return;
  }
  li.classList.remove('active');

  const newActiveElement =
    _key === 'ArrowDown'
      ? li.nextElementSibling || gSearchResults.firstElementChild
      : li.previousElementSibling || gSearchResults.lastElementChild;

  setActiveLI(newActiveElement, 'center');
}

function closeTabIfNotCurrent(tabId?: number) {
  if (!tabId) {
    return;
  }

  return chrome.tabs
    .query({
      active: true,
      lastFocusedWindow: true
    })
    .then(([currentTab]) => {
      // const li = gSearchResults.querySelector<HTMLLIElement>('li.active.currTab');

      if (currentTab && currentTab.id === tabId) {
        return;
      }

      return chrome.tabs.remove(tabId);
    })
    .catch((err) => console.log('closeTabIfNotCurrent', err));
}

async function closeTabAndSetClosestActive(li: HTMLLIElement) {
  let tabId = getTabIdFromLI(li);

  if (!tabId) {
    return;
  }
  try {
    await chrome.tabs.remove(tabId);
  } catch (err) {
    console.log(err);
    return;
  }

  const newActiveElement = li.nextElementSibling || li.previousElementSibling;
  li.remove();
  setActiveLI(newActiveElement, 'nearest');
}

function setActiveLI(li: MaybeElement, block: ScrollLogicalPosition = 'center') {
  li ??= gSearchResults.firstElementChild;

  if (!li) {
    return;
  }

  li.classList.add('active');
  li.scrollIntoView({ block });
}

function getTabIdFromLI(li: HTMLLIElement): number | undefined {
  const dataTabId = li.getAttribute('data-tabId');
  if (!dataTabId) {
    return;
  }

  return +dataTabId;
}

function itemSelected(targetTab: HTMLLIElement, config: OpenUrlConfig) {
  const url = targetTab.getAttribute('data-url')!;

  const closeTargetTab = targetTab.getAttribute('data-close-tab') !== null;
  let tabId = getTabIdFromLI(targetTab);
  const currTab = gSearchResults.querySelector('li.t.currTab');

  if (config.forceInCurrentTab) {
    currTab?.removeAttribute('data-close-tab');
  } else {
    if (closeTargetTab) {
      tabId = void 0;
      if (!config.newTab) {
        config.newTab = true;
      }
    }
  }

  return openUrl(url, tabId, config);
}

function closeMarkedTabs() {
  const markedToClose =
    gSearchResults.querySelectorAll<HTMLLIElement>('li[data-close-tab]');

  [...markedToClose].forEach((li) => {
    let tabId = getTabIdFromLI(li);
    if (tabId) {
      chrome.tabs.remove(tabId).catch((err) => {
        console.log({ err });
      });
    }
  });
}

function toggleDocumentKeydownHandler(action: 'add' | 'remove') {
  if (action === 'add') {
    document.addEventListener('keydown', handleDocumentKeydown);
  } else if (action === 'remove') {
    document.removeEventListener('keydown', handleDocumentKeydown);
  }
}

function openInformationDialog() {
  return import('./help.js').then((help) => {
    toggleDocumentKeydownHandler('remove');
    help.showHelp(() => toggleDocumentKeydownHandler('add'));
  });
}

readBookmarksAndTabsData().then(filterList);

const gInput = document.getElementById('searchBox') as HTMLInputElement;
const gLiTemplate = document.getElementById(
  'result-item-template'
) as HTMLTemplateElement;
const gSearchResults = document.querySelector('.searchResults ul') as HTMLUListElement;

(() => {
  gKeyboardMode =
    (localStorage.getItem('keyboard-mode') as KeyboardMode) ||
    null ||
    KEYBOARD_MODE.standard;

  gInput.addEventListener('input', searchBoxInputHandler);

  toggleDocumentKeydownHandler('add');

  gSearchResults.addEventListener('click', listClickHandler);

  document
    .getElementById('showHelpBtn')!
    .addEventListener('click', openInformationDialog);
})();
