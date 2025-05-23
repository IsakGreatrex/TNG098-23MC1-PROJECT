//https://vast-challenge.github.io/2023/MC1.html
//test 3 simon commit

// Initialize visualization parameters
const width = window.innerWidth;
const height = window.innerHeight;

// Create SVG container
const svg = d3.select('#network')
    .append('svg')
    .attr('width', width)
    .attr('height', height);

// Add zoom behavior
const g = svg.append('g');
// Update zoom behavior for responsiveness
svg.call(d3.zoom()
    .scaleExtent([0.1, 4])
    .filter(() => true) // Always allow zoom
    .on('zoom', (event) => {
        g.attr('transform', event.transform);
        // Scale node text size dynamically based on zoom level
        const scale = event.transform.k;
        nodeElements.select('text')
            .style('font-size', `${12 / scale}px`) // Adjust font size inversely to zoom level
            .style('stroke-width', `${0.5 / scale}px`); // Adjust stroke width for clarity
    })
);

// Add SVG background click to clear selection
svg.on('click', function(event) {
    // Only reset if the click target is the SVG itself (not a node or link)
    if (event.target === this) {
        selectedNodes = []; // Clear all selected nodes
        resetHighlight();
        document.querySelector('.details-overlay').classList.remove('show');
    }
});

// Initialize force simulation
const simulation = d3.forceSimulation()
    .force('link', d3.forceLink().id(d => d.id)
        .distance(d => Math.min(100, 30 + (d.source.neighbors + d.target.neighbors) * 2)))
    .force('charge', d3.forceManyBody()
        .strength(d => Math.min(-50, -10 - d.neighbors * 2))
        .distanceMax(150))
    .force('collision', d3.forceCollide().radius(d => 5 + Math.sqrt(d.neighbors || 1)))
    .force('center', d3.forceCenter(width / 2, height / 2).strength(0.1))
    .alphaDecay(0.01)
    .velocityDecay(0.3);

// Add tick handler after simulation initialization
simulation.on('tick', () => {
    linkElements
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

    nodeElements
        .attr('transform', d => `translate(${d.x},${d.y})`);
});

// Global variables
let currentNodes = [];
let currentLinks = [];
let selectedNode = null;
let nodeElements = g.selectAll('.node');
let linkElements = g.selectAll('.link');

// Color schemes
const nodeColors = {
    company: '#ff7f0e',
    organization: '#1f77b4',
    person: '#2ca02c',
    vessel: '#d62728',
    location: '#9467bd',
    event: '#8c564b',
    movement: '#e377c2',
    political_organization: '#7f7f7f'
};

// Add new global variables
let allNodes = [];
let allLinks = [];
let nodeNeighborsCache = new Map();
let currentChunkSize = 500;
const quadtree = d3.quadtree();

async function loadData() {
    showLoading(true);
    try {
        const response = await fetch('MC1.json');
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        
        // Store complete dataset
        allNodes = data.nodes.map(node => ({
            ...node,
            x: width/2 + (Math.random() - 0.5) * width * 0.8,
            y: height/2 + (Math.random() - 0.5) * height * 0.8
        }));
        
        // Create node lookup for faster link processing
        const nodeMap = new Map(allNodes.map(node => [node.id, node]));
        
        allLinks = (data.links || []).map(link => {
            const source = nodeMap.get(typeof link.source === 'object' ? link.source.id : link.source);
            const target = nodeMap.get(typeof link.target === 'object' ? link.target.id : link.target);
            return source && target ? { ...link, source, target, type: link.type || 'default' } : null;
        }).filter(link => link !== null);

        // Calculate and cache node connections
        allNodes.forEach(node => {
            const neighbors = allLinks.filter(link => 
                link.source.id === node.id || link.target.id === node.id
            );
            node.neighbors = neighbors.length;
            nodeNeighborsCache.set(node.id, neighbors);
        });

        // Sort nodes by importance (number of connections)
        allNodes.sort((a, b) => b.neighbors - a.neighbors);

        // Load initial chunk
        updateChunkSize(currentChunkSize);
        // Sync slider and label to current chunk size
        const slider = document.getElementById('nodeCountSlider');
        const label = document.getElementById('nodeCount');
        if (slider) slider.value = currentChunkSize;
        if (label) label.textContent = `${currentChunkSize} nodes`;
        setupEventHandlers();
        showControls();
        // Run a few simulation ticks to stabilize layout before showing
        for (let i = 0; i < 20; i++) simulation.tick();
        simulation.alpha(0.1); // Lower alpha for less jitter
        setTimeout(() => showLoading(false), 500); // Hide loading after short delay
        
    } catch (error) {
        showLoading(false);
        console.error('Error loading data:', error);
    }
}

