/// <reference path="./popup.d.ts" />

let filterIdleCallbackReference: number | null = null;

class ListItem {
  type: 'b' | 't';
  title: string;
  url: string;
  id?: string | number;

  constructor(type: 'b' | 't', title: string, url: string, id?: string | number) {
    this.title = title;
    this.type = type;
    this.url = url;
    this.id = id;
  }
}

let bookmarksAndTabs: ListItem[] = [];

async function readBookmarksAndTabsData() {
  const allTabs = await chrome.tabs.query({});

  bookmarksAndTabs.length = 0;
  allTabs.forEach((t) => {
    if (!t.url) {
      return;
    }

    bookmarksAndTabs.push(
      new ListItem(
        't',
        t.title || t.url!.replace(/http(s)?:\/\//, '').substring(0, 50),
        t.url!,
        t.id
      )
    );
  });

  const allBookmarks = await chrome.bookmarks.getTree();
  const barBookmarks =
    allBookmarks[0].children?.find((b) => b.title === 'Bookmarks bar')?.children || [];

  mapBookmarksTree(barBookmarks);
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

    bookmarksAndTabs.push(new ListItem('b', prefix + node.title, node.url, node.id));
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

  const value = input.value.toLowerCase().trimStart();

  const matches =
    value === ''
      ? bookmarksAndTabs
      : bookmarksAndTabs.filter((x) => x.title.toLowerCase().includes(value));

  const re = RegExp(input.value, 'gi');
  matches.map((item, i) => {
    const li = liTemplate.content.firstChild!.cloneNode(true) as HTMLLIElement;
    li.innerHTML = item.title.replace(re, '<span class="highlighted">$&</span>');
    li.classList.add(item.type);
    li.setAttribute('data-id', '' + item.id || `${item.type}:${i}`);
    li.setAttribute('data-url', item.url);
    item.type === 't' &&
      item.id !== void 0 &&
      li.setAttribute('data-tabId', item.id.toString());
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
    newTab?: boolean;
    newWindow?: boolean;
  } = {}
) {
  if (config.newWindow) {
    await createNewWindowWithUrl(url, true);
  } else if (config.newTab) {
    await createNewTabWithUrl(url, true);
  } else if (config.tabId !== void 0) {
    await openUrlInExistingTab(url, config.tabId, true);
  } else {
    await openUrlInCurrentTab(url);
  }

  return window.close();
}

async function openUrlInExistingTab(url: string, tabId: number, active: boolean) {
  const tab = await chrome.tabs.update(tabId, {
    url: url,
    active
  });

  if (!tab || !active) {
    return;
  }

  return chrome.windows.update(tab.windowId, {
    focused: active
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
    case 'Esc': {
      input.value = '';
      break;
    }
    case 'Tab':
    case 'ArrowUp':
    case 'ArrowDown': {
      if (ev.ctrlKey || searchResults.childElementCount < 2) {
        break;
      }

      let key = ev.key;
      if (key === 'Tab') {
        ev.preventDefault();
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
            console.log(i, newIdx);
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

function setActiveLI(
  idxOrLI: number | MaybeElement,
  block: ScrollLogicalPosition = 'center'
) {
  let li: MaybeElement;
  if (typeof idxOrLI === 'number') {
    if (idxOrLI < 0) {
      idxOrLI = searchResults.childElementCount - 1;
    } else if (idxOrLI === searchResults.childElementCount - 1) {
      idxOrLI = 0;
    }
    li = searchResults.children[idxOrLI];
  } else {
    li = idxOrLI;
  }

  li ??= searchResults.firstElementChild;

  if (li) {
    li.classList.add('active');
    li.scrollIntoView({ block });
  }
}

function itemSelected(li: HTMLLIElement, ev: KeyboardEvent | MouseEvent) {
  const url = li.getAttribute('data-url')!;
  const dataTabId = li.getAttribute('data-tabId');
  let tabId: number | undefined;
  if (dataTabId) {
    tabId = +dataTabId;
  }
  return openUrl(url, {
    newTab: ev.ctrlKey,
    newWindow: ev.shiftKey,
    tabId
  });
}

const input = document.getElementById('searchBox') as HTMLInputElement;
const liTemplate = document.getElementById('result-item-template') as HTMLTemplateElement;
const searchResults = document.querySelector('.searchResults ul') as HTMLUListElement;
(() => {
  input.addEventListener('input', searchBoxInputHandler);
  document.addEventListener('keydown', searchBoxKeydownHandler);
  searchResults.addEventListener('click', listClickHandler);

  readBookmarksAndTabsData().then(filterList);
})();
