// Client-side code (JavaScript for front-end functionality)
document.addEventListener("DOMContentLoaded", function () {
    let map;
    let centerMarker;
    let markersLayer = [];
    let placeholderMarkers = []; // Placeholder markers for visualization
    let googleAutocomplete;
    let selectedGridPoints = []; // Array to store selected grid points that will be sent to the API
    let openInfoWindowDiv = null; // Store the currently open info window div

    // Initialize Google Map
    function initGoogleMap(lat = 39.8283, lng = -98.5795) {
        const mapOptions = {
            center: { lat: lat, lng: lng },
            zoom: 4,
        };
        map = new google.maps.Map(document.getElementById('map'), mapOptions);

        // Add click listener to close info window when clicking outside
        map.addListener('click', function () {
            if (openInfoWindowDiv) {
                closeInfoWindow();
            }
        });
    }

    // Initialize Google Places Autocomplete
    googleAutocomplete = new google.maps.places.Autocomplete(document.getElementById('business-name'), {
        fields: ['place_id', 'geometry.location']
    });
    googleAutocomplete.addListener('place_changed', function () {
        const place = googleAutocomplete.getPlace();
        if (!place.geometry || !place.geometry.location) {
            alert("No details available for input: '" + place.name + "'");
            return;
        }

        // Fetch latitude and longitude from Google Places API
        const googleLat = place.geometry.location.lat();
        const googleLng = place.geometry.location.lng();

        // Populate fields with place details (ensure elements are not null)
        const addressInput = document.getElementById("address");
        const placeIdInput = document.getElementById("place-id");
        const latitudeInput = document.getElementById("latitude");
        const longitudeInput = document.getElementById("longitude");

        if (addressInput) addressInput.value = place.formatted_address || '';
        if (placeIdInput) placeIdInput.value = place.place_id || '';
        if (latitudeInput) latitudeInput.value = googleLat || '';
        if (longitudeInput) longitudeInput.value = googleLng || '';

        // Set the map view to the selected location
        map.setCenter({ lat: googleLat, lng: googleLng });
        map.setZoom(13);

        // Add center marker
        if (centerMarker) {
            centerMarker.setMap(null);
        }
        centerMarker = new google.maps.Marker({
            position: { lat: googleLat, lng: googleLng },
            map: map,
            title: "Selected Business Location"
        });

        // Visualize default grid points (3x3) once the business name is selected
        visualizePlaceholders();
    });

    // Adjust grid size options based on grid type selection
    document.getElementById('grid-type').addEventListener('change', function () {
        const gridSizeSelect = document.getElementById('grid-size');
        gridSizeSelect.innerHTML = '';

        if (this.value === 'circular') {
            const circularOptions = [
                { value: 1, label: '1 layer (8 points)' },
                { value: 2, label: '2 layers (24 points)' },
                { value: 3, label: '3 layers (48 points)' },
                { value: 4, label: '4 layers (84 points)' },
                { value: 5, label: '5 layers (132 points)' },
                { value: 6, label: '6 layers (192 points)' },
                { value: 7, label: '7 layers (264 points)' }
            ];
            circularOptions.forEach(option => {
                const opt = document.createElement('option');
                opt.value = option.value;
                opt.textContent = option.label;
                gridSizeSelect.appendChild(opt);
            });
        } else {
            // Default square grid options
            const squareOptions = [
                { value: 3, label: '3x3' },
                { value: 5, label: '5x5' },
                { value: 7, label: '7x7' },
                { value: 9, label: '9x9' },
                { value: 11, label: '11x11' },
                { value: 13, label: '13x13' },
                { value: 15, label: '15x15' }
            ];
            squareOptions.forEach(option => {
                const opt = document.createElement('option');
                opt.value = option.value;
                opt.textContent = option.label;
                gridSizeSelect.appendChild(opt);
            });
        }
        visualizePlaceholders(); // Update placeholders when grid type changes
    });

    // Event listener for form submission
    document.getElementById('track-form').addEventListener('submit', function (e) {
        e.preventDefault();

        // Ensure all required fields are provided
        const placeId = document.getElementById('place-id') ? document.getElementById('place-id').value : null;
        const query = document.getElementById('query').value;
        const gridSize = document.getElementById('grid-size').value;
        const radius = document.getElementById('radius').value;
        const radiusUnits = document.getElementById('units').value;
        const googleLat = document.getElementById('latitude') ? document.getElementById('latitude').value : null;
        const googleLng = document.getElementById('longitude') ? document.getElementById('longitude').value : null;
        const gridType = document.getElementById('grid-type').value;

        if (!placeId || !query || !googleLat || !googleLng || !gridSize || !radius || !radiusUnits || !gridType) {
            alert("All required fields must be provided.");
            return;
        }

        // Send a POST request to the server with selected grid points
        fetch('/track', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                place_id: placeId,
                query: query,
                lat: googleLat,
                lng: googleLng,
                grid_type: gridType,
                grid_size: gridSize,
                radius: radius,
                radius_units: radiusUnits,
                grid_points: selectedGridPoints // Use only selected grid points
            })
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .then(results => {
                if (results.error) {
                    console.error('API Error:', results.error.message);
                    alert(`Error: ${results.error.message}`);
                    return;
                }
                console.log('API results:', results);
                updateMapWithResults(results);
                document.getElementById("map").scrollIntoView({ behavior: "smooth", block: "start" });
            })
            .catch(error => console.error('Error fetching rank data:', error));
    });

    // Function to create grid points
    function createGridPoints(gridType, centerLat, centerLng, gridSize, radius, radiusUnits) {
        let radiusInMeters;
        if (radiusUnits === 'mi') {
            radiusInMeters = radius * 1609.34;
        } else {
            radiusInMeters = radius * 1000;
        }

        const gridPoints = gridType === 'circular'
            ? createCircularGridPoints(centerLat, centerLng, gridSize, radiusInMeters)
            : createSquareGridPoints(centerLat, centerLng, gridSize, radiusInMeters);

        // Set selectedGridPoints to be all points initially
        selectedGridPoints = [...gridPoints];
        return gridPoints;
    }

    // Function to create circular grid points
    function createCircularGridPoints(centerLat, centerLng, numLayers, radius) {
        const points = [];
        const layerPoints = [8, 16, 24, 36, 48, 60, 72];

        const centerLatitude = parseFloat(centerLat);
        const centerLongitude = parseFloat(centerLng);

        let currentRadius = radius;

        for (let layer = 0; layer < numLayers; layer++) {
            const pointsInLayer = layerPoints[layer];
            const angleIncrement = 360 / pointsInLayer;

            for (let i = 0; i < pointsInLayer; i++) {
                const angle = i * angleIncrement;
                const angleInRadians = angle * (Math.PI / 180);

                const deltaLat = (currentRadius * Math.cos(angleInRadians)) / 111320;
                const deltaLng = (currentRadius * Math.sin(angleInRadians)) / (111320 * Math.cos(centerLatitude * Math.PI / 180));

                const pointLat = centerLatitude + deltaLat;
                const pointLng = centerLongitude + deltaLng;

                points.push({ lat: parseFloat(pointLat.toFixed(8)), lng: parseFloat(pointLng.toFixed(8)) });
            }
            currentRadius += radius;
        }

        return points;
    }

    // Function to create square grid points
    function createSquareGridPoints(centerLat, centerLng, gridSize, spacing) {
        const points = [];
        const halfGridSize = Math.floor(gridSize / 2);

        for (let i = -halfGridSize; i <= halfGridSize; i++) {
            for (let j = -halfGridSize; j <= halfGridSize; j++) {
                const pointLat = parseFloat(centerLat) + (i * spacing) / 111320;
                const pointLng = parseFloat(centerLng) + (j * spacing) / (111320 * Math.cos(parseFloat(centerLat) * (Math.PI / 180)));

                points.push({ lat: parseFloat(pointLat.toFixed(8)), lng: parseFloat(pointLng.toFixed(8)) });
            }
        }

        return points;
    }

    // Function to update the map with the API results
    function updateMapWithResults(results) {
        if (!Array.isArray(results)) {
            console.error("Unexpected response format:", results);
            return;
        }

        // Clear previous markers
        markersLayer.forEach(marker => marker.setMap(null));
        markersLayer = [];

        results.forEach(result => {
            const point = result.point;
            const rank = result.rank;

            const lat = parseFloat(point.lat);
            const lng = parseFloat(point.lng);

            if (isNaN(lat) || isNaN(lng)) {
                console.error("Invalid latitude or longitude value:", point);
                return;
            }

            const latLng = { lat: lat, lng: lng };

            let rankDisplay;
            let markerColor;

            if (rank === -1) {
                rankDisplay = '+20';
                markerColor = 'red';
            } else if (rank <= 3) {
                rankDisplay = rank;
                markerColor = 'green';
            } else if (rank > 3 && rank <= 10) {
                rankDisplay = rank;
                markerColor = 'orange';
            } else if (rank > 10 && rank <= 20) {
                rankDisplay = rank;
                markerColor = 'red';
            } else {
                rankDisplay = rank > 20 ? '+20' : rank;
                markerColor = 'red';
            }

            const customIcon = {
                url: `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"><circle cx="15" cy="15" r="15" fill="${markerColor}" /><text x="50%" y="50%" alignment-baseline="middle" text-anchor="middle" font-size="12" fill="white">${rankDisplay}</text></svg>`,
                scaledSize: new google.maps.Size(30, 30),
                anchor: new google.maps.Point(15, 15)
            };

            const marker = new google.maps.Marker({
                position: latLng,
                map: map,
                title: `Rank: ${rankDisplay}`,
                icon: customIcon
            });

            markersLayer.push(marker);

            // Create and show info window on click
            google.maps.event.addListener(marker, 'click', function () {
                const infoWindowOverlay = document.getElementById('info-window-overlay');
                const infoWindowBody = document.getElementById('info-window-body');
                
                if (infoWindowOverlay && infoWindowBody) {
                    // Get the rank of the clicked marker
                    const markerRank = parseInt(this.title.replace("Rank: ", ""), 10); // Extract the rank number
                    
                    // Generate the HTML content for the business tiles
                    infoWindowBody.innerHTML = `
                        <h3>Top 20 Results:</h3>
                        <div class="business-tiles">
                            ${result.places.slice(0, 20).map((place, index) => {
                                const isSelected = (index + 1) === markerRank; // Check if this tile matches the rank of the clicked marker

                                // Create the star rating display
                                const stars = Math.round(place.rating || 0);
                                const starIcons = Array(stars).fill('&#9733;').join('') + Array(5 - stars).fill('&#9734;').join('');

                                return `
                                    <div class="business-tile ${isSelected ? 'highlighted-query' : ''}">
                                        <div class="rank">#${index + 1}</div>
                                        <div class="name">${place.name}</div>
                                        <div class="rating">${place.rating || 'N/A'} <span class="stars">${starIcons}</span> (${place.user_ratings_total || 'N/A'})</div>
                                        <div class="address">${place.formatted_address}</div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    `;
                    // Show the overlay
                    infoWindowOverlay.style.display = 'flex';
                }
            });

        });
    }

    // Ensure the info window closes properly when clicking outside or on the close button
    document.getElementById('close-info-window').addEventListener('click', function () {
        document.getElementById('info-window-overlay').style.display = 'none';
    });

    // Initialize map with a default location
    initGoogleMap();

    // Placeholder marker visualization before running search
    document.getElementById('grid-size').addEventListener('change', visualizePlaceholders);
    document.getElementById('radius').addEventListener('input', visualizePlaceholders);
    document.getElementById('grid-type').addEventListener('change', visualizePlaceholders);
    document.getElementById('units').addEventListener('change', visualizePlaceholders);

    function visualizePlaceholders() {
        // Clear existing placeholders and result markers
        placeholderMarkers.forEach(marker => marker.setMap(null));
        markersLayer.forEach(marker => marker.setMap(null));
        placeholderMarkers = [];
        markersLayer = [];

        const gridType = document.getElementById('grid-type').value;
        const gridSize = parseInt(document.getElementById('grid-size').value);
        const radius = parseFloat(document.getElementById('radius').value);
        const radiusUnits = document.getElementById('units').value;
        const googleLat = parseFloat(document.getElementById('latitude').value);
        const googleLng = parseFloat(document.getElementById('longitude').value);

        if (!googleLat || !googleLng || !radius || !gridSize) {
            return;
        }

        const gridPoints = createGridPoints(gridType, googleLat, googleLng, gridSize, radius, radiusUnits);

        gridPoints.forEach(point => {
            const placeholderMarker = new google.maps.Marker({
                position: point,
                map: map,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 10, // Double the size of the placeholder
                    fillColor: '#007bff',
                    fillOpacity: 0.8,
                    strokeWeight: 1,
                    strokeColor: '#fff'
                },
                clickable: true,
            });

            placeholderMarker.addListener('click', function () {
                placeholderMarker.setMap(null);
                gridPoints.splice(gridPoints.indexOf(point), 1);
                selectedGridPoints = [...gridPoints]; // Update selected grid points
            });

            placeholderMarkers.push(placeholderMarker);
        });

        const bounds = new google.maps.LatLngBounds();
        gridPoints.forEach(point => bounds.extend(point));
        map.fitBounds(bounds);
    }
});