// --- ersätt din updateChunkSize ---
function updateChunkSize(size) {
  // Om storlek >= antal noder – ta bort slice helt
  if (size >= allNodes.length) {
    currentNodes = allNodes;          // <– laddar ALLA noder
  } else {
    currentNodes = allNodes.slice(0, size);
  }

  const visibleIds = new Set(currentNodes.map(n => n.id));
  currentLinks = allLinks.filter(l =>
      visibleIds.has(l.source.id) && visibleIds.has(l.target.id));

  updateVisualization();
}


// Throttle function
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Debounce utility
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function updateVisualization() {
    // Filter data
    const activeNodeTypes = new Set(
        Array.from(document.querySelectorAll('.node-filters input:checked'))
            .map(cb => cb.value)
    );
    const activeEdgeTypes = new Set(
        Array.from(document.querySelectorAll('.edge-filters input:checked'))
            .map(cb => cb.value)
    );
    // Get search query (case-insensitive, trimmed)
    const searchInput = document.getElementById('nodeSearchInput');
    const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : '';
    // Updated node filtering logic to support 'other' type and search
    const filteredNodes = currentNodes.filter(node => {
        // Node type filter
        const typeOk = (!node.type || !(node.type in nodeColors))
            ? activeNodeTypes.has('other')
            : activeNodeTypes.has(node.type);
        // Search filter (id, country, dataset, etc.)
        if (searchQuery) {
            // Match id, country, dataset, or any string property
            const props = [node.id, node.country, node.dataset, node.type];
            const match = props.some(p => typeof p === 'string' && p.toLowerCase().includes(searchQuery));
            if (!match) return false;
        }
        return typeOk;
    });
    const nodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredLinks = currentLinks.filter(link =>
        (!link.type || activeEdgeTypes.has(link.type)) &&
        nodeIds.has(link.source.id) &&
        nodeIds.has(link.target.id)
    );

    // Always show all nodes
    nodeElements = g.selectAll('.node')
        .data(filteredNodes, d => d.id);
    nodeElements.exit().remove();
    const nodeEnter = nodeElements.enter()
        .append('g')
        .attr('class', 'node')
        .call(d3.drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended));
    // Node size: proportional to importance (number of links)
    /* ----- LÄGG IN/ERSÄTT I updateVisualization(), PRECIS EFTER nodeEnter definieras ----- */

nodeEnter.append('circle')
  // Radius: ensamma noder (0 grannar) blir små, övriga får din log-skalning
  .attr('r', d => {
      if (d.neighbors === 0) return 6;          // fast värde för “ö-noder”
      const minR = 10;
      const maxR = 40;
      const logVal = Math.log(1 + d.neighbors);
      const maxLog = Math.max(...filteredNodes.map(n => Math.log(1 + n.neighbors)));
      return minR + (maxR - minR) * (logVal / (maxLog || 1));
  })
  .attr('fill', d => nodeColors[d.type] || '#999')
  // Röd kant runt noder utan länkar → lätta att upptäcka
  .attr('stroke', d => d.neighbors === 0 ? '#ff0000' : '#fff')
  .attr('stroke-width', d => d.neighbors === 0 ? 2 : 1.5);

