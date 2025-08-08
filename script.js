document.addEventListener('DOMContentLoaded', () => {
    const MAP_CONFIG = {
        rows: 35,
        cols: 40,
        width: 1000,
        height: 875,
    };

    const LOCATIONS = [
        { name: 'Texel', lat: 53.06, lon: 4.78 },
        { name: 'Callantsoog', lat: 52.86, lon: 4.69 },
        { name: 'Wijk aan Zee', lat: 52.52, lon: 4.60 },
        { name: 'Zandvoort', lat: 52.37, lon: 4.53 },
        { name: 'Noordwijk', lat: 52.23, lon: 4.43 },
        { name: 'Katwijk', lat: 52.20, lon: 4.39 },
        { name: 'Scheveningen', lat: 52.11, lon: 4.27 },
        { name: 'Ouddorp', lat: 51.80, lon: 3.92 },
        { name: 'Domburg', lat: 51.56, lon: 3.49 }
    ];

    const map = document.getElementById('map');
    const errorDisplay = document.getElementById('error-display');

    // --- Main Application Flow ---
    async function main() {
        try {
            showError('Loading application...');
            
            const geoData = await fetchData('./netherlands.geojson');
            console.log('GeoJSON data loaded successfully');
            
            const projection = setupProjection(geoData);
            console.log('Projection setup complete');
            
            createMapGrid(projection, geoData);
            console.log('Map grid created successfully');
            
            showError('Loading weather data...');
            const allWeatherData = await fetchAllWeatherData(LOCATIONS);
            console.log('Weather data fetched:', allWeatherData);
            
            // Count valid data points
            const validDataCount = allWeatherData.filter(data => data !== null).length;
            console.log(`Valid weather data for ${validDataCount}/${LOCATIONS.length} locations`);
            
            if (validDataCount === 0) {
                showError('No weather data available for any locations.');
                return;
            }
            
            showError('Rendering heatmap...');
            renderHeatmap(LOCATIONS, allWeatherData, projection);
            
            // Clear error message on success
            setTimeout(() => {
                showError('');
            }, 1000);
            
            console.log('Application initialization complete');

        } catch (error) {
            console.error('Application initialization failed:', error);
            showError(`Application failed to load: ${error.message}`);
        }
    }

    // --- Helper Functions ---

    async function fetchData(url) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
        }
        return response.json();
    }

    function setupProjection(geoData) {
        return d3.geoMercator().fitSize([MAP_CONFIG.cols, MAP_CONFIG.rows], geoData);
    }

    function createMapGrid(projection, geoData) {
        map.style.gridTemplateColumns = `repeat(${MAP_CONFIG.cols}, 1fr)`;
        map.style.gridTemplateRows = `repeat(${MAP_CONFIG.rows}, 1fr)`;
        map.style.width = `${MAP_CONFIG.width}px`;
        map.style.height = `${MAP_CONFIG.height}px`;

        for (let r = 0; r < MAP_CONFIG.rows; r++) {
            for (let c = 0; c < MAP_CONFIG.cols; c++) {
                const cell = document.createElement('div');
                cell.classList.add('map-cell');
                const [lon, lat] = projection.invert([c, r]);
                if (d3.geoContains(geoData, [lon, lat])) {
                    cell.classList.add('land');
                }
                map.appendChild(cell);
            }
        }
    }

    async function fetchAllWeatherData(locations) {
        const latitudes = locations.map(loc => loc.lat).join(',');
        const longitudes = locations.map(loc => loc.lon).join(',');
        const apiUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${latitudes}&longitude=${longitudes}&hourly=swell_wave_height,swell_wave_period,swell_wave_direction&timezone=auto`;

        try {
            const responseArray = await fetchData(apiUrl); // This is an array of location objects
            console.log('Raw API response array for all locations:', responseArray);
            
            // Check if the response is valid array
            if (!Array.isArray(responseArray) || responseArray.length === 0) {
                console.warn('Invalid API response structure:', responseArray);
                return locations.map(() => null);
            }
            
            // Process data for each location
            return responseArray.map((locationData, index) => {
                try {
                    if (!locationData || !locationData.hourly || !locationData.hourly.swell_wave_height) {
                        console.warn(`No valid wave data for location ${index}:`, locationData);
                        return null;
                    }
                    
                    const processedData = processApiData(locationData);
                    console.log(`Processed data for ${locations[index]?.name || 'location ' + index}:`, processedData);
                    return processedData;
                } catch (error) {
                    console.error(`Error processing data for location ${index}:`, error);
                    return null;
                }
            });

        } catch (error) {
            console.error('Failed to fetch all weather data:', error);
            showError('Could not load all weather data. See console for details.');
            return locations.map(() => null); // Return array of nulls for failed fetches
        }
    }

    function renderHeatmap(locations, allWeatherData, projection) {
        console.log('Starting heatmap rendering...');
        
        // Filter out null entries from allWeatherData before processing
        const validWeatherData = allWeatherData.filter(data => data !== null);
        const validLocations = locations.filter((_, index) => allWeatherData[index] !== null);

        console.log(`Rendering heatmap with ${validWeatherData.length} valid locations`);

        if (validWeatherData.length === 0) {
            console.warn('No valid weather data to render heatmap');
            return;
        }

        const seaCells = Array.from(map.querySelectorAll('.map-cell:not(.land)'));
        console.log(`Found ${seaCells.length} sea cells for heatmap`);

        seaCells.forEach((cell, index) => {
            const [lon, lat] = projection.invert(getCellCoords(cell));
            const weightedHeight = getWeightedAverageHeight(lon, lat, validLocations, validWeatherData);
            
            const color = getHeatmapColor(weightedHeight);
            cell.style.backgroundColor = color;
            
            // Debug first few cells
            if (index < 5) {
                console.log(`Cell ${index}: coords (${lon.toFixed(3)}, ${lat.toFixed(3)}), height ${weightedHeight.toFixed(3)}, color ${color}`);
            }
        });

        console.log('Heatmap rendering complete, starting marker rendering...');

        // Clear any existing markers first
        map.querySelectorAll('.wave-marker').forEach(marker => marker.remove());

        // Re-add markers on top of heatmap for valid data only
        let markersRendered = 0;
        allWeatherData.forEach((weatherData, index) => {
            if (weatherData !== null) {
                const success = renderWaveMarker(locations[index], weatherData, projection);
                if (success) markersRendered++;
            }
        });

        console.log(`Rendered ${markersRendered} wave markers`);
    }

    function getCellCoords(cell) {
        const index = Array.from(map.children).indexOf(cell);
        const c = index % MAP_CONFIG.cols;
        const r = Math.floor(index / MAP_CONFIG.cols);
        return [c, r];
    }

    function getWeightedAverageHeight(lon, lat, locations, allWeatherData) {
        let totalHeight = 0;
        let totalWeight = 0;

        allWeatherData.forEach((weatherData, i) => {
            // Skip null or invalid weather data
            if (!weatherData || !weatherData.current || !weatherData.current.swell) return;
            
            const swellHeight = weatherData.current.swell.height;
            if (typeof swellHeight !== 'number' || isNaN(swellHeight)) return;

            const loc = locations[i];
            if (!loc || typeof loc.lon !== 'number' || typeof loc.lat !== 'number') return;

            const dist = d3.geoDistance([lon, lat], [loc.lon, loc.lat]);
            const weight = 1 / (dist * dist + 0.01); // Inverse square distance with small constant to avoid division by zero

            totalHeight += swellHeight * weight;
            totalWeight += weight;
        });

        return totalWeight > 0 ? totalHeight / totalWeight : 0;
    }

    function getHeatmapColor(height) {
        const h = Math.min(Math.max(height, 0), 2.5); // Clamp height
        const colors = {
            0.0: '#2f3e46', // Sea color
            0.5: '#5a7d8b', // Low
            1.5: '#c9a253', // Mid
            2.5: '#b5654d'  // High
        };
        
        const stops = Object.keys(colors).map(parseFloat);
        for (let i = 1; i < stops.length; i++) {
            if (h <= stops[i]) {
                const prevStop = stops[i - 1];
                const nextStop = stops[i];
                const t = (h - prevStop) / (nextStop - prevStop);
                return d3.interpolateRgb(colors[prevStop], colors[nextStop])(t);
            }
        }
        return colors[stops[stops.length - 1]];
    }

    function renderWaveMarker(location, weatherData, projection) {
        // Check if weatherData is valid
        if (!weatherData || !weatherData.current || !weatherData.current.swell) {
            console.warn(`Invalid weather data for ${location.name}:`, weatherData);
            return false;
        }

        const [x, y] = projection([location.lon, location.lat]);
        
        // Check if projection coordinates are valid
        if (isNaN(x) || isNaN(y) || x < 0 || y < 0 || x >= MAP_CONFIG.cols || y >= MAP_CONFIG.rows) {
            console.warn(`Invalid projection coordinates for ${location.name}: (${x}, ${y})`);
            return false;
        }

        const r = Math.floor(y);
        const c = Math.floor(x);
        const cellIndex = r * MAP_CONFIG.cols + c;
        
        // Check if cell index is valid
        if (cellIndex < 0 || cellIndex >= map.children.length) {
            console.warn(`Invalid cell index for ${location.name}: ${cellIndex}`);
            return false;
        }

        const cell = map.children[cellIndex];

        console.log(`Rendering marker for ${location.name} (Lat: ${location.lat}, Lon: ${location.lon}):`);
        console.log(`  Projected (x,y): (${x}, ${y})`);
        console.log(`  Calculated (r,c): (${r}, ${c})`);
        console.log(`  Cell Index: ${cellIndex}`);
        console.log(`  Cell exists: ${!!cell}`);
        if (cell) {
            console.log(`  Cell is land: ${cell.classList.contains('land')}`);
        }

        if (!cell || cell.classList.contains('land')) {
            console.warn(`Cannot render marker for ${location.name}: cell is ${!cell ? 'null' : 'land'}`);
            return false;
        }

        const marker = document.createElement('div');
        marker.className = 'wave-marker';
        marker.innerHTML = `<span>${getWaveSymbol(weatherData.current.swell.direction)}</span>`;
        
        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        tooltip.innerHTML = createTooltipHtml(location.name, weatherData);

        marker.appendChild(tooltip);
        cell.appendChild(marker);
        
        console.log(`Successfully rendered marker for ${location.name}`);
        return true;
    }

    function processApiData(locationData) {
        console.log('Processing data for single location:', locationData);
        const now = new Date();
        let currentIndex = locationData.hourly.time.findIndex(t => new Date(t) > now);
        if (currentIndex === -1) currentIndex = 0;

        const safeGet = (arr, idx, def = 0) => {
            if (!arr || !Array.isArray(arr) || idx >= arr.length || idx < 0) return def;
            const val = arr[idx];
            return (val != null && !isNaN(val)) ? val : def;
        };

        return {
            current: {
                swell: {
                    height: safeGet(locationData.hourly.swell_wave_height, currentIndex, 0),
                    period: safeGet(locationData.hourly.swell_wave_period, currentIndex, 0),
                    direction: safeGet(locationData.hourly.swell_wave_direction, currentIndex, 0)
                }
            }
        };
    }

    function createTooltipHtml(locationName, data) {
        const { current } = data;
        const toFixed = (val, p = 1) => (val != null) ? val.toFixed(p) : 'N/A';

        return `
            <strong>${locationName}</strong><br><br>
            Swell: ${toFixed(current.swell.height)}m @ ${toFixed(current.swell.period, 0)}s ${getWaveSymbol(current.swell.direction)}
        `;
    }

    function getWaveSymbol(dir) {
        if (dir == null) return '';
        const symbols = ['↓', '↙', '←', '↖', '↑', '↗', '→', '↘'];
        return symbols[Math.round(dir / 45) % 8];
    }

    function getWaveHeightClass(h) {
        if (h == null) return '';
        if (h < 1) return 'wave-low';
        if (h < 2) return 'wave-mid';
        return 'wave-high';
    }

    function getSurfQuality(swellDir, windDir) {
        if (swellDir == null || windDir == null) return 'N/A';
        const diff = Math.abs(swellDir - windDir);
        const angle = Math.min(diff, 360 - diff);
        if (angle > 135) return 'Clean (Offshore)';
        if (angle < 45) return 'Choppy (Onshore)';
        return 'Cross-shore';
    }

    function showError(message) {
        errorDisplay.textContent = message;
    }

    main();
});