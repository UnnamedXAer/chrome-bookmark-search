function fillDatalist() {
  chrome.tabs.query({}, (tabs) => {
    const fragment = document.createDocumentFragment();

    tabsOptions = tabs.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t.index;
      opt.text = t.title || t.url;
      fragment.appendChild(opt);
    });

    chrome.bookmarks.getTree((bookmarks) => {
      const barBookmarks =
        bookmarks[0].children?.find((b) => b.title === 'Bookmarks bar')?.children || [];

      bookmarksOptions = barBookmarks.forEach((b) => {
        const opt = document.createElement('option');
        opt.value = `b${b.id}`;
        opt.text = b.title || b.url;
        fragment.appendChild(opt);
      });

      const datalist = document.querySelector('datalist');
      datalist.appendChild(fragment);
    });
  });
}

/**
 *
 * @param {SubmitEvent} ev
 */
function searchHandler(ev) {
  ev.preventDefault();
  const formData = new FormData(ev.currentTarget, ev.submitter);

  const idxOrId = formData.get('bookmark');

  if (idxOrId.startsWith('b')) {
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

        chrome.tabs
          .getCurrent()
          .then((tab) => {
            debugger;
            tab.url = bookmark.url;
          })
          .catch(console.error);
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
      chrome.tabs.update(id, { active: true }).catch(console.error);
    })
    .catch(console.error);
}

(() => {
  const form = document.querySelector('form');
  form.addEventListener('submit', searchHandler);

  fillDatalist();
})();