/* ------------------------------------------------------------------- */

    // Ensure node text is appended after the circle to appear above
    nodeEnter.append('text')
        .attr('dx', 0) // Center the text horizontally
        .attr('dy', -10) // Position the text above the node
        .text(d => d.id)
        .style('font-size', '10px')
        .style('opacity', 0)
        .style('pointer-events', 'none');
    nodeElements = nodeEnter.merge(nodeElements);
    nodeElements.on('click', handleNodeClick);

    // Only show links if a node is selected, and only those connected to it
    let linksToShow = [];
    if (selectedNode) {
        linksToShow = filteredLinks.filter(link => link.source.id === selectedNode.id || link.target.id === selectedNode.id);
    }
    linkElements = g.selectAll('.link')
        .data(linksToShow);
    linkElements.exit().remove();
    const linkEnter = linkElements.enter()
        .append('line')
        .attr('class', 'link')
        .attr('stroke', getLinkColor);
    linkElements = linkEnter.merge(linkElements);

    // Highlight only if a node is selected
    if (selectedNode) {
        const neighborIds = new Set([selectedNode.id]);
        linksToShow.forEach(link => {
            neighborIds.add(link.source.id);
            neighborIds.add(link.target.id);
        });
        nodeElements.select('circle')
            .style('opacity', d => neighborIds.has(d.id) ? 1 : 0.2)
            .style('stroke', d => neighborIds.has(d.id) ? '#222' : '#fff')
            .style('stroke-width', d => neighborIds.has(d.id) ? 4 : 1.5);
    } else {
        nodeElements.select('circle')
            .style('opacity', 1)
            .style('stroke', '#fff')
            .style('stroke-width', 1.5);
    }

    // Update simulation
    simulation.nodes(filteredNodes);
    simulation.force('link').links(linksToShow);
    // Robustly reheat simulation for full re-layout after node/link changes
    simulation.alpha(1).restart();
    // Optionally, set alphaTarget for a smoother effect
    simulation.alphaTarget(0.3);
    setTimeout(() => simulation.alphaTarget(0), 500);
}

// Add global variable to track multiple selected nodes
let selectedNodes = [];

// Function to create a new menu for each selected node with full details and movable functionality
// Update the createNodeMenu function to stagger window spawn positions
let menuOffsetX = 400; // Start further to the right
let menuOffsetY = 100; // Initial vertical offset

