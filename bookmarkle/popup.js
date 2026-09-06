(function () {
  'use strict';

  var status = document.getElementById('status');

  function say(msg, isErr) {
    status.textContent = msg;
    status.className = isErr ? 'err' : '';
  }

  function send(type, extra) {
    say('Working...');
    chrome.runtime.sendMessage(Object.assign({ type: type }, extra || {}), function (res) {
      if (chrome.runtime.lastError) { say(chrome.runtime.lastError.message, true); return; }
      if (!res) { say('No response from Bookmarkle.', true); return; }
      if (res.ok) {
        say(res.count ? 'Saved ' + res.count + ' tabs to "' + res.board + '".'
                      : 'Saved to ' + res.page + ' / ' + res.board + '.');
        setTimeout(function () { window.close(); }, 900);
      } else {
        say(res.error || 'Could not save.', true);
      }
    });
  }

  document.getElementById('save').addEventListener('click', function () {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      send('saveCurrent', { tab: tabs[0] });
    });
  });

  document.getElementById('save-all').addEventListener('click', function () {
    send('saveAllTabs');
  });

  document.getElementById('open').addEventListener('click', function () {
    chrome.tabs.create({ url: 'newtab.html' });
    window.close();
  });
})();
