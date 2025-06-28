type MaybeElement = Element | null | undefined;
let filterIdleCallbackReference: number | null = null;

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

let bookmarksAndTabs: ListItem[] = [];
let currentTab: chrome.tabs.Tab | undefined;

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
  currentTab = _currentTab;

  allTabs.forEach((t) => {
    if (!t.url) {
      return;
    }

    bookmarksAndTabs.push(
      new ListItem(
        't',
        t.title || t.url!.replace(/http(s)?:\/\//, '').substring(0, 50),
        t.url!,
        !!t.id && t.id === currentTab?.id,
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

    bookmarksAndTabs.push(
      new ListItem('b', prefix + node.title, node.url, false, node.id)
    );
  }
}

function searchBoxInputHandler() {
  if (filterIdleCallbackReference !== null) {
    cancelIdleCallback(filterIdleCallbackReference);
  }
  filterIdleCallbackReference = requestIdleCallback(() => {
    filterIdleCallbackReference = null;
    filterList();
  });
}

function filterList() {
  const fragment = document.createDocumentFragment();

  const searchText = input.value.toLowerCase().trimStart();
  const searchTextLen = searchText.length;

  // const re = RegExp(searchText, 'gi');
  bookmarksAndTabs.forEach((item, i) => {
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

  searchResults.replaceChildren(fragment);
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
  switch (ev.key) {
    case 'Enter': {
      const li = searchResults.querySelector('li.active');
      if (!(li instanceof HTMLLIElement)) {
        break;
      }

      itemSelected(li, ev);
      break;
    }
    case 'Escape': {
      if (input.value) {
        input.focus();
        input.value = '';
        searchBoxInputHandler();
        ev.preventDefault();
      }
      break;
    }
    case 'c': {
      if (!ev.altKey) {
        break;
      }

      const li = searchResults.querySelector('li.active');
      if (!(li instanceof HTMLLIElement)) {
        break;
      }

      li.toggleAttribute('data-close-tab');
      break;
    }
    case 'w': {
      if (!ev.ctrlKey) {
        break;
      }
      ev.preventDefault();

      const li = searchResults.querySelector('li.active');
      if (!(li instanceof HTMLLIElement)) {
        break;
      }

      closeTabAndSetClosestActive(li);
      break;
    }
    case 'Tab':
    case 'ArrowUp':
    case 'ArrowDown': {
      if (ev.ctrlKey) {
        break;
      }

      ev.preventDefault();

      if (searchResults.childElementCount < 2) {
        break;
      }

      let key = ev.key;
      if (key === 'Tab') {
        if (document.activeElement !== input) {
          requestAnimationFrame(() => input.focus());
        }
        key = ev.shiftKey ? 'ArrowUp' : 'ArrowDown';
      }

      const li = searchResults.querySelector('li.active');
      if (!(li instanceof HTMLLIElement)) {
        break;
      }
      li.classList.remove('active');

      const newActiveElement =
        key === 'ArrowDown'
          ? li.nextElementSibling || searchResults.firstElementChild
          : li.previousElementSibling || searchResults.lastElementChild;

      setActiveLI(newActiveElement, 'center');
      break;
    }
    case 'Home':
    case 'End': {
      if (!ev.ctrlKey || searchResults.childElementCount < 2) {
        break;
      }
      const li = searchResults.querySelector('li.active');
      if (li instanceof HTMLLIElement) {
        li.classList.remove('active');
      }

      const newActiveElement =
        ev.key === 'Home'
          ? searchResults.firstElementChild
          : searchResults.lastElementChild;

      setActiveLI(newActiveElement, 'nearest');
      break;
    }
    case 'PageDown':
    case 'PageUp':
      ev.preventDefault();
      const len = searchResults.childElementCount;
      if (len < 2) {
        break;
      }

      const PAGE_SIZE = 25;

      const li = searchResults.querySelector('li.active');
      if (li instanceof HTMLLIElement) {
        li.classList.remove('active');
      }

      let newActiveElement: MaybeElement;

      const isPageUp = ev.key === 'PageUp';
      if (isPageUp || ev.key === 'PageDown') {
        for (let i = 0; i < searchResults.children.length; i++) {
          if (searchResults.children[i] === li) {
            let newIdx: number;
            if (isPageUp) {
              newIdx = Math.max(0, i - PAGE_SIZE);
            } else {
              newIdx = Math.min(len - 1, i + PAGE_SIZE);
            }
            newActiveElement = searchResults.children[newIdx] as Element;
            break;
          }
        }
      }

      setActiveLI(newActiveElement, isPageUp ? 'end' : 'start');

      break;
    default:
      if (document.activeElement !== input) {
        input.focus();
      }
      break;
  }
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
  li ??= searchResults.firstElementChild;

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

function itemSelected(li: HTMLLIElement, ev: KeyboardEvent | MouseEvent) {
  const url = li.getAttribute('data-url')!;
  const closeTab = li.getAttribute('data-close-tab');
  let tabId = getTabIdFromLI(li);

  if (tabId && closeTab) {
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

const input = document.getElementById('searchBox') as HTMLInputElement;
const liTemplate = document.getElementById('result-item-template') as HTMLTemplateElement;
const searchResults = document.querySelector('.searchResults ul') as HTMLUListElement;
(() => {
  input.addEventListener('input', searchBoxInputHandler);
  document.addEventListener('keydown', searchBoxKeydownHandler);
  searchResults.addEventListener('click', listClickHandler);
  document.getElementById('showHelpBtn')!.addEventListener('click', () => {
    import('./help.js').then((help) => help.showHelp());
  });
})();
