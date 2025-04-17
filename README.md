# FishEye Network Analysis

This project is an interactive network visualization tool for exploring the VAST Challenge 2023 MC1 dataset. It is built with D3.js and provides a user-friendly interface for filtering, searching, and analyzing complex entity relationships.

## Features
- **Interactive Force-Directed Graph**: Visualizes entities (nodes) and their relationships (links) with dynamic layout.
- **Filtering**: Filter nodes and links by type using checkboxes.
- **Search**: Search for nodes by id, country, dataset, or type.
- **Chunk Size Control**: Adjust the number of nodes displayed using a slider (shows the top N most connected nodes).
- **Details Panel**: Click a node to view its details and connections.
- **Compact Layout**: Temporarily cluster nodes based on their connectivity for clearer structure.
- **Reset View**: Reloads the visualization and resets all filters and progress.

## Files
- `index.html` — Main HTML file and UI structure.
- `app.js` — D3.js logic for data loading, filtering, simulation, and interactivity.
- `styles.css` — Styling for the visualization and UI components.
- `MC1.json` — The VAST Challenge 2023 MC1 dataset (nodes and links).
- `desc.txt` — Project or dataset description.
- `VAST 2023 MC1 Data Notes.docx` — Additional data notes/documentation.

## Usage
1. Open `index.html` in a modern web browser (Chrome, Firefox, Edge, Safari).
2. Use the controls on the left to filter, search, and adjust the visualization.
3. Click nodes to view details and connections.
4. Use the "Compact Layout" button to cluster nodes by connectivity.
5. Use the "Reset" button to reload and reset the visualization.

## Requirements
- No installation required. All dependencies are loaded via CDN (D3.js).
- Works on macOS, Windows, and Linux with a modern browser.

## Data Cleaning & Processing
- The app ensures only valid links and nodes are visualized.
- Nodes are sorted by number of connections (degree).
- Only the top N most connected nodes are shown (adjustable).
- No advanced normalization or deduplication is performed by default.

## Customization
- To use a different dataset, replace `MC1.json` with your own in the same format.
- You can adjust force simulation parameters in `app.js` for different layout effects.

## License
This project is for academic and research purposes. See VAST Challenge data usage policies for dataset terms.
