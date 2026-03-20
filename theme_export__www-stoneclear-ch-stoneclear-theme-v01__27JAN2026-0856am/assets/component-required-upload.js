(() => {
  const wrapperSelector = '[data-required-upload]';
  const fileSelector = '[data-required-upload-file]';
  const hiddenSelector = '[data-required-upload-value]';
  const statusSelector = '[data-required-upload-status]';
  const cartUploadAttribute = 'ID Upload URL';

  const MAX_DIMENSION = 1000;
  const JPEG_QUALITY = 0.62;
  const DIRECT_UPLOAD_MAX_BYTES = 1200 * 1024;
  const SKIP_COMPRESSION_MAX_DIMENSION = 1800;
  let cartPromise;

  const setStatus = (wrapper, text, color) => {
    const status = wrapper.querySelector(statusSelector);
    if (!status) return;
    status.textContent = text || '';
    status.style.color = color || '';
  };

  const readImage = async (file) => {
    if (typeof createImageBitmap === 'function') {
      try {
        return await createImageBitmap(file);
      } catch (error) {
        // Fall back to Image decoding below.
      }
    }

    return new Promise((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);

      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('invalid_image'));
      };
      image.src = objectUrl;
    });
  };

  const closeImage = (image) => {
    if (image && typeof image.close === 'function') {
      image.close();
    }
  };

  const compressImage = async (file) => {
    if (!file.type.startsWith('image/')) return file;

    if (file.size <= DIRECT_UPLOAD_MAX_BYTES) {
      return file;
    }

    const image = await readImage(file);
    const width = image.naturalWidth || image.width || 0;
    const height = image.naturalHeight || image.height || 0;

    if (Math.max(width, height) <= SKIP_COMPRESSION_MAX_DIMENSION) {
      closeImage(image);
      return file;
    }

    if (!width || !height) {
      closeImage(image);
      return file;
    }

    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    if (targetWidth === width && targetHeight === height) {
      closeImage(image);
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      closeImage(image);
      return file;
    }
    context.drawImage(image, 0, 0, targetWidth, targetHeight);
    closeImage(image);

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
    });

    if (!blob) return file;

    const fileName = file.name.replace(/\.[^/.]+$/, '') + '.jpg';
    return new File([blob], fileName, { type: 'image/jpeg' });
  };

  const uploadFile = async (endpoint, file) => {
    const body = new FormData();
    body.append('file', file);

    const response = await fetch(endpoint, {
      method: 'POST',
      body,
      credentials: 'omit'
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.ok || !data.url) {
      throw new Error(data.error || 'upload_failed');
    }

    return data.url;
  };

  const getCart = async () => {
    if (!cartPromise) {
      cartPromise = fetch('/cart.js', {
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      }).then((response) => response.json());
    }

    return cartPromise;
  };

  const setCartUploadAttribute = async (url) => {
    await fetch('/cart/update.js', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({
        attributes: {
          [cartUploadAttribute]: url || ''
        }
      })
    });

    cartPromise = Promise.resolve({
      attributes: {
        [cartUploadAttribute]: url || ''
      },
      items: url ? [{}] : []
    });
  };

  const clearCartUploadAttribute = async () => {
    await setCartUploadAttribute('');
  };

  const ensureReuseToggle = (wrapper, fileInput) => {
    let toggle = wrapper.querySelector('[data-required-upload-toggle]');
    if (toggle) return toggle;

    toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.textContent = 'Anderes Bild hochladen';
    toggle.setAttribute('data-required-upload-toggle', 'true');
    toggle.style.marginTop = '8px';
    toggle.style.display = 'none';
    fileInput.insertAdjacentElement('afterend', toggle);
    return toggle;
  };

  const setUploadUiMode = (wrapper, hiddenInput, fileInput, reuseActive) => {
    const toggle = ensureReuseToggle(wrapper, fileInput);
    const label = wrapper.querySelector(`label[for="${fileInput.id}"]`);
    const helpTexts = wrapper.querySelectorAll('small:not([data-required-upload-status])');

    if (label) {
      label.style.display = reuseActive ? 'none' : '';
    }
    fileInput.style.display = reuseActive ? 'none' : '';
    helpTexts.forEach((node) => {
      node.style.display = reuseActive ? 'none' : '';
    });
    toggle.style.display = reuseActive ? '' : 'none';

    if (!reuseActive) {
      fileInput.value = '';
    }

    toggle.onclick = async () => {
      hiddenInput.value = '';
      setUploadUiMode(wrapper, hiddenInput, fileInput, false);
      setStatus(wrapper, '', '');
      await clearCartUploadAttribute().catch(() => {});
      fileInput.click();
    };
  };

  const toggleSubmit = (form, disabled) => {
    form.querySelectorAll('button[type="submit"]').forEach((button) => {
      if (disabled) {
        button.setAttribute('disabled', 'disabled');
        button.setAttribute('aria-disabled', 'true');
      } else {
        button.removeAttribute('disabled');
        button.setAttribute('aria-disabled', 'false');
      }
    });
  };

  const bindWrapper = (wrapper) => {
    if (wrapper.getAttribute('data-required-upload-bound') === 'true') return;
    wrapper.setAttribute('data-required-upload-bound', 'true');

    const fileInput = wrapper.querySelector(fileSelector);
    const hiddenInput = wrapper.querySelector(hiddenSelector);
    if (!fileInput || !hiddenInput) return;

    const form = wrapper.closest('form');
    if (!form) return;

    let uploading = false;

    getCart()
      .then((cart) => {
        const attributes = cart && cart.attributes ? cart.attributes : {};
        const itemCount = Array.isArray(cart && cart.items) ? cart.items.length : 0;
        const existingUploadUrl = (attributes[cartUploadAttribute] || '').trim();

        if (itemCount === 0 && existingUploadUrl) {
          clearCartUploadAttribute().catch(() => {});
          return;
        }

        if (!existingUploadUrl) return;

        hiddenInput.value = existingUploadUrl;
        setUploadUiMode(wrapper, hiddenInput, fileInput, true);
        setStatus(wrapper, 'ID bereits fuer diesen Warenkorb hochgeladen.', '#1a7f37');
      })
      .catch(() => {});

    const validateForm = () => {
      if (uploading) {
        return false;
      }
      return hiddenInput.value !== '';
    };

    form.addEventListener('submit', (event) => {
      if (!validateForm()) {
        event.preventDefault();
        const message = wrapper.dataset.uploadError || 'Upload fehlgeschlagen. Bitte erneut versuchen.';
        setStatus(wrapper, message, '#b00000');
      }
    });

    fileInput.addEventListener('change', async () => {
      hiddenInput.value = '';

      if (!fileInput.files || fileInput.files.length === 0) {
        setStatus(wrapper, '', '');
        toggleSubmit(form, false);
        return;
      }

      const endpoint = (wrapper.dataset.uploadEndpoint || '').trim();
      if (!endpoint) {
        setStatus(wrapper, 'Upload endpoint fehlt.', '#b00000');
        return;
      }

      uploading = true;
      toggleSubmit(form, true);
      setStatus(wrapper, 'Bild wird vorbereitet...', '#8a6a00');

      try {
        const compressed = await compressImage(fileInput.files[0]);
        setStatus(wrapper, wrapper.dataset.uploadLoading || 'Bild wird hochgeladen...', '#8a6a00');
        const url = await uploadFile(endpoint, compressed);
        await setCartUploadAttribute(url);
        hiddenInput.value = url;
        setUploadUiMode(wrapper, hiddenInput, fileInput, true);
        setStatus(wrapper, wrapper.dataset.uploadSuccess || 'Upload erfolgreich', '#1a7f37');
      } catch (error) {
        hiddenInput.value = '';
        setStatus(wrapper, wrapper.dataset.uploadError || 'Upload fehlgeschlagen. Bitte erneut versuchen.', '#b00000');
      } finally {
        uploading = false;
        toggleSubmit(form, false);
      }
    });
  };

  const init = () => {
    document.querySelectorAll(wrapperSelector).forEach(bindWrapper);
  };

  document.addEventListener('DOMContentLoaded', init);
  document.addEventListener('shopify:section:load', init);
})();
