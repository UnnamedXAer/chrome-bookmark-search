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
    fragment.appendChild(li);
  });

  if (fragment.childElementCount) {
    (fragment.firstChild as HTMLLIElement).classList.add('active');
  }

  searchResults.replaceChildren(fragment);
}

async function openUrlInCurrentTab(url: string) {
  return chrome.tabs.update({
    url: url
  });
}

function listClickHandler(ev: MouseEvent) {
  if (!(ev.target instanceof HTMLElement) || ev.target.nodeName !== 'LI') {
    return;
  }

  const url = ev.target.getAttribute('data-url')!;
  openUrlInCurrentTab(url);
}

function searchBoxKeydownHandler(ev: KeyboardEvent) {
  switch (ev.key) {
    case 'Enter': {
      const li = searchResults.querySelector('li.active');
      if (!li) {
        break;
      }

      const url = li.getAttribute('data-url')!;
      openUrlInCurrentTab(url);
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
  const button = document.getElementById('searchBoxBtn') as HTMLButtonElement;
  button.addEventListener('click', filterList);
  searchResults.addEventListener('click', listClickHandler);

  readBookmarksAndTabsData().then(filterList);
})();
