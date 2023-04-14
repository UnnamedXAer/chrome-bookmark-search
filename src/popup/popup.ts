//--/ <reference types="chrome-types" />

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

function mapBookmarksTree(bookmarksTreeNodes: chrome.bookmarks.BookmarkTreeNode[]) {
  for (const node of bookmarksTreeNodes) {
    if (node.children?.length) {
      mapBookmarksTree(node.children);
    }

    if (!node.url) {
      continue;
    }

    bookmarksAndTabs.push(new ListItem('b', node.title, node.url, node.id));
  }
}

function searchHandler(ev: SubmitEvent) {
  ev.preventDefault();

  if (!(ev.currentTarget instanceof HTMLFormElement)) {
    return;
  }

  const formData = new FormData(ev.currentTarget);

  const idxOrId = formData.get('bookmark') as string;

  if (idxOrId?.startsWith('b')) {
    const id = idxOrId.slice(1);
    console.log({ id });
    chrome.bookmarks
      .get(id)
      .then((bookmarks) => {
        if (!bookmarks.length) {
          throw new Error(`bookmark with id (${id}) not found`);
        }

        const bookmark = bookmarks[0];

        if (!bookmark.url) {
          throw new Error(
            `selected bookmark (${bookmark.title}) is a folder, or has no url`
          );
        }

        return chrome.tabs.update({
          url: bookmark.url
        });
      })
      .catch(console.error);

    return;
  }

  const idx = +idxOrId;
  chrome.tabs
    .query({ index: idx })
    .then((tabs) => {
      if (!tabs.length) {
        throw new Error('tab not found');
      }
      if (!tabs[0].id) {
        throw new Error('tab has no id');
      }
      return tabs[0].id;
    })
    .then((id) => {
      return chrome.tabs.update(id, { active: true }).catch(console.error);
    })
    .catch(console.error);
}

function filterList(value: string) {
  const fragment = document.createDocumentFragment();

  value = value.toLowerCase();

  const matches = bookmarksAndTabs.filter((x) => x.title.toLowerCase().includes(value));

  matches.map((item, i) => {
    const li = liTemplate.content.cloneNode(true) as HTMLLIElement;
    li.innerText = item.title;
    li.setAttribute('data-id', '' + item.id || `${item.type}:${i}`);
    li.setAttribute('data-url', item.url);
  });

  searchResults.replaceChildren(fragment);
}

async function openUrlInCurrentTab(url: string) {
  return chrome.tabs.update({
    url: url
  });
}

const input = document.getElementById('bookmarkBox') as HTMLInputElement;
const liTemplate = document.getElementById('result-item-template') as HTMLTemplateElement;
const searchResults = document.querySelector('#searchResults ul') as HTMLUListElement;
(() => {
  input.addEventListener('change', (ev) => {
    searchHandler(ev as SubmitEvent);
  });

  const button = document.getElementById('bookmarkSearchBtn') as HTMLButtonElement;

  button.addEventListener('click', (ev) => {
    input.value;
    filterList(input.value);
  });

  searchResults.addEventListener('click', (ev) => {
    if (!(ev.target instanceof HTMLElement) || ev.target.nodeName !== 'LI') {
      return;
    }

    const url = ev.target.getAttribute('data-url')!;
    openUrlInCurrentTab(url);
  });

  readBookmarksAndTabsData();
  filterList('');
})();
