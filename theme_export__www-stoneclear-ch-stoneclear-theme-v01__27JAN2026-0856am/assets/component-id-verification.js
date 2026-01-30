(() => {
  const checkoutSelector = '[data-idv-checkout]';
  const additionalSelector = '[data-idv-additional]';
  const blockSelector = '[data-idv-block]';
  const fileSelector = '[data-idv-file]';
  const urlSelector = '[data-idv-url]';
  const successSelector = '[data-idv-success]';
  const loadingSelector = '[data-idv-loading]';
  const errorSelector = '[data-idv-error]';
  const buttonTextSelector = '.idv-block__button .button__text';

  const MAX_DIMENSION = 1600;
  const JPEG_QUALITY = 0.72;

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

  const getBlockElements = () => {
    const block = document.querySelector(blockSelector);
    if (!block) return null;
    return {
      block,
      fileInput: block.querySelector(fileSelector),
      urlInput: block.querySelector(urlSelector),
      success: block.querySelector(successSelector),
      loading: block.querySelector(loadingSelector),
      error: block.querySelector(errorSelector),
      buttonText: block.querySelector(buttonTextSelector),
      uploadUrl: block.dataset.idvUploadUrl || '',
    };
  };

  const hasUploadedFile = (elements) => {
    return Boolean(elements && elements.urlInput && elements.urlInput.value);
  };

  const setVisible = (el, visible) => {
    if (!el) return;
    el.classList.toggle('is-visible', visible);
  };

  const setError = (el, message) => {
    if (!el) return;
    el.textContent = message || '';
    setVisible(el, Boolean(message));
  };

  const setLoading = (el, loading) => {
    setVisible(el, loading);
  };

  const setSuccess = (el, success) => {
    if (!el) return;
    el.classList.toggle('is-visible', success);
  };

  const setButtonText = (el, text) => {
    if (!el) return;
    el.textContent = text;
  };

  const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('read_failed'));
    reader.readAsDataURL(file);
  });

  const loadImageFromFile = async (file) => {
    if ('createImageBitmap' in window) {
      try {
        return await createImageBitmap(file);
      } catch (err) {
        // fallback to Image element
      }
    }
    const dataUrl = await readFileAsDataUrl(file);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image_load_failed'));
      img.src = dataUrl;
    });
  };

  const compressImage = async (file) => {
    const image = await loadImageFromFile(file);
    const width = image.width || image.naturalWidth;
    const height = image.height || image.naturalHeight;
    if (!width || !height) return file;

    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise((resolve) => {
      canvas.toBlob((result) => resolve(result), 'image/jpeg', JPEG_QUALITY);
    });

    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
  };

  const uploadFile = async (uploadUrl, file) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('upload_failed');
    }

    const data = await response.json();
    if (!data || !data.ok || !data.url) {
      throw new Error(data && data.error ? data.error : 'upload_failed');
    }

    return data;
  };

  const bindCartUpdated = () => {
    document.querySelectorAll('cart-form').forEach((form) => {
      if (form.getAttribute('data-idv-bound') === 'true') return;
      form.setAttribute('data-idv-bound', 'true');
      form.addEventListener('cart-updated', () => {
        const elements = getBlockElements();
        setCheckoutState(hasUploadedFile(elements));
      });
    });
  };

  const bindFileChange = () => {
    const elements = getBlockElements();
    if (!elements || !elements.fileInput) return;
    if (elements.fileInput.getAttribute('data-idv-bound') === 'true') return;

    elements.fileInput.setAttribute('data-idv-bound', 'true');
    elements.fileInput.addEventListener('change', async () => {
      const { fileInput, urlInput, success, loading, error, buttonText, uploadUrl } = elements;
      if (!fileInput || !urlInput) return;
      if (!fileInput.files || fileInput.files.length === 0) {
        urlInput.value = '';
        setSuccess(success, false);
        setLoading(loading, false);
        setError(error, '');
        setCheckoutState(false);
        return;
      }

      if (!uploadUrl || uploadUrl.indexOf('http') !== 0) {
        setError(error, 'Upload-URL fehlt.');
        setCheckoutState(false);
        return;
      }

      const originalText = buttonText ? buttonText.textContent : '';

      try {
        setError(error, '');
        setSuccess(success, false);
        setLoading(loading, true);
        setCheckoutState(false);
        if (buttonText) {
          setButtonText(buttonText, 'Lade hoch...');
        }
        fileInput.setAttribute('disabled', 'disabled');

        const compressed = await compressImage(fileInput.files[0]);
        const result = await uploadFile(uploadUrl, compressed);

        urlInput.value = result.url;
        setSuccess(success, true);
        setLoading(loading, false);
        setCheckoutState(true);
      } catch (err) {
        urlInput.value = '';
        setSuccess(success, false);
        setLoading(loading, false);
        setCheckoutState(false);
        setError(error, 'Upload fehlgeschlagen. Bitte erneut versuchen.');
      } finally {
        if (buttonText) {
          setButtonText(buttonText, originalText || 'ID Hochladen');
        }
        fileInput.removeAttribute('disabled');
      }
    });
  };

  document.addEventListener('DOMContentLoaded', () => {
    setCheckoutState(hasUploadedFile(getBlockElements()));
    bindFileChange();
    bindCartUpdated();
  });

  document.addEventListener('shopify:section:load', () => {
    setCheckoutState(hasUploadedFile(getBlockElements()));
    bindFileChange();
    bindCartUpdated();
  });
})();
