// Manifest content scripts cannot be ES modules, so this classic script imports the module graph.
(async () => {
  try {
    const { startGuard } = await import(chrome.runtime.getURL('src/content/guard.js'));
    await startGuard();
  } catch (error) {
    console.warn('[AWS Hop] production guard did not start:', error);
  }
})();
