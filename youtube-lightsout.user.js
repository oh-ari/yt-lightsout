// ==UserScript==
// @name         YouTube Lights Out
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Lights out for OLED monitor people, or people who don't like full-fullscreen but want a decent theatre mode.
// @author       Ari
// @match        https://www.youtube.com/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const CONFIG = {
        buttonId: 'yt-lightsout-btn',
        overlayId: 'yt-lightsout-overlay',
        checkInterval: 1000,
        maxRetries: 30
    };

    let state = {
        isActive: false,
        originalVideoStyle: null,
        originalBodyStyle: null
    };

    const isDarkTheme = () => document.documentElement.hasAttribute('dark') ||
                         document.documentElement.hasAttribute('darker-dark-theme');

    const waitForElement = (selector, maxAttempts = CONFIG.maxRetries) => {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const checkElement = () => {
                const element = document.querySelector(selector);
                if (element) resolve(element);
                else if (++attempts >= maxAttempts) reject(new Error(`Element ${selector} not found`));
                else setTimeout(checkElement, CONFIG.checkInterval);
            };
            checkElement();
        });
    };

    const createButton = () => {
        const button = document.createElement('button');
        button.id = CONFIG.buttonId;
        button.textContent = 'Lights Out';
        button.className = 'yt-spec-button-shape-next yt-spec-button-shape-next--tonal yt-spec-button-shape-next--overlay yt-spec-button-shape-next--size-m';

        const baseStyles = `
            margin-right: 8px; border: none; border-radius: 18px; padding: 10px 16px;
            font-family: "Roboto", "Arial", sans-serif; font-size: 14px; font-weight: 500;
            cursor: pointer; transition: background-color 0.2s; display: flex;
            align-items: center; justify-content: center; min-width: 90px; height: 36px;
            position: relative;
        `;

        const lightStyles = 'background-color: #f2f2f2; color: #0f0f0f;';
        const darkStyles = 'background-color: #272727; color: #f1f1f1;';

        button.style.cssText = baseStyles + (isDarkTheme() ? darkStyles : lightStyles);

        const updateHover = (isHover) => {
            const colors = isDarkTheme() ?
                (isHover ? '#3f3f3f' : '#272727') :
                (isHover ? '#e5e5e5' : '#f2f2f2');
            button.style.backgroundColor = colors;
        };

        button.addEventListener('mouseenter', () => updateHover(true));
        button.addEventListener('mouseleave', () => updateHover(false));
        button.addEventListener('click', toggleLightsOut);

        return button;
    };

    const createOverlay = () => {
        const overlay = document.createElement('div');
        overlay.id = CONFIG.overlayId;
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background-color: rgba(0, 0, 0, 0.9); z-index: 9998;
            pointer-events: none; opacity: 0; transition: opacity 0.3s ease;
        `;
        document.body.appendChild(overlay);
        return overlay;
    };

    const updateOverlayCutout = () => {
        const overlay = document.getElementById(CONFIG.overlayId);
        const video = document.querySelector('.video-stream.html5-main-video');

        if (overlay && video) {
            const rect = video.getBoundingClientRect();
            overlay.style.clipPath = `
                polygon(0% 0%, 0% 100%, ${rect.left}px 100%, ${rect.left}px ${rect.top}px,
                ${rect.right}px ${rect.top}px, ${rect.right}px ${rect.bottom}px,
                ${rect.left}px ${rect.bottom}px, ${rect.left}px 100%, 100% 100%, 100% 0%)
            `;
        }
    };

    const getElement = (selectors) => {
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) return element;
        }
        return null;
    };

    const getVideoElement = () => getElement(['#movie_player video', 'video.html5-main-video', '.html5-main-video', 'video[src]', 'video']);
    const getVideoContainer = () => getElement(['#movie_player', '.html5-video-container', '.ytp-video-container', '#player']);

    const enableTheatreMode = () => {
        const theatreButton = document.querySelector('.ytp-size-button.ytp-button');

        if (theatreButton) {
            const isInTheatreMode = theatreButton.getAttribute('data-title-no-tooltip') === 'Default view';
            if (!isInTheatreMode) {
                theatreButton.click();
                return new Promise(resolve => setTimeout(resolve, 500));
            }
        } else {
            document.dispatchEvent(new KeyboardEvent('keydown', {
                key: 't', code: 'KeyT', keyCode: 84, which: 84, bubbles: true, cancelable: true
            }));
            return new Promise(resolve => setTimeout(resolve, 500));
        }
        return Promise.resolve();
    };

    const activateLightsOut = async () => {
        try {
            await enableTheatreMode();

            let overlay = document.getElementById(CONFIG.overlayId) || createOverlay();
            const video = getVideoElement();
            const videoContainer = getVideoContainer();

            if (video && videoContainer) {
                state.originalVideoStyle = video.style.cssText;
                state.originalBodyStyle = document.body.style.cssText;

                videoContainer.style.cssText += 'z-index: 9999; position: relative;';
                video.style.cssText += 'position: relative; z-index: 10000;';

                updateOverlayCutout();
                overlay.style.opacity = '1';

                state.isActive = true;
                updateButtonText();
            }
        } catch (error) {
        }
    };

    const deactivateLightsOut = () => {
        const overlay = document.getElementById(CONFIG.overlayId);
        if (overlay) {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.style.clipPath = '', 300);
        }

        const video = getVideoElement();
        const videoContainer = getVideoContainer();

        if (video && state.originalVideoStyle !== null) {
            video.style.cssText = state.originalVideoStyle;
        }

        if (videoContainer) {
            videoContainer.style.zIndex = '';
            videoContainer.style.position = '';
        }

        if (state.originalBodyStyle !== null) {
            document.body.style.cssText = state.originalBodyStyle;
        }

        state.isActive = false;
        updateButtonText();
    };

    const toggleLightsOut = () => state.isActive ? deactivateLightsOut() : activateLightsOut();

    const updateButtonText = () => {
        const button = document.getElementById(CONFIG.buttonId);
        if (button) button.textContent = state.isActive ? 'Lights On' : 'Lights Out';
    };

    const insertButton = async () => {
        try {
            const buttonsContainer = await waitForElement('#buttons.ytd-masthead');
            if (buttonsContainer) {
                await waitForElement('ytd-button-renderer[button-renderer]', 10);
                await new Promise(resolve => setTimeout(resolve, 1000));

                if (!document.getElementById(CONFIG.buttonId)) {
                    buttonsContainer.insertBefore(createButton(), buttonsContainer.firstChild);
                }
            }
        } catch (error) {
        }
    };

    const handlePageChange = () => {
        document.getElementById(CONFIG.buttonId)?.remove();
        document.getElementById(CONFIG.overlayId)?.remove();

        state = { isActive: false, originalVideoStyle: null, originalBodyStyle: null };
        insertButton();
    };

    const init = () => {
        insertButton();

        let currentUrl = window.location.href;
        const observer = new MutationObserver(() => {
            if (window.location.href !== currentUrl) {
                currentUrl = window.location.href;
                handlePageChange();
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
        window.addEventListener('popstate', handlePageChange);

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && state.isActive) deactivateLightsOut();
        });

        window.addEventListener('resize', () => {
            if (state.isActive) updateOverlayCutout();
        });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();