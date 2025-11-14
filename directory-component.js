/* =========================
   DIRECTORY MODAL COMPONENT
   ========================= */

(function() {
    'use strict';

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        // Create and inject the directory modal HTML
        createDirectoryModal();

        // Set up event listeners
        setupEventListeners();
    }

    function createDirectoryModal() {
        const modal = document.createElement('div');
        modal.className = 'directory-modal';
        modal.id = 'directory-modal';
        modal.innerHTML = `
            <div class="directory-grid">
                <a href="${getBasePath()}index.html" class="directory-box">
                    <img src="${getBasePath()}media/logos/d-head.svg" alt="Home" />
                </a>
                
                <a href="${getBasePath()}pages/music/music.html" class="directory-box">
                    <img src="${getBasePath()}media/logos/d-music.svg" alt="Music" />
                </a>

                 <a href="${getBasePath()}pages/moire/moire.html" class="directory-box">
                    <img src="${getBasePath()}media/logos/d-moire.svg" alt="Moire" />
                </a>

                <a href="${getBasePath()}pages/info/info.html" class="directory-box">
                    <img src="${getBasePath()}media/logos/d-info.svg" alt="Info" />
                </a>
                
                <a href="${getBasePath()}pages/wisdom/wisdom.html" class="directory-box">
                    <img src="${getBasePath()}media/logos/d-wisdom.svg" alt="Wisdom" />
                </a>

               
            </div>
        `;

        document.body.appendChild(modal);
    }

    function getBasePath() {
        // Determine the base path based on current location
        const path = window.location.pathname;
        if (path.includes('/pages/')) {
            return '../../';
        }
        return './';
    }

    function setupEventListeners() {
        const modal = document.getElementById('directory-modal');

        // Find all directory toggle buttons on the page
        const toggleButtons = document.querySelectorAll('[data-directory-toggle], #directoryToggle');

        toggleButtons.forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                toggleDirectory();
            });
        });

        // Escape key to close
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && modal.classList.contains('active')) {
                closeDirectory();
            }
        });

        // Handle directory link clicks
        const directoryLinks = modal.querySelectorAll('.directory-box');
        directoryLinks.forEach(link => {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                window.location.href = this.href;
            });
        });
    }

    function toggleDirectory() {
        const modal = document.getElementById('directory-modal');

        if (modal.classList.contains('active')) {
            closeDirectory();
        } else {
            openDirectory();
        }
    }

    function openDirectory() {
        const modal = document.getElementById('directory-modal');
        const toggleBtn = document.querySelector('[data-directory-toggle], #directoryToggle');

        modal.classList.add('active');

        // Update toggle button text
        if (toggleBtn) {
            toggleBtn.dataset.originalText = toggleBtn.textContent;
            toggleBtn.textContent = '[hide directory]';
        }

        // Prevent body scroll
        document.body.style.overflow = 'hidden';

        // Position modal at bottom of controls-box
        positionModal();
    }

    function closeDirectory() {
        const modal = document.getElementById('directory-modal');
        const toggleBtn = document.querySelector('[data-directory-toggle], #directoryToggle');

        modal.classList.remove('active');

        // Restore toggle button text
        if (toggleBtn && toggleBtn.dataset.originalText) {
            toggleBtn.textContent = toggleBtn.dataset.originalText;
        }

        // Restore body scroll
        document.body.style.overflow = '';
    }

    function positionModal() {
        const modal = document.getElementById('directory-modal');
        const controlsBox = document.querySelector('.controls-box, .readout-box, .nav-box:last-of-type');

        if (controlsBox) {
            const rect = controlsBox.getBoundingClientRect();
            modal.style.top = rect.bottom + 'px'; // Pixel-perfect anchor, no gap
        }
    }

    // Export functions to global scope if needed
    window.DirectoryModal = {
        open: openDirectory,
        close: closeDirectory,
        toggle: toggleDirectory
    };
})();
