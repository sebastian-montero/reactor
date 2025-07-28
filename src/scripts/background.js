chrome.runtime.onInstalled.addListener(() => {
    console.log('Reactor extension installed');
    // Enable the side panel for all tabs
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.tabs.onCreated.addListener((tab) => {
    console.log('New tab created:', tab.id);
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    console.log('Tab removed:', tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.pinned !== undefined) {
        console.log('Tab pin status changed:', tabId, changeInfo.pinned);
    }
});

chrome.bookmarks.onCreated.addListener((id, bookmark) => {
    console.log('Bookmark created:', bookmark);
});

chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
    console.log('Bookmark removed:', id);
});

// Handle action clicks to open side panel
chrome.action.onClicked.addListener(async (tab) => {
    try {
        await chrome.sidePanel.open({ windowId: tab.windowId });
    } catch (error) {
        console.error('Error opening side panel:', error);
    }
});