function createNodeMenu(node) {
    // Check if a menu for this node already exists
    if (document.getElementById(`menu-${node.id}`)) return;

    // Create a new menu container
    const menu = document.createElement('div');
    menu.id = `menu-${node.id}`;
    menu.className = 'node-menu';
    menu.style.position = 'absolute';
    menu.style.top = `${menuOffsetY}px`; // Staggered vertical position
    menu.style.left = `${menuOffsetX}px`; // Staggered horizontal position
    menu.style.width = '300px';
    menu.style.height = '400px'; // Fixed height for scrollability
    menu.style.background = 'white';
    menu.style.border = '1px solid #ddd';
    menu.style.borderRadius = '8px';
    menu.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
    menu.style.padding = '10px';
    menu.style.zIndex = 1000;
    menu.style.overflowY = 'auto'; // Enable vertical scrolling

    // Update offsets for the next menu
    menuOffsetX += 50; // Increase horizontal offset more significantly
    menuOffsetY += 30;

    // Reset offsets if they go off-screen
    if (menuOffsetX + 300 > window.innerWidth) menuOffsetX = 100;
    if (menuOffsetY + 400 > window.innerHeight) menuOffsetY = 50;

    // Add header with close and minimize button
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '10px';
    header.style.cursor = 'move'; // Make it draggable

    const title = document.createElement('h4');
    title.textContent = `Node: ${node.id}`;
    title.style.margin = '0';

    const buttonContainer = document.createElement('div');

    const minimizeButton = document.createElement('button');
    minimizeButton.textContent = '—'; // Line for minimize
    minimizeButton.style.background = 'none';
    minimizeButton.style.border = 'none';
    minimizeButton.style.fontSize = '16px';
    minimizeButton.style.cursor = 'pointer';
    minimizeButton.style.marginRight = '5px';
    minimizeButton.addEventListener('click', () => {
        const isMinimized = menu.classList.toggle('minimized');
        const content = menu.querySelector('.menu-content');
        if (isMinimized) {
            menu.style.height = '30px'; // Reduce height to show only the header
            content.style.display = 'none'; // Hide the content
        } else {
            menu.style.height = '400px'; // Restore full height
            content.style.display = 'block'; // Show the content
        }
    });

    const closeButton = document.createElement('button');
    closeButton.textContent = '×'; // X for close
    closeButton.style.background = 'none';
    closeButton.style.border = 'none';
    closeButton.style.fontSize = '16px';
    closeButton.style.cursor = 'pointer';
    closeButton.addEventListener('click', () => {
        menu.remove(); // Remove the menu from the DOM
    });

    buttonContainer.appendChild(minimizeButton);
    buttonContainer.appendChild(closeButton);

    header.appendChild(title);
    header.appendChild(buttonContainer);
    menu.appendChild(header);

    // Add node details and connections
    const content = document.createElement('div');
    content.className = 'menu-content';
    content.innerHTML = `
        <p>Type: ${node.type || 'N/A'}</p>
        <p>Country: ${node.country || 'N/A'}</p>
        <p>Dataset: ${node.dataset || 'N/A'}</p>
        <p>Connections: ${node.neighbors}</p>
        <h4>Connected Entities</h4>
        <ul>
            ${currentLinks.filter(link => link.source.id === node.id || link.target.id === node.id).map(link => {
                const isSource = link.source.id === node.id;
                const connectedEntity = isSource ? link.target : link.source;
                const relationship = link.type || 'connected to';
                return `
                    <li class="connection-item" data-node-id="${connectedEntity.id}">
                        ${isSource ? 'Has' : 'Is in'} ${relationship} with 
                        <strong>${connectedEntity.id}</strong> 
                        (${connectedEntity.type || 'unknown type'})
                        ${link.weight ? `<br><span style="color: #666; font-size: 0.9em;">Weight: ${link.weight}</span>` : ''}
                    </li>
                `;
            }).join('')}
        </ul>
    `;
    menu.appendChild(content);

    // Add click event listeners to connection items
    content.querySelectorAll('.connection-item').forEach(item => {
        item.addEventListener('click', (event) => {
            const nodeId = event.currentTarget.getAttribute('data-node-id');
            const selectedNode = allNodes.find(node => node.id === nodeId);
            if (selectedNode) {
                createNodeMenu(selectedNode); // Open a new menu for the clicked node
            }
        });
    });

    // Make the menu draggable
    let isDragging = false;
    let offsetX, offsetY;

    header.addEventListener('mousedown', (e) => {
        isDragging = true;
        offsetX = e.clientX - menu.offsetLeft;
        offsetY = e.clientY - menu.offsetTop;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
        if (isDragging) {
            menu.style.left = `${e.clientX - offsetX}px`;
            menu.style.top = `${e.clientY - offsetY}px`;
        }
    }

    function onMouseUp() {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }

    // Add to the document body
    document.body.appendChild(menu);
}

// Modify handleNodeClick to support multi-selection
function handleNodeClick(event, d) {
    if (event && event.shiftKey) {
        // Add or remove node from selection
        const index = selectedNodes.findIndex(node => node.id === d.id);
        if (index === -1) {
            selectedNodes.push(d);
        } else {
            selectedNodes.splice(index, 1);
        }
    } else {
        // Single selection (clear previous selection)
        selectedNodes = [d];
    }

    updateVisualization();
    createNodeMenu(d); // Create a new menu for the selected node
}

// Update updateVisualization to handle multiple selected nodes
function updateVisualization() {
    // Filter data
    const activeNodeTypes = new Set(
        Array.from(document.querySelectorAll('.node-filters input:checked'))
            .map(cb => cb.value)
    );
    const activeEdgeTypes = new Set(
        Array.from(document.querySelectorAll('.edge-filters input:checked'))
            .map(cb => cb.value)
    );
    // Get search query (case-insensitive, trimmed)
    const searchInput = document.getElementById('nodeSearchInput');
    const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : '';
    // Updated node filtering logic to support 'other' type and search
    const filteredNodes = currentNodes.filter(node => {
        // Node type filter
        const typeOk = (!node.type || !(node.type in nodeColors))
            ? activeNodeTypes.has('other')
            : activeNodeTypes.has(node.type);
        // Search filter (id, country, dataset, etc.)
        if (searchQuery) {
            // Match id, country, dataset, or any string property
            const props = [node.id, node.country, node.dataset, node.type];
            // I updateVisualization, byt EN rad:
const match = props.some(p => String(p).toLowerCase().includes(searchQuery));

            if (!match) return false;
        }
        return typeOk;
    });
    const nodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredLinks = currentLinks.filter(link =>
        (!link.type || activeEdgeTypes.has(link.type)) &&
        nodeIds.has(link.source.id) &&
        nodeIds.has(link.target.id)
    );

    // Always show all nodes
    nodeElements = g.selectAll('.node')
        .data(filteredNodes, d => d.id);
    nodeElements.exit().remove();
    const nodeEnter = nodeElements.enter()
        .append('g')
        .attr('class', 'node')
        .call(d3.drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended));
    // Node size: proportional to importance (number of links)
    nodeEnter.append('circle')
        .attr('r', d => {
            // Use logarithmic scaling for node size
            const minR = 10;
            const maxR = 40;
            const base = 1 + (d.neighbors || 1);
            // Log scale, normalized to [minR, maxR]
            const logVal = Math.log(base);
            // Find max log(neighbors) in currentNodes for normalization
            const maxLog = Math.max(...filteredNodes.map(n => Math.log(1 + (n.neighbors || 1))));
            const scaled = minR + (maxR - minR) * (logVal / (maxLog || 1));
            return scaled;
        })
        .attr('fill', d => nodeColors[d.type] || '#999');
    // Ensure node text is appended after the circle to appear above
    nodeEnter.append('text')
        .attr('dx', 0) // Center the text horizontally
        .attr('dy', -10) // Position the text above the node
        .text(d => d.id)
        .style('font-size', '10px')
        .style('opacity', 0)
        .style('pointer-events', 'none');
    nodeElements = nodeEnter.merge(nodeElements);
    nodeElements.on('click', handleNodeClick);

    // Highlight links and nodes for all selected nodes
    let linksToShow = [];
    if (selectedNodes.length > 0) {
        const neighborIds = new Set(selectedNodes.map(node => node.id));
        selectedNodes.forEach(node => {
            currentLinks.forEach(link => {
                if (link.source.id === node.id || link.target.id === node.id) {
                    linksToShow.push(link);
                    neighborIds.add(link.source.id);
                    neighborIds.add(link.target.id);
                }
            });
        });

        nodeElements.select('circle')
            .style('opacity', d => neighborIds.has(d.id) ? 1 : 0.2)
            .style('stroke', d => neighborIds.has(d.id) ? '#222' : '#fff')
            .style('stroke-width', d => neighborIds.has(d.id) ? 4 : 1.5);
    } else {
        nodeElements.select('circle')
            .style('opacity', 1)
            .style('stroke', '#fff')
            .style('stroke-width', 1.5);
    }

    linkElements = g.selectAll('.link')
        .data(linksToShow);
    linkElements.exit().remove();
    const linkEnter = linkElements.enter()
        .append('line')
        .attr('class', 'link')
        .attr('stroke', getLinkColor);
    linkElements = linkEnter.merge(linkElements);

    // Update simulation
    simulation.nodes(filteredNodes);
    simulation.force('link').links(linksToShow);
    simulation.alpha(1).restart();
}

