(() => {
  const rootSelector = '[data-idv-root]';
  const checkoutSelector = '[data-idv-checkout]';
  const additionalSelector = '[data-idv-additional]';

  const state = {
    verified: false,
    initialized: false
  };

  const getRoots = () => Array.from(document.querySelectorAll(rootSelector));

  const setCheckoutState = (enabled) => {
    document.querySelectorAll(checkoutSelector).forEach((button) => {
      if (enabled) {
        button.removeAttribute('disabled');
        button.setAttribute('aria-disabled', 'false');
      } else {
        button.setAttribute('disabled', 'disabled');
        button.setAttribute('aria-disabled', 'true');
      }
    });

    document.querySelectorAll(additionalSelector).forEach((wrapper) => {
      wrapper.style.display = enabled ? '' : 'none';
    });
  };

  const setVerified = (verified) => {
    state.verified = verified;
    document.documentElement.setAttribute('data-idv-verified', verified ? 'true' : 'false');
    setCheckoutState(verified);

    getRoots().forEach((root) => {
      root.setAttribute('data-idv-verified', verified ? 'true' : 'false');
      const status = root.querySelector('[data-idv-status]');
      if (status) {
        if (verified) {
          status.textContent = 'Verified. You can proceed to checkout.';
          status.classList.remove('idv-block__status--error');
          status.classList.add('idv-block__status--success');
        } else {
          status.textContent = '';
          status.classList.remove('idv-block__status--error', 'idv-block__status--success');
        }
      }
    });
  };

  const setStatus = (root, message, isError) => {
    const status = root.querySelector('[data-idv-status]');
    if (!status) return;
    status.textContent = message || '';
    status.classList.toggle('idv-block__status--error', Boolean(isError));
    status.classList.toggle('idv-block__status--success', !isError && Boolean(message));
  };

  const setBusy = (root, busy) => {
    const button = root.querySelector('[data-idv-submit]');
    const fileInput = root.querySelector('[data-idv-file]');
    if (button) {
      button.disabled = busy || !fileInput || !fileInput.files || fileInput.files.length === 0;
      button.setAttribute('aria-busy', busy ? 'true' : 'false');
    }
  };

  const updateCartAttribute = async (value) => {
    try {
      await fetch('/cart/update.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          attributes: {
            id_verified: value ? 'true' : ''
          }
        })
      });
    } catch (error) {
      // Keep UI state; cart attribute sync can fail silently.
    }
  };

  const verifyFile = async (root, file) => {
    const endpoint = root.getAttribute('data-idv-endpoint');
    if (!endpoint) {
      setStatus(root, 'Verification service is not configured.', true);
      return;
    }

    setBusy(root, true);
    setStatus(root, 'Uploading ID and verifying age...');

    const formData = new FormData();
    formData.append('id_image', file);
    if (window.Shopify && Shopify.shop) {
      formData.append('shop', Shopify.shop);
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Request failed');
      }

      const data = await response.json();

      if (data && data.verified === true) {
        setVerified(true);
        await updateCartAttribute(true);
      } else {
        setVerified(false);
        setStatus(root, 'We could not verify your age. Please try another photo.', true);
      }
    } catch (error) {
      setVerified(false);
      setStatus(root, 'Verification failed. Please try again.', true);
    } finally {
      setBusy(root, false);
    }
  };

  const initRoot = (root) => {
    if (root.getAttribute('data-idv-initialized') === 'true') return;
    root.setAttribute('data-idv-initialized', 'true');

    const fileInput = root.querySelector('[data-idv-file]');
    const button = root.querySelector('[data-idv-submit]');

    if (fileInput) {
      fileInput.addEventListener('change', () => {
        setStatus(root, '');
        setBusy(root, false);
      });
    }

    if (button) {
      button.addEventListener('click', () => {
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
          setStatus(root, 'Please select a clear photo of your ID.', true);
          return;
        }
        verifyFile(root, fileInput.files[0]);
      });
    }

    const initialVerified = root.getAttribute('data-idv-verified') === 'true';
    if (initialVerified) {
      setVerified(true);
    } else if (!state.initialized) {
      setCheckoutState(false);
    }
  };

  const initAll = () => {
    getRoots().forEach(initRoot);
    state.initialized = true;
  };

  const bindCartUpdated = () => {
    document.querySelectorAll('cart-form').forEach((form) => {
      if (form.getAttribute('data-idv-bound') === 'true') return;
      form.setAttribute('data-idv-bound', 'true');
      form.addEventListener('cart-updated', () => {
        initAll();
        if (state.verified) {
          setCheckoutState(true);
        }
      });
    });
  };

  document.addEventListener('DOMContentLoaded', () => {
    initAll();
    bindCartUpdated();
  });

  document.addEventListener('shopify:section:load', () => {
    initAll();
    bindCartUpdated();
  });
})();
