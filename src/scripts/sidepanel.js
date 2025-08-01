class SidePanelTabManager {
    // Create DOM node for bookmark or folder recursively
    createBookmarkElementNode(bookmark, level = 0) {
        if (bookmark.children && bookmark.children.length > 0) {
            const folder = document.createElement('div');
            // Default to collapsed (closed) unless explicitly set to false (open)
            // If no state is saved, default to true (closed)
            const isCollapsed = this.folderStates.has(bookmark.id) ?
                this.folderStates.get(bookmark.id) : true;
            folder.className = 'bookmark-folder' + (isCollapsed ? ' collapsed' : '');
            folder.dataset.bookmarkId = bookmark.id;
            folder.draggable = true;

            const header = document.createElement('div');
            header.className = 'bookmark-item bookmark-folder-header';
            header.tabIndex = 0;

            const toggle = document.createElement('span');
            toggle.className = 'bookmark-folder-toggle';
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
            item.draggable = true;

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
        this.folderStates = new Map();
        this.refreshTimeout = null;
        this.container = null;
        this.intervalId = null;
        this.draggedElement = null;
        this.draggedData = null;
        this.dropIndicators = [];
        this.dragStartPos = null;
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.container = document.getElementById('unifiedList');
        await this.loadFolderStates();
        await this.loadData();
        this.render();
    }

    async loadFolderStates() {
        try {
            const result = await chrome.storage.local.get(['bookmarkFolderStates']);
            if (result.bookmarkFolderStates) {
                this.folderStates = new Map(Object.entries(result.bookmarkFolderStates));
            }
        } catch (error) {
            console.error('Error loading folder states:', error);
        }
    }

    async saveFolderStates() {
        try {
            const folderStatesObj = Object.fromEntries(this.folderStates);
            await chrome.storage.local.set({ bookmarkFolderStates: folderStatesObj });
        } catch (error) {
            console.error('Error saving folder states:', error);
        }
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
            img.draggable = true;
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
        this.attachDragEvents(container);
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
        item.draggable = true;

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
            // Default to collapsed (closed) unless explicitly set to false (open)
            // If no state is saved, default to true (closed)
            const isCollapsed = this.folderStates.has(bookmark.id) ?
                this.folderStates.get(bookmark.id) : true;
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
            // Don't handle clicks during drag operations
            if (this.draggedElement) return;

            if (e.target.classList.contains('pinned-tab-icon')) {
                const tabId = parseInt(e.target.dataset.tabId);
                await this.switchToTab(tabId);
            }
        };
        // Use direct handler assignment to avoid accumulating multiple listeners
        container.onclick = async (e) => {
            // Don't handle clicks during drag operations
            if (this.draggedElement) return;

            const tabItem = e.target.closest('.tab-item');
            if (tabItem) {
                const tabId = parseInt(tabItem.dataset.tabId);
                if (e.target.classList.contains('pinned-indicator')) {
                    await this.unpinTab(tabId);
                } else if (e.target.classList.contains('pin-tab')) {
                    await this.pinTab(tabId);
                } else if (e.target.classList.contains('close-tab')) {
                    await this.closeTab(tabId);
                } else {
                    const prevActive = container.querySelector('.tab-item.active-tab');
                    if (prevActive) prevActive.classList.remove('active-tab');
                    tabItem.classList.add('active-tab');
                    await this.switchToTab(tabId);
                }
                return;
            }

            const folderHeader = e.target.closest('.bookmark-folder-header');
            if (folderHeader) {
                const folder = folderHeader.closest('.bookmark-folder');
                const toggle = folderHeader.querySelector('.bookmark-folder-toggle');
                if (folder) {
                    const bookmarkId = folder.dataset.bookmarkId;
                    const isCurrentlyCollapsed = folder.classList.contains('collapsed');

                    folder.classList.toggle('collapsed');
                    toggle.textContent = folder.classList.contains('collapsed') ? '▶' : '▼';

                    // Store the folder state (false = open, true = closed)
                    this.folderStates.set(bookmarkId, folder.classList.contains('collapsed'));
                    this.saveFolderStates();
                }
                return;
            }

            const bookmarkChild = e.target.closest('.bookmark-child');
            if (bookmarkChild) {
                const url = bookmarkChild.dataset.url;
                if (url) {
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

                        // Store the folder state (false = open, true = closed)
                        this.folderStates.set(bookmarkId, folder.classList.contains('collapsed'));
                        this.saveFolderStates();
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

    attachDragEvents(container) {
        const pinnedContainer = document.getElementById('pinnedTabs');

        // Drag start event
        const handleDragStart = (e) => {
            // Prevent dragging on action buttons
            if (e.target.classList.contains('action-btn') ||
                e.target.classList.contains('close-tab') ||
                e.target.classList.contains('pin-tab') ||
                e.target.classList.contains('bookmark-folder-toggle')) {
                e.preventDefault();
                return;
            }

            this.draggedElement = e.target;
            e.target.classList.add('dragging');

            if (e.target.classList.contains('pinned-tab-icon')) {
                this.draggedData = {
                    type: 'pinnedTab',
                    tabId: parseInt(e.target.dataset.tabId),
                    element: e.target
                };
            } else if (e.target.classList.contains('tab-item')) {
                this.draggedData = {
                    type: 'tab',
                    tabId: parseInt(e.target.dataset.tabId),
                    element: e.target
                };
            } else if (e.target.classList.contains('bookmark-folder')) {
                this.draggedData = {
                    type: 'bookmarkFolder',
                    bookmarkId: e.target.dataset.bookmarkId,
                    element: e.target
                };
            } else if (e.target.classList.contains('bookmark-child')) {
                this.draggedData = {
                    type: 'bookmark',
                    bookmarkId: e.target.dataset.bookmarkId,
                    element: e.target
                };
            }

            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', e.target.outerHTML);
        };

        // Drag over event
        const handleDragOver = (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            const target = e.target.closest('.tab-item, .bookmark-item, .bookmark-folder, .pinned-tab-icon');
            if (target && target !== this.draggedElement && this.draggedData) {
                this.clearDropIndicators();

                // Only show drop indicator for compatible types
                const isCompatible = this.isDropCompatible(this.draggedData.type, target);
                if (isCompatible) {
                    // Determine if we should show divider above or below based on mouse position
                    const rect = target.getBoundingClientRect();
                    const midpoint = rect.top + rect.height / 2;

                    if (e.clientY < midpoint) {
                        target.classList.add('drag-over');
                    } else {
                        target.classList.add('drag-over-bottom');
                    }
                }
            }
        };

        // Drag leave event
        const handleDragLeave = (e) => {
            const target = e.target.closest('.tab-item, .bookmark-item, .bookmark-folder, .pinned-tab-icon');
            if (target) {
                target.classList.remove('drag-over', 'drag-over-bottom');
            }
        };

        // Drop event
        const handleDrop = async (e) => {
            e.preventDefault();
            this.clearDropIndicators();

            const target = e.target.closest('.tab-item, .bookmark-item, .bookmark-folder, .pinned-tab-icon');
            if (target && target !== this.draggedElement && this.draggedData) {
                const isCompatible = this.isDropCompatible(this.draggedData.type, target);
                if (isCompatible) {
                    await this.handleDrop(target, this.draggedData);
                }
            }
        };

        // Drag end event
        const handleDragEnd = (e) => {
            e.target.classList.remove('dragging');
            this.clearDropIndicators();
            this.draggedElement = null;
            this.draggedData = null;
        };

        // Attach events to containers
        [container, pinnedContainer].forEach(containerEl => {
            containerEl.addEventListener('dragstart', handleDragStart);
            containerEl.addEventListener('dragover', handleDragOver);
            containerEl.addEventListener('dragleave', handleDragLeave);
            containerEl.addEventListener('drop', handleDrop);
            containerEl.addEventListener('dragend', handleDragEnd);
        });
    }

    clearDropIndicators() {
        document.querySelectorAll('.drag-over, .drag-over-bottom').forEach(el => {
            el.classList.remove('drag-over', 'drag-over-bottom');
        });
    }

    isDropCompatible(draggedType, targetElement) {
        if (draggedType === 'pinnedTab' && targetElement.classList.contains('pinned-tab-icon')) {
            return true;
        }
        if (draggedType === 'tab' && targetElement.classList.contains('tab-item')) {
            return true;
        }
        if ((draggedType === 'bookmark' || draggedType === 'bookmarkFolder') &&
            (targetElement.classList.contains('bookmark-item') || targetElement.classList.contains('bookmark-folder'))) {
            return true;
        }
        return false;
    }

    async handleDrop(targetElement, draggedData) {
        // Determine drop position based on which class is set
        const dropBelow = targetElement.classList.contains('drag-over-bottom');

        if (draggedData.type === 'pinnedTab' && targetElement.classList.contains('pinned-tab-icon')) {
            await this.reorderPinnedTabs(draggedData.tabId, parseInt(targetElement.dataset.tabId), dropBelow);
        } else if (draggedData.type === 'tab' && targetElement.classList.contains('tab-item')) {
            await this.reorderTabs(draggedData.tabId, parseInt(targetElement.dataset.tabId), dropBelow);
        } else if ((draggedData.type === 'bookmark' || draggedData.type === 'bookmarkFolder') &&
            (targetElement.classList.contains('bookmark-item') || targetElement.classList.contains('bookmark-folder'))) {
            await this.reorderBookmarks(draggedData.bookmarkId, targetElement.dataset.bookmarkId, dropBelow);
        }
    }

    async reorderPinnedTabs(draggedTabId, targetTabId, dropBelow = false) {
        try {
            const draggedTab = this.pinnedTabs.find(tab => tab.id === draggedTabId);
            const targetTab = this.pinnedTabs.find(tab => tab.id === targetTabId);

            if (draggedTab && targetTab) {
                let targetIndex = targetTab.index;

                // If dropping below, increment the target index
                if (dropBelow) {
                    targetIndex += 1;
                }

                // Adjust for the fact that the dragged tab will be removed first
                if (draggedTab.index < targetIndex) {
                    targetIndex -= 1;
                }

                await chrome.tabs.move(draggedTabId, { index: targetIndex });
                await this.refresh();
            }
        } catch (error) {
            console.error('Error reordering pinned tabs:', error);
        }
    }

    async reorderTabs(draggedTabId, targetTabId, dropBelow = false) {
        try {
            const draggedTab = this.openTabs.find(tab => tab.id === draggedTabId);
            const targetTab = this.openTabs.find(tab => tab.id === targetTabId);

            if (draggedTab && targetTab) {
                let targetIndex = targetTab.index;

                // If dropping below, increment the target index
                if (dropBelow) {
                    targetIndex += 1;
                }

                // Adjust for the fact that the dragged tab will be removed first
                if (draggedTab.index < targetIndex) {
                    targetIndex -= 1;
                }

                await chrome.tabs.move(draggedTabId, { index: targetIndex });
                await this.refresh();
            }
        } catch (error) {
            console.error('Error reordering tabs:', error);
        }
    }

    async reorderBookmarks(draggedBookmarkId, targetBookmarkId, dropBelow = false) {
        try {
            const draggedBookmark = await chrome.bookmarks.get(draggedBookmarkId);
            const targetBookmark = await chrome.bookmarks.get(targetBookmarkId);

            if (draggedBookmark[0] && targetBookmark[0]) {
                const draggedItem = draggedBookmark[0];
                const targetItem = targetBookmark[0];

                // Don't allow moving a folder into itself
                if (draggedItem.children && this.isDescendant(targetBookmarkId, draggedBookmarkId)) {
                    console.warn('Cannot move folder into itself');
                    return;
                }

                // If target is a folder and dropping on top (not below), move into it
                // Otherwise, move adjacent to it
                let newParentId, newIndex;

                if (targetItem.children && targetItem.children.length >= 0 && !dropBelow) {
                    // Target is a folder and dropping on top, move into it
                    newParentId = targetBookmarkId;
                    newIndex = 0; // Add at the beginning of the folder
                } else {
                    // Target is a bookmark or dropping below a folder, move adjacent to it
                    newParentId = targetItem.parentId;
                    const siblings = await chrome.bookmarks.getChildren(targetItem.parentId);
                    let targetIndex = siblings.findIndex(sibling => sibling.id === targetBookmarkId);

                    // If dropping below, increment the target index
                    if (dropBelow) {
                        targetIndex += 1;
                    }

                    newIndex = targetIndex;
                }

                // Only move if it's actually changing position
                if (newParentId !== draggedItem.parentId || newIndex !== draggedItem.index) {
                    await chrome.bookmarks.move(draggedBookmarkId, {
                        parentId: newParentId,
                        index: newIndex
                    });

                    await this.refresh();
                }
            }
        } catch (error) {
            console.error('Error reordering bookmarks:', error);
        }
    }

    async isDescendant(potentialDescendantId, ancestorId) {
        try {
            let current = await chrome.bookmarks.get(potentialDescendantId);
            while (current[0] && current[0].parentId) {
                if (current[0].parentId === ancestorId) {
                    return true;
                }
                current = await chrome.bookmarks.get(current[0].parentId);
            }
            return false;
        } catch (error) {
            return false;
        }
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