// Add a function to clear all selections
function clearSelection() {
    selectedNodes = [];
    updateVisualization();
    document.querySelector('.details-overlay').classList.remove('show');
}

function resetHighlight() {
    selectedNode = null;
    updateVisualization();
}

// Helper function for link colors
function getLinkColor(d) {
    switch(d.type) {
        case 'membership': return '#1f77b4';
        case 'partnership': return '#ff7f0e';
        case 'ownership': return '#2ca02c';
        case 'family_relationship': return '#d62728';
        default: return '#999';
    }
}

function dragstarted(event) {
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;
}

function dragged(event) {
    event.subject.fx = event.x;
    event.subject.fy = event.y;
}

function dragended(event) {
    event.subject.fx = null;
    event.subject.fy = null;
}

// Update the `updateEntityDetails` function to make connections clickable
function updateEntityDetails(entity) {
    const details = document.getElementById('entityInfo');
    const connections = document.getElementById('connectionsList');

    details.innerHTML = `
        <h3>${entity.id}</h3>
        <p>Type: ${entity.type || 'N/A'}</p>
        <p>Country: ${entity.country || 'N/A'}</p>
        <p>Dataset: ${entity.dataset || 'N/A'}</p>
        <p>Connections: ${entity.neighbors}</p>
    `;

    const connectedLinks = currentLinks.filter(link => 
        link.source.id === entity.id || link.target.id === entity.id
    );

    connections.innerHTML = connectedLinks.map(link => {
        const isSource = link.source.id === entity.id;
        const connectedEntity = isSource ? link.target : link.source;
        const relationship = link.type || 'connected to';
        return `
            <li class="connection-item" data-node-id="${connectedEntity.id}">
                ${isSource ? 'Has' : 'Is in'} ${relationship} with 
                <strong>${connectedEntity.id}</strong> 
                (${connectedEntity.type || 'unknown type'})
            </li>
        `;
    }).join('');

    // Add click event listeners to connection items
    document.querySelectorAll('.connection-item').forEach(item => {
        item.addEventListener('click', (event) => {
            const nodeId = event.currentTarget.getAttribute('data-node-id');
            const selectedNode = allNodes.find(node => node.id === nodeId);
            if (selectedNode) {
                selectedNodes = [selectedNode]; // Update selected nodes
                updateVisualization(); // Update the graph view
                updateEntityDetails(selectedNode); // Update the details panel
            }
        });
    });
}

