/**
 * StudioFlow PWA Initialization
 * Handles Service Worker registration and custom Install Prompt logic.
 */
(function () {
  // 1. Guard against incompatible browsers
  if (!('serviceWorker' in navigator)) return;

  let deferredPrompt = null;
  let installButton = null;

  // 2. Check if the app is already installed/running in standalone mode
  function isStandalone() {
    return (
      window.matchMedia('(display-mode: standalone)').matches || 
      window.navigator.standalone === true ||
      document.referrer.includes('android-app://')
    );
  }

  // 3. Create and inject the floating Install Button
  function ensureInstallButton() {
    // If the button exists or we are already in the app, don't create it
    if (installButton || isStandalone()) return;

    installButton = document.createElement('button');
    installButton.id = 'pwa-install-action';
    
    // Using a more descriptive innerHTML for a better UX
    installButton.innerHTML = `
      <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="margin-right:2px">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
      </svg>
      <span>Install App</span>
    `;
    
    installButton.type = 'button';
    // Style optimized for both Teacher and Student views
    installButton.style.cssText = `
      position: fixed;
      right: 20px;
      bottom: 20px;
      z-index: 9999;
      display: none;
      align-items: center;
      gap: 8px;
      padding: 12px 20px;
      border-radius: 16px;
      border: none;
      background: #0f766e;
      color: #ffffff;
      font-family: 'Manrope', sans-serif;
      font-weight: 800;
      font-size: 14px;
      box-shadow: 0 10px 25px -5px rgba(15, 118, 110, 0.4);
      cursor: pointer;
      transition: transform 0.2s, background 0.2s;
    `;

    // Interaction logic
    installButton.addEventListener('mouseenter', () => installButton.style.transform = 'translateY(-2px)');
    installButton.addEventListener('mouseleave', () => installButton.style.transform = 'translateY(0)');
    
    installButton.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      
      // Show the native browser install prompt
      deferredPrompt.prompt();
      
      // Wait for the user to respond to the prompt
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to install prompt: ${outcome}`);
      
      // We've used the prompt, it can't be used again
      deferredPrompt = null;
      installButton.style.display = 'none';
    });

    document.body.appendChild(installButton);
  }

  // 4. Listen for the 'beforeinstallprompt' event (mostly Chrome/Android/Edge)
  window.addEventListener('beforeinstallprompt', (event) => {
    // Prevent the default mini-infobar from appearing on mobile
    event.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = event;
    
    ensureInstallButton();
    // Show the button only if we have the prompt ready
    if (installButton) {
      installButton.style.display = 'inline-flex';
    }
  });

  // 5. Cleanup if the user installs via the browser's own menu
  window.addEventListener('appinstalled', (event) => {
    console.log('StudioFlow was successfully installed.');
    deferredPrompt = null;
    if (installButton) {
      installButton.style.display = 'none';
    }
  });

  // 6. Register Service Worker on load
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('sw.js');
      console.log('ServiceWorker registration successful with scope: ', registration.scope);
    } catch (error) {
      console.error('ServiceWorker registration failed: ', error);
    }
  });
})();