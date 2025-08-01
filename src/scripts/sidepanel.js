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
        this.lastRenderData = null;
        this.eventsAttached = false;
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
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            // Only refresh if tab properties that affect our UI changed
            if (changeInfo.title || changeInfo.favIconUrl || changeInfo.pinned) {
                this.debounceRefresh();
            }
        });
        chrome.tabs.onActivated.addListener(() => this.debounceRefresh());
        chrome.bookmarks.onCreated.addListener(() => this.debounceRefresh());
        chrome.bookmarks.onRemoved.addListener(() => this.debounceRefresh());
        chrome.bookmarks.onChanged.addListener(() => this.debounceRefresh());
        chrome.bookmarks.onMoved.addListener(() => this.debounceRefresh());
    }
    // Debounced refresh to batch frequent events
    debounceRefresh() {
        clearTimeout(this.refreshTimeout);
        this.refreshTimeout = setTimeout(() => this.refresh(), 100); // Reduced delay for better responsiveness
    }

    async refresh() {
        await this.loadData();
        this.render();
    }

    // Fast refresh without full reload - for drag operations
    fastRefresh() {
        clearTimeout(this.refreshTimeout);
        this.refreshTimeout = setTimeout(() => this.render(), 50); // Faster than debounced refresh
    }

    openSettings() {
        chrome.tabs.create({ url: chrome.runtime.getURL('src/html/settings.html') });
    }

    render() {
        this.renderUnifiedList();
    }

    renderUnifiedList() {
        const container = this.container;
        const pinnedContainer = document.getElementById('pinnedTabs');

        // Always rebuild UI to ensure freshness, but keep performance optimizations
        pinnedContainer.textContent = '';
        container.textContent = '';
        this.buildFullUI(container, pinnedContainer);
        this.cacheRenderData();

        // Reattach events after rebuilding DOM
        this.eventsAttached = false;
        this.attachEvents(container);
        this.attachDragEvents(container);
        this.eventsAttached = true;
    }

    buildFullUI(container, pinnedContainer) {
        const fragment = document.createDocumentFragment();
        const defaultFavicon = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="%23e8eaed"/></svg>';

        // Add pinned tabs
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
        Object.values(tabsByWindow).forEach(tabs => {
            tabs.forEach(tab => {
                fragment.appendChild(this.createTabElementNode(tab, false));
            });
        });

        // Add bookmarks
        this.bookmarks.forEach(bookmark => {
            const node = this.createBookmarkElementNode(bookmark, 0);
            if (node) fragment.appendChild(node);
        });

        if (fragment.childNodes.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = 'Loading your tabs and bookmarks...';
            container.appendChild(empty);
        } else {
            container.appendChild(fragment);
        }
    }

    updateExistingUI(container, pinnedContainer) {
        // Fast update for small changes - just update active states
        const currentActive = container.querySelector('.tab-item.active-tab');
        const activeTab = this.openTabs.find(tab => tab.active);

        if (activeTab && currentActive && currentActive.dataset.tabId !== activeTab.id.toString()) {
            currentActive.classList.remove('active-tab');
            const newActive = container.querySelector(`[data-tab-id="${activeTab.id}"]`);
            if (newActive) newActive.classList.add('active-tab');
        }
    }

    hasSignificantChanges() {
        if (!this.lastRenderData) return true;

        return (
            this.lastRenderData.pinnedCount !== this.pinnedTabs.length ||
            this.lastRenderData.openCount !== this.openTabs.length ||
            this.lastRenderData.bookmarkCount !== this.bookmarks.length
        );
    }

    cacheRenderData() {
        this.lastRenderData = {
            pinnedCount: this.pinnedTabs.length,
            openCount: this.openTabs.length,
            bookmarkCount: this.bookmarks.length
        };
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
            // Prevent dragging on action buttons and folder toggle
            if (e.target.classList.contains('action-btn') ||
                e.target.classList.contains('close-tab') ||
                e.target.classList.contains('pin-tab') ||
                e.target.classList.contains('bookmark-folder-toggle')) {
                e.preventDefault();
                return;
            }

            // Find the actual draggable element
            let dragElement = e.target;

            // If we're clicking on a bookmark folder header, use the parent folder
            if (e.target.classList.contains('bookmark-folder-header') ||
                e.target.closest('.bookmark-folder-header')) {
                dragElement = e.target.closest('.bookmark-folder');
            }
            // If we're clicking inside a bookmark child, use the child element
            else if (e.target.closest('.bookmark-child')) {
                dragElement = e.target.closest('.bookmark-child');
            }
            // If we're clicking on a tab item, use the tab item
            else if (e.target.closest('.tab-item')) {
                dragElement = e.target.closest('.tab-item');
            }
            // If we're clicking on a pinned tab icon, use that
            else if (e.target.classList.contains('pinned-tab-icon')) {
                dragElement = e.target;
            }

            if (!dragElement || !dragElement.draggable) {
                e.preventDefault();
                return;
            }

            console.log('Drag started on:', dragElement.className, dragElement);

            this.draggedElement = dragElement;

            // Apply dragging class with a slight delay to ensure it's visible
            setTimeout(() => {
                if (this.draggedElement) {
                    dragElement.classList.add('dragging');
                }
            }, 10);

            if (dragElement.classList.contains('pinned-tab-icon')) {
                this.draggedData = {
                    type: 'pinnedTab',
                    tabId: parseInt(dragElement.dataset.tabId),
                    element: dragElement
                };
            } else if (dragElement.classList.contains('tab-item')) {
                this.draggedData = {
                    type: 'tab',
                    tabId: parseInt(dragElement.dataset.tabId),
                    element: dragElement
                };
            } else if (dragElement.classList.contains('bookmark-folder')) {
                this.draggedData = {
                    type: 'bookmarkFolder',
                    bookmarkId: dragElement.dataset.bookmarkId,
                    element: dragElement
                };
            } else if (dragElement.classList.contains('bookmark-child')) {
                this.draggedData = {
                    type: 'bookmark',
                    bookmarkId: dragElement.dataset.bookmarkId,
                    element: dragElement
                };
            }

            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', dragElement.outerHTML);
        };

        // Drag over event
        const handleDragOver = (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            // Cache the last target to avoid redundant operations
            if (this.lastDragTarget === e.target) return;
            this.lastDragTarget = e.target;

            // Find the target element for drop
            let target = e.target.closest('.tab-item, .bookmark-child, .bookmark-folder, .pinned-tab-icon');

            // If we're hovering over a bookmark folder header, use the parent folder
            if (!target && e.target.closest('.bookmark-folder-header')) {
                target = e.target.closest('.bookmark-folder');
            }

            if (target && target !== this.draggedElement && this.draggedData) {
                this.clearDropIndicators();

                // Only show drop indicator for compatible types
                if (this.isDropCompatible(this.draggedData.type, target)) {
                    // Determine if we should show divider above or below based on mouse position
                    const rect = target.getBoundingClientRect();
                    const midpoint = rect.top + rect.height / 2;

                    if (e.clientY < midpoint) {
                        target.classList.add('drag-over');
                        console.log('Adding drag-over to:', target.className);
                    } else {
                        target.classList.add('drag-over-bottom');
                        console.log('Adding drag-over-bottom to:', target.className);
                    }

                    this.lastDropTarget = target;
                }
            }
        };

        // Drag leave event
        const handleDragLeave = (e) => {
            let target = e.target.closest('.tab-item, .bookmark-child, .bookmark-folder, .pinned-tab-icon');

            // If we're leaving a bookmark folder header, use the parent folder
            if (!target && e.target.closest('.bookmark-folder-header')) {
                target = e.target.closest('.bookmark-folder');
            }

            if (target) {
                target.classList.remove('drag-over', 'drag-over-bottom');
            }
        };

        // Drop event
        const handleDrop = async (e) => {
            e.preventDefault();
            this.clearDropIndicators();

            // Find the target element for drop
            let target = e.target.closest('.tab-item, .bookmark-child, .bookmark-folder, .pinned-tab-icon');

            // If we're dropping on a bookmark folder header, use the parent folder
            if (!target && e.target.closest('.bookmark-folder-header')) {
                target = e.target.closest('.bookmark-folder');
            }

            if (target && target !== this.draggedElement && this.draggedData) {
                const isCompatible = this.isDropCompatible(this.draggedData.type, target);
                if (isCompatible) {
                    await this.handleDrop(target, this.draggedData);
                }
            }
        };

        // Drag end event
        const handleDragEnd = (e) => {
            console.log('Drag ended on:', e.target.className);
            e.target.classList.remove('dragging');
            this.clearDropIndicators();
            this.draggedElement = null;
            this.draggedData = null;
            this.lastDragTarget = null;
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
        // Use cached elements if available to avoid DOM queries
        if (this.lastDropTarget) {
            this.lastDropTarget.classList.remove('drag-over', 'drag-over-bottom');
            this.lastDropTarget = null;
        }

        // Fallback for any missed elements
        const elements = document.querySelectorAll('.drag-over, .drag-over-bottom');
        if (elements.length > 0) {
            elements.forEach(el => {
                el.classList.remove('drag-over', 'drag-over-bottom');
            });
        }
    }

    isDropCompatible(draggedType, targetElement) {
        if (draggedType === 'pinnedTab' && targetElement.classList.contains('pinned-tab-icon')) {
            return true;
        }
        if (draggedType === 'tab' && targetElement.classList.contains('tab-item')) {
            return true;
        }
        if ((draggedType === 'bookmark' || draggedType === 'bookmarkFolder') &&
            (targetElement.classList.contains('bookmark-child') || targetElement.classList.contains('bookmark-folder'))) {
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
            (targetElement.classList.contains('bookmark-child') || targetElement.classList.contains('bookmark-folder'))) {
            await this.reorderBookmarks(draggedData.bookmarkId, targetElement.dataset.bookmarkId, dropBelow);
        }
    }

    async reorderPinnedTabs(draggedTabId, targetTabId, dropBelow = false) {
        try {
            const draggedTab = this.pinnedTabs.find(tab => tab.id === draggedTabId);
            const targetTab = this.pinnedTabs.find(tab => tab.id === targetTabId);

            if (draggedTab && targetTab) {
                let targetIndex = targetTab.index;

                if (dropBelow) {
                    targetIndex += 1;
                }

                if (draggedTab.index < targetIndex) {
                    targetIndex -= 1;
                }

                await chrome.tabs.move(draggedTabId, { index: targetIndex });

                // Fast UI update instead of full refresh
                this.updateTabOrder();
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

                if (dropBelow) {
                    targetIndex += 1;
                }

                if (draggedTab.index < targetIndex) {
                    targetIndex -= 1;
                }

                await chrome.tabs.move(draggedTabId, { index: targetIndex });

                // Fast UI update instead of full refresh
                this.updateTabOrder();
            }
        } catch (error) {
            console.error('Error reordering tabs:', error);
        }
    }

    // Fast tab order update without full reload
    updateTabOrder() {
        clearTimeout(this.refreshTimeout);
        this.refreshTimeout = setTimeout(async () => {
            // Quick reload of tab data only
            const tabs = await chrome.tabs.query({});
            this.pinnedTabs = tabs.filter(tab => tab.pinned);
            this.openTabs = tabs.filter(tab => !tab.pinned);
            this.fastRefresh();
        }, 50);
    }

    async reorderBookmarks(draggedBookmarkId, targetBookmarkId, dropBelow = false) {
        try {
            const draggedBookmark = await chrome.bookmarks.get(draggedBookmarkId);
            const targetBookmark = await chrome.bookmarks.get(targetBookmarkId);

            if (draggedBookmark[0] && targetBookmark[0]) {
                const draggedItem = draggedBookmark[0];
                const targetItem = targetBookmark[0];

                if (draggedItem.children && this.isDescendant(targetBookmarkId, draggedBookmarkId)) {
                    console.warn('Cannot move folder into itself');
                    return;
                }

                let newParentId, newIndex;

                if (targetItem.children && targetItem.children.length >= 0 && !dropBelow) {
                    newParentId = targetBookmarkId;
                    newIndex = 0;
                } else {
                    newParentId = targetItem.parentId;
                    const siblings = await chrome.bookmarks.getChildren(targetItem.parentId);
                    let targetIndex = siblings.findIndex(sibling => sibling.id === targetBookmarkId);

                    if (dropBelow) {
                        targetIndex += 1;
                    }

                    newIndex = targetIndex;
                }

                if (newParentId !== draggedItem.parentId || newIndex !== draggedItem.index) {
                    await chrome.bookmarks.move(draggedBookmarkId, {
                        parentId: newParentId,
                        index: newIndex
                    });

                    // Fast bookmark update instead of full refresh
                    this.updateBookmarkOrder();
                }
            }
        } catch (error) {
            console.error('Error reordering bookmarks:', error);
        }
    }

    // Fast bookmark order update without full reload
    updateBookmarkOrder() {
        clearTimeout(this.refreshTimeout);
        this.refreshTimeout = setTimeout(async () => {
            // Quick reload of bookmark data only
            const bookmarks = await chrome.bookmarks.getTree();
            this.bookmarks = bookmarks[0].children || [];
            this.fastRefresh();
        }, 50);
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
            // Fast tab switching - update UI immediately
            const currentActive = this.container.querySelector('.tab-item.active-tab');
            if (currentActive) currentActive.classList.remove('active-tab');

            const newActive = this.container.querySelector(`[data-tab-id="${tabId}"]`);
            if (newActive) newActive.classList.add('active-tab');

            // Then do the actual tab switch
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
            // Fast update instead of full refresh
            this.updateTabOrder();
        } catch (error) {
            console.error('Error pinning tab:', error);
        }
    }

    async unpinTab(tabId) {
        try {
            await chrome.tabs.update(tabId, { pinned: false });
            // Fast update instead of full refresh
            this.updateTabOrder();
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
