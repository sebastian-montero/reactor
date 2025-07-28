# Reactor

A Chrome extension that brings ARC browser's elegant tab management to Chrome, featuring organized pinned tabs, bookmarks in folders, and a clean open tabs view.

## Features

### 📌 Pinned Tabs
- View all pinned tabs at the top of the extension
- Quick access to switch between pinned tabs
- Pin/unpin tabs directly from the extension
- Visual indicators for pinned status

### 📚 Bookmarks
- Hierarchical bookmark display with folders
- Clean folder organization similar to ARC browser
- Quick bookmark access and navigation
- Collapsible bookmark sections

### 🗂️ Open Tabs
- All open tabs organized by browser window
- Quick tab switching with one click
- Tab management actions (pin, close)
- Window grouping for better organization

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The Reactor icon will appear in your toolbar

## Usage

### Basic Navigation
- Click the extension icon to open the tab manager
- Click on any tab to switch to it
- Use the action buttons to pin/unpin or close tabs
- Click on bookmarks to open them in new tabs

### Tab Management
- **Pin tabs**: Click the pin button (📌) next to any open tab
- **Unpin tabs**: Click the pin button on pinned tabs to unpin them
- **Close tabs**: Click the close button (✕) to close any tab
- **Switch tabs**: Click anywhere on a tab item to switch to it

### Bookmarks
- Bookmarks are organized in folders just like ARC browser
- Click on any bookmark to open it
- Folders show the number of items they contain
- Use the collapse/expand button to hide/show bookmarks

### Settings
- Click the settings button (⚙️) to customize the extension
- Configure display options, behavior preferences, and advanced features
- Settings are automatically saved and synced across devices

## Permissions

This extension requires the following permissions:

- **tabs**: To read and manage browser tabs
- **bookmarks**: To access and display your bookmarks
- **activeTab**: To switch to selected tabs
- **storage**: To save your preferences and settings

## Development

### File Structure
```
arc-like-extension/
├── manifest.json          # Extension configuration
├── popup.html             # Main popup interface
├── popup.js              # Tab management logic
├── styles.css            # UI styling
├── background.js         # Background service worker
├── settings.html         # Settings page
├── settings.js           # Settings management
├── icons/                # Extension icons
└── README.md            # This file
```

### Key Components

1. **TabManager Class** (`popup.js`): Core functionality for managing tabs and bookmarks
2. **SettingsManager Class** (`settings.js`): Handles user preferences and configuration
3. **Background Script** (`background.js`): Handles extension lifecycle and events
4. **Popup Interface** (`popup.html` + `styles.css`): Clean, ARC-inspired user interface

### Customization

You can customize the extension by modifying:

- **Styles**: Edit `styles.css` to change the appearance
- **Functionality**: Modify `popup.js` to add new features
- **Settings**: Add new options in `settings.html` and `settings.js`
- **Permissions**: Update `manifest.json` for additional Chrome APIs

## Browser Compatibility

- Chrome 88+ (Manifest V3 support required)
- Chromium-based browsers (Edge, Brave, etc.)

## Privacy

This extension:
- Only accesses data locally within your browser
- Does not send any data to external servers
- Stores preferences using Chrome's sync storage (encrypted)
- Requires minimal permissions for core functionality

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/new-feature`)
3. Commit your changes (`git commit -am 'Add new feature'`)
4. Push to the branch (`git push origin feature/new-feature`)
5. Create a Pull Request

## License

MIT License - feel free to use and modify as needed.

## Inspiration

This extension is inspired by the ARC browser's clean and intuitive tab management system, bringing similar functionality to Chrome users who appreciate organized browsing.

## Roadmap

- [ ] Keyboard shortcuts for quick navigation
- [ ] Tab search and filtering
- [ ] Custom tab grouping
- [ ] Tab session management
- [ ] Import/export settings
- [ ] Dark mode theme
- [ ] Tab preview on hover

