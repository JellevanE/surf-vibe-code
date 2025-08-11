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
            showStatus('Loading application...');
            
            const geoData = await fetchData('./netherlands.geojson');
            const projection = setupProjection(geoData);
            createMapGrid(projection, geoData);
            
            showStatus('Loading weather data...');
            const allWeatherData = await fetchAllWeatherData(LOCATIONS);
            
            const validDataCount = allWeatherData.filter(data => data !== null).length;
            console.log(`Loaded weather data for ${validDataCount}/${LOCATIONS.length} locations`);
            
            if (validDataCount === 0) {
                showError('No weather data available. Please try again later.');
                return;
            }
            
            showStatus('Rendering map...');
            renderHeatmap(LOCATIONS, allWeatherData, projection);
            
            // Clear status message on success
            setTimeout(() => showStatus(''), 1000);

        } catch (error) {
            console.error('Application initialization failed:', error);
            showError(`Failed to load: ${error.message}`);
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
                
                // Check if this point is inland (use a small buffer to avoid marking coastal areas as land)
                const isInland = d3.geoContains(geoData, [lon, lat]);
                
                // For coastal classification, also check slightly offshore points
                const offshorePoints = [
                    [lon - 0.01, lat],     // West
                    [lon + 0.01, lat],     // East  
                    [lon, lat - 0.01],     // South
                    [lon, lat + 0.01],     // North
                ];
                
                const nearbyLandPoints = offshorePoints.filter(point => 
                    d3.geoContains(geoData, point)
                ).length;
                
                // Only mark as land if the point is inland AND most nearby points are also inland
                if (isInland && nearbyLandPoints >= 3) {
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
            const responseArray = await fetchData(apiUrl);
            
            if (!Array.isArray(responseArray)) {
                console.warn('Expected array from API, got:', typeof responseArray);
                return locations.map(() => null);
            }
            
            return responseArray.map((locationData, index) => {
                if (!locationData?.hourly?.swell_wave_height) {
                    console.warn(`No valid wave data for location ${index}`);
                    return null;
                }
                return processApiData(locationData);
            });

        } catch (error) {
            console.error('Failed to fetch weather data:', error);
            showError('Could not load weather data');
            return locations.map(() => null);
        }
    }

    function processApiData(locationData) {
        const now = new Date();
        let currentIndex = locationData.hourly.time.findIndex(t => new Date(t) > now);
        if (currentIndex === -1) currentIndex = 0;

        const safeGet = (arr, idx, def = 0) => {
            if (!arr || idx >= arr.length || idx < 0) return def;
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

    function renderHeatmap(locations, allWeatherData, projection) {
        const validWeatherData = allWeatherData.filter(data => data !== null);
        const validLocations = locations.filter((_, index) => allWeatherData[index] !== null);

        if (validWeatherData.length === 0) return;

        const seaCells = Array.from(map.querySelectorAll('.map-cell:not(.land)'));

        seaCells.forEach(cell => {
            const [lon, lat] = projection.invert(getCellCoords(cell));
            const weightedHeight = getWeightedAverageHeight(lon, lat, validLocations, validWeatherData);
            const color = getHeatmapColor(weightedHeight);
            cell.style.backgroundColor = color;
        });

        // Clear existing markers and render new ones
        map.querySelectorAll('.wave-marker').forEach(marker => marker.remove());

        allWeatherData.forEach((weatherData, index) => {
            if (weatherData !== null) {
                renderWaveMarker(locations[index], weatherData, projection);
            }
        });
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
            if (!weatherData?.current?.swell) return;
            
            const swellHeight = weatherData.current.swell.height;
            if (typeof swellHeight !== 'number' || isNaN(swellHeight)) return;

            const loc = locations[i];
            if (!loc) return;

            const dist = d3.geoDistance([lon, lat], [loc.lon, loc.lat]);
            const weight = 1 / (dist * dist + 0.01);

            totalHeight += swellHeight * weight;
            totalWeight += weight;
        });

        return totalWeight > 0 ? totalHeight / totalWeight : 0;
    }

    function getHeatmapColor(height) {
        const h = Math.min(Math.max(height, 0), 1.5); // Keep the smaller scale for Dutch waves
        
        // Synthwave/cyberpunk color scheme - much more funky!
        const colors = {
            0.0: '#0a0a23',  // Deep purple-black
            0.2: '#1a0b3d',  // Dark purple
            0.4: '#2d1b69',  // Electric purple  
            0.6: '#ff006e',  // Hot pink/magenta
            0.8: '#ff4081',  // Bright pink
            1.0: '#00f5ff',  // Cyan
            1.2: '#39ff14',  // Neon green
            1.5: '#ffff00'   // Electric yellow
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
        if (!weatherData?.current?.swell) return;

        const [x, y] = projection([location.lon, location.lat]);
        
        if (isNaN(x) || isNaN(y) || x < 0 || y < 0 || x >= MAP_CONFIG.cols || y >= MAP_CONFIG.rows) {
            console.warn(`${location.name} outside bounds: (${x.toFixed(1)}, ${y.toFixed(1)})`);
            return;
        }

        const r = Math.floor(y);
        const c = Math.floor(x);
        const cellIndex = r * MAP_CONFIG.cols + c;
        const cell = map.children[cellIndex];

        if (!cell) {
            console.warn(`${location.name} - no cell found`);
            return;
        }

        // For coastal surf spots, we'll place markers even if the cell is marked as "land"
        // because surf spots are often right at the coastline
        console.log(`${location.name} at (${r}, ${c}) - land: ${cell.classList.contains('land')}`);

        // Clear any existing marker
        const existingMarker = cell.querySelector('.wave-marker');
        if (existingMarker) existingMarker.remove();

        const marker = document.createElement('div');
        marker.className = 'wave-marker';
        
        // If it's on land, make it slightly different to show it's a coastal marker
        if (cell.classList.contains('land')) {
            marker.classList.add('coastal-marker');
        }
        
        marker.innerHTML = `<span>${getWaveSymbol(weatherData.current.swell.direction)}</span>`;
        
        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        tooltip.innerHTML = createTooltipHtml(location.name, weatherData);

        marker.appendChild(tooltip);
        cell.appendChild(marker);
        
        console.log(`✓ ${location.name} placed at (${r}, ${c})`);
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

    function showStatus(message) {
        errorDisplay.textContent = message;
        errorDisplay.style.color = '#a0a0a0';
    }

    function showError(message) {
        errorDisplay.textContent = message;
        errorDisplay.style.color = '#ff6347';
    }

    main();
});