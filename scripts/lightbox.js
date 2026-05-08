// Image Lightbox
    // ============================================
    function getMessageImages(message) {
        return (message?.attachments || [])
            .filter(att => att.type === 'image' && att.data)
            .map(att => ({
                src: att.data,
                name: att.name || 'Image',
                size: att.size || 0,
                mimeType: att.mimeType || ''
            }));
    }

    window.openMessageImage = function(messageIndex, attachmentIndex) {
        const message = state.messages[messageIndex];
        const images = getMessageImages(message);
        const clicked = message?.attachments?.[attachmentIndex];
        const imageIndex = Math.max(0, images.findIndex(image => image.src === clicked?.data));
        openLightbox(images, imageIndex);
    };

    function openLightbox(images, index = 0) {
        if (!images.length) return;
        state.lightbox = { open: true, images, index, zoom: 1, mode: 'fit' };
        renderLightbox();
        el.lightboxModal.classList.add('open');
        document.body.classList.add('lightbox-open');
    }

    function closeLightbox() {
        state.lightbox.open = false;
        el.lightboxModal.classList.remove('open');
        document.body.classList.remove('lightbox-open');
    }

    function renderLightbox() {
        const image = state.lightbox.images[state.lightbox.index];
        if (!image) return;
        el.lightboxImage.src = image.src;
        el.lightboxImage.alt = image.name;
        el.lightboxTitle.textContent = image.name;
        el.lightboxMeta.textContent = [
            image.mimeType || 'image',
            image.size ? formatFileSize(image.size) : '',
            `${state.lightbox.index + 1} / ${state.lightbox.images.length}`
        ].filter(Boolean).join(' · ');
        el.lightboxImage.classList.toggle('original', state.lightbox.mode === 'original');
        el.lightboxImage.style.transform = `scale(${state.lightbox.zoom})`;
        el.lightboxFit.classList.toggle('active', state.lightbox.mode === 'fit');
        el.lightboxOriginal.classList.toggle('active', state.lightbox.mode === 'original');
        el.lightboxPrev.disabled = state.lightbox.images.length <= 1;
        el.lightboxNext.disabled = state.lightbox.images.length <= 1;
    }

    function adjustLightboxZoom(delta) {
        state.lightbox.mode = 'original';
        state.lightbox.zoom = Math.min(4, Math.max(0.25, Number((state.lightbox.zoom + delta).toFixed(2))));
        renderLightbox();
    }

    function setLightboxMode(mode) {
        state.lightbox.mode = mode;
        state.lightbox.zoom = 1;
        renderLightbox();
    }

    function moveLightbox(delta) {
        if (state.lightbox.images.length <= 1) return;
        const count = state.lightbox.images.length;
        state.lightbox.index = (state.lightbox.index + delta + count) % count;
        state.lightbox.zoom = 1;
        state.lightbox.mode = 'fit';
        renderLightbox();
    }

    function initLightbox() {
        el.lightboxClose.addEventListener('click', closeLightbox);
        el.lightboxZoomIn.addEventListener('click', () => adjustLightboxZoom(0.25));
        el.lightboxZoomOut.addEventListener('click', () => adjustLightboxZoom(-0.25));
        el.lightboxFit.addEventListener('click', () => setLightboxMode('fit'));
        el.lightboxOriginal.addEventListener('click', () => setLightboxMode('original'));
        el.lightboxPrev.addEventListener('click', () => moveLightbox(-1));
        el.lightboxNext.addEventListener('click', () => moveLightbox(1));
        el.lightboxModal.addEventListener('click', (event) => {
            if (event.target === el.lightboxModal) closeLightbox();
        });
    }
