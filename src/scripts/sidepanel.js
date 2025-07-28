class SidePanelTabManager {
    // Create DOM node for bookmark or folder recursively
    createBookmarkElementNode(bookmark, level = 0) {
        if (bookmark.children && bookmark.children.length > 0) {
            const folder = document.createElement('div');
            // Preserve folder open/closed state across renders (default to expanded)
            const isCollapsed = this.folderStates.get(bookmark.id) === true;
            folder.className = 'bookmark-folder' + (isCollapsed ? ' collapsed' : '');
            folder.dataset.bookmarkId = bookmark.id;
            const header = document.createElement('div');
            header.className = 'bookmark-item bookmark-folder-header';
            header.tabIndex = 0;
            const toggle = document.createElement('span');
            toggle.className = 'bookmark-folder-toggle';
            // Set toggle icon based on collapsed state
            toggle.textContent = isCollapsed ? '▶' : '▼';
            const icon = document.createElement('div');
            icon.className = 'bookmark-icon';
            icon.textContent = '📁';
            const info = document.createElement('div');
            info.className = 'bookmark-info';
            const title = document.createElement('div');
            title.className = 'bookmark-title';
            title.innerHTML = this.escapeHtml(bookmark.title);
            info.appendChild(title);
            header.append(toggle, icon, info);
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'bookmark-children';
            bookmark.children.forEach(child => {
                const childNode = this.createBookmarkElementNode(child, level + 1);
                if (childNode) childrenContainer.appendChild(childNode);
            });
            folder.append(header, childrenContainer);
            return folder;
        } else if (bookmark.url) {
            const item = document.createElement('div');
            item.className = 'bookmark-item bookmark-child';
            item.dataset.bookmarkId = bookmark.id;
            item.dataset.url = bookmark.url;
            item.tabIndex = 0;
            const icon = document.createElement('div');
            icon.className = 'bookmark-icon';
            icon.textContent = '🔖';
            const info = document.createElement('div');
            info.className = 'bookmark-info';
            const title = document.createElement('div');
            title.className = 'bookmark-title';
            title.innerHTML = this.escapeHtml(bookmark.title);
            info.appendChild(title);
            item.append(icon, info);
            return item;
        }
        return null;
    }
    constructor() {
        this.pinnedTabs = [];
        this.openTabs = [];
        this.bookmarks = [];
        this.bookmarksExpanded = true;
        this.folderStates = new Map(); // Track open/closed state of bookmark folders
        this.refreshTimeout = null; // Debounce timer for refresh
        this.container = null;      // Cached container element
        this.intervalId = null;      // Periodic refresh fallback
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.container = document.getElementById('unifiedList');
        await this.loadData();
        this.render();
    }

    async loadData() {
        try {
            // Load tabs first (faster)
            const tabs = await chrome.tabs.query({});
            this.pinnedTabs = tabs.filter(tab => tab.pinned);
            this.openTabs = tabs.filter(tab => !tab.pinned);

            // Render tabs immediately
            this.render();

            // Load bookmarks separately (can be slower)
            const bookmarks = await chrome.bookmarks.getTree();
            this.bookmarks = bookmarks[0].children || [];

            // Re-render with bookmarks
            this.render();
        } catch (error) {
            console.error('Error loading data:', error);
            // Still render what we have
            this.render();
        }
    }

    setupEventListeners() {
        // Debounced refresh on tab and bookmark events for performance
        chrome.tabs.onCreated.addListener(() => this.debounceRefresh());
        chrome.tabs.onRemoved.addListener(() => this.debounceRefresh());
        chrome.tabs.onUpdated.addListener(() => this.debounceRefresh());
        chrome.tabs.onActivated.addListener(() => this.debounceRefresh());
        chrome.bookmarks.onCreated.addListener(() => this.debounceRefresh());
        chrome.bookmarks.onRemoved.addListener(() => this.debounceRefresh());
        chrome.bookmarks.onChanged.addListener(() => this.debounceRefresh());
    }
    // Debounced refresh to batch frequent events
    debounceRefresh() {
        clearTimeout(this.refreshTimeout);
        this.refreshTimeout = setTimeout(() => this.refresh(), 50);
    }

    async refresh() {
        await this.loadData();
        this.render();
    }

    openSettings() {
        chrome.tabs.create({ url: chrome.runtime.getURL('src/html/settings.html') });
    }

    render() {
        this.renderUnifiedList();
    }

    renderUnifiedList() {
        const container = this.container;

        // Show content immediately, even if empty
        // Clear existing content
        const pinnedContainer = document.getElementById('pinnedTabs');
        pinnedContainer.textContent = '';
        container.textContent = '';
        const fragment = document.createDocumentFragment();

        // Add pinned tabs first
        // Render pinned tabs as icons in the pinned-tabs strip
        const defaultFavicon = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="%23e8eaed"/></svg>';
        this.pinnedTabs.forEach(tab => {
            const img = document.createElement('img');
            img.className = 'pinned-tab-icon';
            img.src = tab.favIconUrl || defaultFavicon;
            img.alt = '';
            img.title = tab.title || 'Untitled';
            img.dataset.tabId = tab.id;
            img.tabIndex = 0;
            pinnedContainer.appendChild(img);
        });

        // Add open tabs
        const tabsByWindow = this.groupTabsByWindow(this.openTabs);
        // Add open tabs grouped by window
        Object.values(tabsByWindow).forEach(tabs => {
            tabs.forEach(tab => {
                fragment.appendChild(this.createTabElementNode(tab, false));
            });
        });

        // Add bookmarks at the bottom
        // Append bookmarks as DOM nodes
        this.bookmarks.forEach(bookmark => {
            const node = this.createBookmarkElementNode(bookmark, 0);
            if (node) fragment.appendChild(node);
        });

        // Always render something to avoid prolonged loading state
        // If no items, show empty state
        if (fragment.childNodes.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = 'Loading your tabs and bookmarks...';
            container.appendChild(empty);
        } else {
            container.appendChild(fragment);
        }
        this.attachEvents(container);
    }

    groupTabsByWindow(tabs) {
        return tabs.reduce((groups, tab) => {
            const windowId = tab.windowId;
            if (!groups[windowId]) {
                groups[windowId] = [];
            }
            groups[windowId].push(tab);
            return groups;
        }, {});
    }

    createTabElement(tab, isPinned = false) {
        const favicon = tab.favIconUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="%23e8eaed"/></svg>';
        const title = tab.title || 'Untitled';
        const isActive = tab.active ? ' active-tab' : '';

        return `
            <div class="tab-item${isActive}" data-tab-id="${tab.id}" tabindex="0">
                <img class="tab-favicon" src="${favicon}" alt="" onerror="this.style.display='none'">
                <div class="tab-info">
                    <div class="tab-title">${this.escapeHtml(title)}</div>
                </div>
                ${isPinned ? '<span class="pinned-indicator" tabindex="0" title="Unpin tab">📌</span>' : ''}
                <div class="tab-actions">
                    ${!isPinned ? '<button class="action-btn pin-tab" title="Pin tab">📌</button>' : ''}
                    <button class="action-btn close-tab" title="Close tab">✕</button>
                </div>
            </div>
        `;
    }
    // Create DOM node for a tab item to improve performance
    createTabElementNode(tab, isPinned = false) {
        const title = tab.title || 'Untitled';
        const item = document.createElement('div');
        item.className = 'tab-item' + (tab.active ? ' active-tab' : '');
        item.dataset.tabId = tab.id;
        item.tabIndex = 0;
        const favicon = document.createElement('img');
        favicon.className = 'tab-favicon';
        favicon.src = tab.favIconUrl || '';
        favicon.alt = '';
        favicon.onerror = () => favicon.style.display = 'none';
        const info = document.createElement('div');
        info.className = 'tab-info';
        const text = document.createElement('div');
        text.className = 'tab-title';
        text.innerHTML = this.escapeHtml(title);
        info.appendChild(text);
        const actions = document.createElement('div');
        actions.className = 'tab-actions';
        if (!isPinned) {
            const pinBtn = document.createElement('button');
            pinBtn.className = 'action-btn pin-tab';
            pinBtn.title = 'Pin tab';
            pinBtn.textContent = '📌';
            actions.appendChild(pinBtn);
        }
        const closeBtn = document.createElement('button');
        closeBtn.className = 'action-btn close-tab';
        closeBtn.title = 'Close tab';
        closeBtn.textContent = '✕';
        actions.appendChild(closeBtn);
        if (isPinned) {
            const pinned = document.createElement('span');
            pinned.className = 'pinned-indicator';
            pinned.tabIndex = 0;
            pinned.title = 'Unpin tab';
            pinned.textContent = '📌';
            item.appendChild(pinned);
        }
        item.appendChild(favicon);
        item.appendChild(info);
        item.appendChild(actions);
        return item;
    }

    createBookmarkElement(bookmark, level = 0) {
        if (bookmark.children && bookmark.children.length > 0) {
            const children = bookmark.children.map(child => this.createBookmarkElement(child, level + 1)).join('');
            const isCollapsed = this.folderStates.get(bookmark.id) !== false; // Default to collapsed unless explicitly opened
            const collapseClass = isCollapsed ? 'collapsed' : '';
            const toggleIcon = isCollapsed ? '▶' : '▼';

            return `
                <div class="bookmark-folder ${collapseClass}" data-bookmark-id="${bookmark.id}">
                    <div class="bookmark-item bookmark-folder-header" tabindex="0">
                        <span class="bookmark-folder-toggle">${toggleIcon}</span>
                        <div class="bookmark-icon">📁</div>
                        <div class="bookmark-info">
                            <div class="bookmark-title">${this.escapeHtml(bookmark.title)}</div>
                        </div>
                    </div>
                    <div class="bookmark-children">
                        ${children}
                    </div>
                </div>
            `;
        } else if (bookmark.url) {
            return `
                <div class="bookmark-item bookmark-child" data-bookmark-id="${bookmark.id}" data-url="${bookmark.url}" tabindex="0">
                    <div class="bookmark-icon">🔖</div>
                    <div class="bookmark-info">
                        <div class="bookmark-title">${this.escapeHtml(bookmark.title)}</div>
                    </div>
                </div>
            `;
        }
        return '';
    }

    attachEvents(container) {
        // Handle clicks on pinned tab icons
        const pinnedContainer = document.getElementById('pinnedTabs');
        pinnedContainer.onclick = async (e) => {
            if (e.target.classList.contains('pinned-tab-icon')) {
                const tabId = parseInt(e.target.dataset.tabId);
                await this.switchToTab(tabId);
            }
        };
        // Use direct handler assignment to avoid accumulating multiple listeners
        container.onclick = async (e) => {
            // Handle tab events
            const tabItem = e.target.closest('.tab-item');
            if (tabItem) {
                const tabId = parseInt(tabItem.dataset.tabId);
                // Action buttons first
                if (e.target.classList.contains('pinned-indicator')) {
                    await this.unpinTab(tabId);
                } else if (e.target.classList.contains('pin-tab')) {
                    await this.pinTab(tabId);
                } else if (e.target.classList.contains('close-tab')) {
                    await this.closeTab(tabId);
                } else {
                    // Any other click on the tab item switches to it
                    // Highlight immediately
                    const prevActive = container.querySelector('.tab-item.active-tab');
                    if (prevActive) prevActive.classList.remove('active-tab');
                    tabItem.classList.add('active-tab');
                    await this.switchToTab(tabId);
                }
                return;
            }

            // Handle bookmark folder toggle
            const folderHeader = e.target.closest('.bookmark-folder-header');
            if (folderHeader) {
                const folder = folderHeader.closest('.bookmark-folder');
                const toggle = folderHeader.querySelector('.bookmark-folder-toggle');
                if (folder) {
                    const bookmarkId = folder.dataset.bookmarkId;
                    const isCurrentlyCollapsed = folder.classList.contains('collapsed');

                    folder.classList.toggle('collapsed');
                    toggle.textContent = folder.classList.contains('collapsed') ? '▶' : '▼';

                    // Store the folder state
                    this.folderStates.set(bookmarkId, folder.classList.contains('collapsed') ? true : false);
                }
                return;
            }

            // Handle bookmark click on leaf items only
            const bookmarkChild = e.target.closest('.bookmark-child');
            if (bookmarkChild) {
                const url = bookmarkChild.dataset.url;
                if (url) {
                    // Highlight like a tab
                    const prev = container.querySelector('.tab-item.active-tab, .bookmark-item.active-tab');
                    if (prev) prev.classList.remove('active-tab');
                    bookmarkChild.classList.add('active-tab');
                    e.stopPropagation();
                    this.openBookmark(url);
                }
            }
        };

        // Add keyboard support via direct handler assignment
        container.onkeydown = async (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();

                // Handle pin indicator keyboard events
                if (e.target.classList.contains('pinned-indicator')) {
                    const tabItem = e.target.closest('.tab-item');
                    if (tabItem) {
                        const tabId = parseInt(tabItem.dataset.tabId);
                        await this.unpinTab(tabId);
                        return;
                    }
                }

                const tabItem = e.target.closest('.tab-item');
                if (tabItem) {
                    const tabId = parseInt(tabItem.dataset.tabId);
                    // Highlight immediately
                    const prevActiveKey = container.querySelector('.tab-item.active-tab');
                    if (prevActiveKey) prevActiveKey.classList.remove('active-tab');
                    tabItem.classList.add('active-tab');
                    await this.switchToTab(tabId);
                    return;
                }

                const folderHeader = e.target.closest('.bookmark-folder-header');
                if (folderHeader) {
                    const folder = folderHeader.closest('.bookmark-folder');
                    const toggle = folderHeader.querySelector('.bookmark-folder-toggle');
                    if (folder) {
                        const bookmarkId = folder.dataset.bookmarkId;

                        folder.classList.toggle('collapsed');
                        toggle.textContent = folder.classList.contains('collapsed') ? '▶' : '▼';

                        // Store the folder state
                        this.folderStates.set(bookmarkId, folder.classList.contains('collapsed') ? true : false);
                    }
                    return;
                }

                const bookmarkChild = e.target.closest('.bookmark-child');
                if (bookmarkChild) {
                    const url = bookmarkChild.dataset.url;
                    if (url) {
                        e.preventDefault();
                        e.stopPropagation();
                        this.openBookmark(url);
                    }
                }
            }
        };
    }

    async switchToTab(tabId) {
        try {
            // Fast tab switching - no refresh needed
            await chrome.tabs.update(tabId, { active: true });
            const tab = await chrome.tabs.get(tabId);
            await chrome.windows.update(tab.windowId, { focused: true });
        } catch (error) {
            console.error('Error switching to tab:', error);
        }
    }

    async pinTab(tabId) {
        try {
            await chrome.tabs.update(tabId, { pinned: true });
            // Only refresh after pin/unpin operations
            await this.refresh();
        } catch (error) {
            console.error('Error pinning tab:', error);
        }
    }

    async unpinTab(tabId) {
        try {
            await chrome.tabs.update(tabId, { pinned: false });
            // Only refresh after pin/unpin operations
            await this.refresh();
        } catch (error) {
            console.error('Error unpinning tab:', error);
        }
    }

    async closeTab(tabId) {
        try {
            await chrome.tabs.remove(tabId);
            // Refresh happens via onRemoved listener
        } catch (error) {
            console.error('Error closing tab:', error);
        }
    }

    openBookmark(url) {
        // Open bookmark and update UI immediately
        chrome.tabs.create({ url }, tab => {
            this.openTabs.push(tab);
            this.renderUnifiedList();
        });
    }

    extractDomain(url) {
        try {
            return new URL(url).hostname;
        } catch {
            return url;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Cleanup when the side panel is closed
    destroy() {
        clearTimeout(this.refreshTimeout);
        if (this.intervalId) clearInterval(this.intervalId);
    }
}

// Handle page visibility changes to optimize performance

document.addEventListener('DOMContentLoaded', () => {
    window.tabManager = new SidePanelTabManager();
});

// Cleanup when the page is unloaded
window.addEventListener('beforeunload', () => {
    if (window.tabManager) {
        window.tabManager.destroy();
    }
});
