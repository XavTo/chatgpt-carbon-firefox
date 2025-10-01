// content.js — Fournit les utilitaires nécessaires au background sans injecter d'UI permanente.

(function () {
  const browserApi = typeof browser !== 'undefined'
    ? browser
    : (typeof chrome !== 'undefined' ? chrome : null);

  if (!browserApi || !browserApi.runtime) {
    return;
  }

  function getLastSizes() {
    let promptChars = 0;
    const textarea = document.querySelector('textarea');
    if (textarea && textarea.value) {
      promptChars = textarea.value.length;
    }

    let replyChars = 0;
    const assistantBlocks = document.querySelectorAll('[data-message-author-role="assistant"]');
    if (assistantBlocks && assistantBlocks.length) {
      const last = assistantBlocks[assistantBlocks.length - 1];
      const text = last.innerText || last.textContent || '';
      replyChars = text.trim().length;
    }

    return { promptChars, replyChars };
  }

  browserApi.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) {
      return;
    }

    if (msg.type === 'gptcarbon:lastMessageSizes') {
      sendResponse(getLastSizes());
      return true;
    }
  });
})();
