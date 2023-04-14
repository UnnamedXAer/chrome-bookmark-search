// chrome.action.onClicked.addListener((tab) => {
//   if (!tab.id) {
//     console.log('no tab id in my action :(');
//     return;
//   }

//   chrome.scripting.executeScript({
//     target: { tabId: tab.id },
//     args: [tab.id],
//     func: (...args) => {
//       document.body.style.background = 'lightgreen';
//       console.log({ action: args });
//     }
//   });
// });

chrome.commands.onCommand.addListener(async (command, tab) => {
  switch (command) {
    case 'my-custom-action':
      // const bookmarks = await chrome.bookmarks.getTree();

      if (!tab || !tab.id) {
        return;
      }

      console.log({ command: 'my-custom-action' }, tab.id, new Date());
      if (tab.id > 0) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },

          func: () => {
            console.log({ command: 'my-custom-action' }, new Date());
          }
        });
      }
      break;
    default:
      console.log({ command });
      break;
  }
});