// Optimize force simulation
function optimizeSimulation() {
    simulation
        .alpha(0.3)
        .alphaDecay(0.02) // Faster decay
        .velocityDecay(0.4) // More damping
        .force('charge', d3.forceManyBody()
            .strength(d => Math.min(-30, -5 - d.neighbors))
            .distanceMax(100))
        .force('collision', d3.forceCollide().radius(d => 3 + Math.sqrt(d.neighbors || 1)));
}

function setupEventHandlers() {
    // Toggle controls visibility
    const toggleControls = document.getElementById('toggleControls');
    if (toggleControls) {
        toggleControls.addEventListener('click', () => {
            const controls = document.querySelector('.controls-overlay');
            controls.classList.toggle('minimized');
        });
    }

    // Close details panel
    const closeDetails = document.getElementById('closeDetails');
    if (closeDetails) {
        closeDetails.addEventListener('click', () => {
            document.querySelector('.details-overlay').classList.remove('show');
        });
    }

    // Filters
    document.querySelectorAll('.filters input').forEach(checkbox => {
        checkbox.addEventListener('change', updateVisualization);
    });

    // Add node count slider
    const nodeCountSlider = document.getElementById('nodeCountSlider');
    if (nodeCountSlider) {
        nodeCountSlider.addEventListener('input', (e) => {
            const count = parseInt(e.target.value);
            document.getElementById('nodeCount').textContent = `${count} nodes`;
            updateChunkSize(count);
        });
    }
    // Add reset button handler
    const resetButton = document.getElementById('resetView');
    if (resetButton) {
        resetButton.addEventListener('click', (e) => {
            e.preventDefault();
            const confirmed = window.confirm('This will reset all your progress and reload the site. Are you sure you want to continue?');
            if (confirmed) {
                window.location.reload(true);
            }
        });
    }

    // Node search input
    const nodeSearchInput = document.getElementById('nodeSearchInput');
    if (nodeSearchInput) {
        nodeSearchInput.addEventListener('input', debounce(updateVisualization, 200));
    }

    // Add compact layout button handler
    const compactLayoutButton = document.getElementById('compactLayout');
    if (compactLayoutButton) {
        compactLayoutButton.addEventListener('click', () => {
            // Strongly pull nodes to the center
            simulation.force('x', d3.forceX(width / 2).strength(2));
            simulation.force('y', d3.forceY(height / 2).strength(2));
            simulation.force('charge').strength(-200); // Keep some repulsion to avoid overlap
            simulation.alpha(1).restart();
            simulation.alphaTarget(0.6);
            setTimeout(() => {
                // Restore to default after 1.2s
                simulation.force('x', null);
                simulation.force('y', null);
                simulation.force('charge').strength(d => Math.min(-50, -10 - d.neighbors * 2));
                simulation.alphaTarget(0);
            }, 1200);
        });
    }

    // Add event listener for the illegal fishing filter button
    const illegalFilterButton = document.getElementById('illegalFilterButton');
    if (illegalFilterButton) {
        illegalFilterButton.addEventListener('click', filterIllegalFishingNodes);
    }
}

