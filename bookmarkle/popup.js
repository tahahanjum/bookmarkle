(function () {
  'use strict';

  var status = document.getElementById('status');

  function applyLanguage() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = I18n.t(el.dataset.i18n);
    });
  }

  chrome.storage.local.get('bookmarkle:v1', function (res) {
    var saved = res && res['bookmarkle:v1'];
    I18n.setLanguage(saved && saved.settings ? saved.settings.language : 'auto');
    applyLanguage();
  });

  function say(msg, isErr) {
    status.textContent = msg;
    status.className = isErr ? 'err' : '';
  }

  function send(type, extra) {
    say(I18n.t('popup.working'));
    chrome.runtime.sendMessage(Object.assign({ type: type }, extra || {}), function (res) {
      if (chrome.runtime.lastError) { say(chrome.runtime.lastError.message, true); return; }
      if (!res) { say(I18n.t('popup.noResponse'), true); return; }
      if (res.ok) {
        say(res.count
          ? I18n.t('popup.savedTabs', { n: res.count, board: res.board })
          : I18n.t('popup.savedTo', { page: res.page, board: res.board }));
        setTimeout(function () { window.close(); }, 900);
      } else {
        say(res.error || I18n.t('popup.couldNotSave'), true);
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
