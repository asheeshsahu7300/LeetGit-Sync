document.addEventListener('DOMContentLoaded', () => {
  const tokenInput = document.getElementById('githubToken');
  const repoInput = document.getElementById('githubRepo');
  const saveBtn = document.getElementById('saveBtn');
  const statusDiv = document.getElementById('status');

  // Load existing settings
  chrome.storage.session.get(['githubToken', 'githubRepo'], (result) => {
    if (result.githubToken) tokenInput.value = result.githubToken;
    if (result.githubRepo) repoInput.value = result.githubRepo;
  });

  saveBtn.addEventListener('click', () => {
    const token = tokenInput.value.trim();
    const repo = repoInput.value.trim();

    if (!token || !repo) {
      showStatus('Please fill in both fields.', false);
      return;
    }

    chrome.storage.session.set({ githubToken: token, githubRepo: repo }, () => {
      showStatus('Settings saved securely!', true);
    });
  });

  function showStatus(message, isSuccess) {
    statusDiv.textContent = message;
    statusDiv.className = 'status show ' + (isSuccess ? 'success' : 'error');
    setTimeout(() => {
      statusDiv.className = 'status ' + (isSuccess ? 'success' : 'error');
      // Wait for transition to finish before clearing text
      setTimeout(() => {
        if (!statusDiv.classList.contains('show')) {
          statusDiv.textContent = '';
        }
      }, 300);
    }, 3000);
  }
});
