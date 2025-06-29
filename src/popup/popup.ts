type Prettify<T> = {
  [K in keyof T]: Prettify<T[K]>;
} & {};

type ValueName<K extends string> = (K extends infer X
  ? { value: X; name: X extends string ? Capitalize<X> : never }
  : never)[];

type KeyboardMode = 'standard' | 'vim-like';
type KeyboardVimMode = 'insert'; // for now let's keep it simple
let gKeyboardVimMode: KeyboardVimMode = 'insert';
let gKeyboardMode = {
  value_: 'standard' as KeyboardMode,
  get value() {
    return this.value_;
  },
  set value(newValue: KeyboardMode) {
    this.value_ = newValue;
    gInput.setAttribute('data-keyboard-mode', newValue);
  }
};

type EventWithKeys = Pick<KeyboardEvent, 'ctrlKey' | 'shiftKey' | 'altKey'>;

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

  // const re = RegExp(searchText, 'gi');
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

async function openUrl(
  url: string,
  config: {
    tabId?: number;
    forceInCurrentTab?: boolean;
    newTab?: boolean;
    newWindow?: boolean;
  } = {}
) {
  if (config.forceInCurrentTab) {
    await openUrlInCurrentTab(url);
    // no-wait
    closeTabIfNotCurrent(config.tabId);
  } else if (config.newWindow) {
    await createNewWindowWithUrl(url, true);
  } else if (config.newTab) {
    await createNewTabWithUrl(url, true);
  } else if (config.tabId !== void 0) {
    await focusOnTab(config.tabId);
  } else {
    await openUrlInCurrentTab(url);
  }

  return window.close();
}

