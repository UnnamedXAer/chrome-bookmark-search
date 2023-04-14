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
  } = {}
) {
  if (typeof config.tabId !== 'undefined') {
    if (config.tabId !== void 0) {
      await openUrlInTab(url, config.tabId, true);
      return window.close();
    }
  }

  if (config.newTab) {
    await openUrlInNewTab(url, true);
  } else {
    await openUrlInCurrentTab(url);
  }

  return window.close();
}

function openUrlInTab(url: string, tabId: number, active: boolean) {
  return chrome.tabs
    .update(tabId, {
      url: url,
      active
    })
    .then((tab) => {
      console.log('active tab set, about to highlight...', tab);
      // following doesn't work
      return chrome.tabs.highlight({
        tabs: tabId,
        windowId: tab?.windowId
      });
    });
}

function openUrlInCurrentTab(url: string) {
  return chrome.tabs.update({
    url: url
  });
}

function openUrlInNewTab(url: string, active: boolean) {
  return chrome.tabs.create({
    url,
    active
  });
}

function listClickHandler(ev: MouseEvent) {
  if (!(ev.target instanceof HTMLElement) || ev.target.nodeName !== 'LI') {
    return;
  }

  const url = ev.target.getAttribute('data-url')!;
  openUrl(url);
}

function searchBoxKeydownHandler(ev: KeyboardEvent) {
  switch (ev.key) {
    case 'Enter': {
      const li = searchResults.querySelector('li.active');
      if (!li) {
        break;
      }

      const url = li.getAttribute('data-url')!;
      const dataTabId = li.getAttribute('data-tabId');
      let tabId: number | undefined;
      if (dataTabId) tabId = +dataTabId || void 0;
      openUrl(url, {
        newTab: ev.ctrlKey,
        tabId
      });
      break;
    }
    case 'Esc': {
      input.value = '';
      break;
    }
    case 'ArrowUp': {
      if (searchResults.children.length < 2) {
        break;
      }
      const li = searchResults.querySelector('li.active');
      if (!li) {
        break;
      }
      li.classList.remove('active');

      const prevElement = (li.previousElementSibling || searchResults.lastElementChild)!;
      prevElement.classList.add('active');
      prevElement.scrollIntoView();
      break;
    }
    case 'ArrowDown': {
      if (searchResults.children.length < 2) {
        break;
      }
      const li = searchResults.querySelector('li.active');
      if (!li) {
        break;
      }
      li.classList.remove('active');

      const nextElement = (li.nextElementSibling || searchResults.firstElementChild)!;
      nextElement.classList.add('active');
      nextElement.scrollIntoView();
      break;
    }
    default:
      if (ev.key !== 'Tab' && document.activeElement !== input) {
        input.focus();
      }
      break;
  }
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