// Extend the illegalFishingKeywords list with additional terms
const illegalFishingKeywords = [
    'illegal', 'IUU', 'driftnets', 'transshipment', 'bottom otter trawler', 'catch', 'poached', 'Fishing International',
    'fraud', 'bribes', 'contraband', 'organized crime', 'guilty', 'officer', 'dark web',
    'SIMP', 'compliance', 'investigation', 'violation', 'adjusting', 'inconsistencies', 'requested', 'confirmed', 'presumed',
    'vessel', 'ship', 'trawler', 'shrimper', 'sailboat', 'motor', 'snow crab',
    'Odisha Sea Dry dock', 'Dark Web Vendor', 'Officer Pleads Guilty', 'Illegal Narcotics'
];

// Function to filter nodes based on illegal fishing keywords
function filterIllegalFishingNodes() {
    const keywords = illegalFishingKeywords.map(keyword => keyword.toLowerCase());

    // Filter nodes containing any of the keywords
    const filteredNodes = allNodes.filter(node => {
        const nodeText = `${node.id} ${node.type || ''} ${node.country || ''} ${node.dataset || ''}`.toLowerCase();
        return keywords.some(keyword => nodeText.includes(keyword));
    });

    // Filter links connected to the filtered nodes
    const filteredNodeIds = new Set(filteredNodes.map(node => node.id));
    const filteredLinks = allLinks.filter(link => 
        filteredNodeIds.has(link.source.id) && filteredNodeIds.has(link.target.id)
    );

    currentNodes = filteredNodes;
    currentLinks = filteredLinks;
    updateVisualization();
}

function showNeighborhood(node, depth) {
    const neighborhood = new Set([node.id]);
    const queue = [[node, 0]];
    
    while (queue.length > 0) {
        const [current, currentDepth] = queue.shift();
        if (currentDepth >= depth) continue;

        linkElements.each(link => {
            if (link.source.id === current.id && !neighborhood.has(link.target.id)) {
                neighborhood.add(link.target.id);
                queue.push([link.target, currentDepth + 1]);
            }
            if (link.target.id === current.id && !neighborhood.has(link.source.id)) {
                neighborhood.add(link.source.id);
                queue.push([link.source, currentDepth + 1]);
            }
        });
    }

    nodeElements.style('opacity', d => neighborhood.has(d.id) ? 1 : 0.1);
    linkElements.style('opacity', l => 
        neighborhood.has(l.source.id) && neighborhood.has(l.target.id) ? 1 : 0.1
    );
}

function showControls() {
    document.querySelector('.controls-overlay').classList.add('show');
}

// Handle window resizing
window.addEventListener('resize', () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    svg
        .attr('width', width)
        .attr('height', height);
    
    simulation.force('x', d3.forceX(width / 2).strength(0.05));
    simulation.force('y', d3.forceY(height / 2).strength(0.05));
    simulation.alpha(0.3).restart();
});

// Add loading indicator
function showLoading(show) {
    let loading = document.getElementById('loadingIndicator');
    if (!loading) {
        loading = document.createElement('div');
        loading.id = 'loadingIndicator';
        loading.style.position = 'fixed';
        loading.style.top = '50%';
        loading.style.left = '50%';
        loading.style.transform = 'translate(-50%, -50%)';
        loading.style.background = 'rgba(255,255,255,0.9)';
        loading.style.padding = '2em 3em';
        loading.style.borderRadius = '8px';
        loading.style.fontSize = '1.5em';
        loading.style.zIndex = 9999;
        loading.innerText = 'Loading...';
        document.body.appendChild(loading);
    }
    loading.style.display = show ? 'block' : 'none';
}

// Adjusted force simulation for more spacing and less jitter
function configureSimulation() {
    simulation
        .force('link', d3.forceLink().id(d => d.id)
            .distance(350) // Much larger distance
            .strength(0.2)
        )
        .force('charge', d3.forceManyBody()
            .strength(-400) // Stronger repulsion
            .distanceMax(1000)
        )
        .force('collision', d3.forceCollide().radius(d => 32 + Math.sqrt(d.neighbors || 1)))
        .force('center', d3.forceCenter(width / 2, height / 2).strength(0.2))
        .alphaDecay(0.05)
        .velocityDecay(0.5);
}

// Call configureSimulation after simulation is created
configureSimulation();

simulation.stop(); // Prevent simulation from running before first render

// Initialize after DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        loadData();
    });
} else {
    loadData();
}