async function focusOnTab(tabId: number) {
  const tab = await chrome.tabs.update(tabId, {
    active: true
  });

  if (!tab) {
    return;
  }

  return chrome.windows.update(tab.windowId, {
    focused: true
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

  itemSelected(ev.target, ev);
}

function searchBoxKeydownHandler(ev: KeyboardEvent) {
  switch (gKeyboardMode.value) {
    case 'vim-like':
      handleSearchBoxKeydownInVimLikeMode(ev);
      return;

    case 'standard':
    // fallthrough
    default:
      handleSearchBoxKeydownInStandardMode(ev);
      break;
  }
}
function handleSearchBoxKeydownInVimLikeMode(ev: KeyboardEvent) {
  const evKey = ev.key;
  const evAltKey = ev.altKey;
  const evCtrlKey = ev.ctrlKey;

  if (evCtrlKey) {
    switch (evKey) {
      case 'c':
        searchBoxClearOrCancel(ev, gInput);
        break;

      case 'c':
        // ha(input, ev);
        break;
    }
    return;
  }

  handleSearchBoxKeydownInStandardMode(ev);

  // case 'Enter':
  // case 'Escape':
  // case 'Tab':
  // case 'w':
  // case 'ArrowUp':
  // case 'ArrowDown':
  // case 'Home':
  // case 'End':
  // case 'PageDown':
  // case 'PageUp':
}

function handleSearchBoxKeydownInStandardMode(ev: KeyboardEvent) {
  _handleSearchBoxKey(ev);
}

function _handleSearchBoxKey(
  ev: EventWithKeys & Pick<KeyboardEvent, 'key' | 'preventDefault'>
) {
  const { key: evKey, altKey: evAltKey, ctrlKey: evCtrlKey, shiftKey: evShiftKey } = ev;

  switch (evKey) {
    case 'Enter': {
      const li = gSearchResults.querySelector('li.active');

      searchBoxItemSelected(ev, li);

      return;
    }
    case 'Escape': {
      searchBoxClearOrCancel(ev, gInput);

      return;
    }
    case 'c': {
      if (!evAltKey) {
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
    case 'Tab':
    case 'ArrowUp':
    case 'ArrowDown': {
      if (evCtrlKey) {
        break;
      }

      searchResultsMoveUpDown(ev);

      return;
    }
    case 'Home':
    case 'End': {
      if (!evCtrlKey) {
        break;
      }

      searchResultsMoveStartEnd(ev);

      return;
    }
    case 'PageDown':
    case 'PageUp': {
      searchResultsMovePageUpDown(ev);

      return;
    }
    default:
      break;
  }

  if (document.activeElement !== gInput) {
    gInput.focus();
  }
}

function searchBoxItemSelected(ev: EventWithKeys, li: MaybeElement) {
  if (!(li instanceof HTMLLIElement)) {
    return;
  }

  itemSelected(li, ev);
}

function searchBoxClearOrCancel(
  ev: Pick<Event, 'preventDefault'>,
  input: HTMLInputElement
) {
  if (input.value) {
    input.focus();
    input.value = '';
    searchBoxInputHandler();
    ev.preventDefault();
  }
}

function searchResultsMovePageUpDown(ev: Pick<KeyboardEvent, 'preventDefault' | 'key'>) {
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

  const isPageUp = ev.key === 'PageUp';
  if (isPageUp || ev.key === 'PageDown') {
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
  ev: Pick<KeyboardEvent, 'preventDefault' | 'key' | 'ctrlKey'>
) {
  // maybe prevent default
  // ev.preventDefault();

  if (gSearchResults.childElementCount < 2) {
    return;
  }

  const li = gSearchResults.querySelector('li.active');
  if (li instanceof HTMLLIElement) {
    li.classList.remove('active');
  }

  const newActiveElement =
    ev.key === 'Home'
      ? gSearchResults.firstElementChild
      : gSearchResults.lastElementChild;

  setActiveLI(newActiveElement, 'nearest');
}

function searchResultsToggleCloseTab(ev: Pick<Event, 'preventDefault'>) {
  ev.preventDefault();
  const li = gSearchResults.querySelector('li.active');
  if (!(li instanceof HTMLLIElement)) {
    return;
  }

  // TODO: we should not allow to mark bookmarks for closing
  li.toggleAttribute('data-close-tab');
}

function searchResultsCloseSelectedTab(ev: Pick<KeyboardEvent, 'preventDefault'>) {
  ev.preventDefault();

  const li = gSearchResults.querySelector('li.active');
  if (!(li instanceof HTMLLIElement)) {
    return;
  }

  closeTabAndSetClosestActive(li);
}

function searchResultsMoveUpDown(
  ev: Pick<KeyboardEvent, 'preventDefault' | 'key' | 'shiftKey'>
) {
  ev.preventDefault();

  if (gSearchResults.childElementCount < 2) {
    return;
  }

  let _key = ev.key;
  if (_key === 'Tab') {
    if (document.activeElement !== gInput) {
      requestAnimationFrame(() => gInput.focus());
    }
    _key = ev.shiftKey ? 'ArrowUp' : 'ArrowDown';
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

async function closeTabIfNotCurrent(tabId?: number) {
  if (!tabId) {
    return;
  }
  try {
    const [currentTab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true
    });

    if (currentTab && currentTab.id === tabId) {
      return;
    }

    await chrome.tabs.remove(tabId);
  } catch (err) {
    console.log({ closeTabIfNotCurrent: err });
  }
}

async function closeTabAndSetClosestActive(li: HTMLLIElement) {
  let tabId = getTabIdFromLI(li);

  if (!tabId) {
    return;
  }
  try {
    await chrome.tabs.remove(tabId);
  } catch (err) {
    console.log({ err });
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

function itemSelected(li: HTMLLIElement, ev: EventWithKeys) {
  const url = li.getAttribute('data-url')!;
  // TODO: that doesn't work because we get empty string if attribute is present
  // additionally we should use querySelector to get all active elements
  // and close them all or do not allow to mark more than one tab for closing
  const closeTab = li.getAttribute('data-close-tab');
  let tabId = getTabIdFromLI(li);

  if (tabId && closeTab) {
    // maybe we should just close the marked tabs
    chrome.tabs.remove(tabId).catch((err) => {
      console.log({ err });
    });
    tabId = void 0;
  }

  return openUrl(url, {
    newTab: ev.ctrlKey,
    newWindow: ev.shiftKey,
    forceInCurrentTab: ev.shiftKey && ev.ctrlKey,
    tabId
  });
}

readBookmarksAndTabsData().then(filterList);

const gInput = document.getElementById('searchBox') as HTMLInputElement;
const gLiTemplate = document.getElementById(
  'result-item-template'
) as HTMLTemplateElement;
const gSearchResults = document.querySelector('.searchResults ul') as HTMLUListElement;

(() => {
  gKeyboardMode.value =
    (localStorage.getItem('keyboard-mode') as KeyboardMode) || null || 'standard';

  gInput.addEventListener('input', searchBoxInputHandler);

  document.addEventListener('keydown', searchBoxKeydownHandler);

  gSearchResults.addEventListener('click', listClickHandler);

  document.getElementById('showHelpBtn')!.addEventListener('click', () => {
    import('./help.js').then((help) => help.showHelp());
  });
})();
