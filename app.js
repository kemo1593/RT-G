// Importing necessary modules
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

const app = express();

// Middleware to parse JSON bodies and serve static files
app.use(bodyParser.json());
app.use(express.static('public'));

// Proxy route for Google Maps API
dotenv.config();
app.get('/proxy-google-maps', (req, res) => {
  const url = `https://maps.googleapis.com/maps/api/js?key=${process.env.GOOGLE_API_KEY}&libraries=places`;
  
  // Request to Google Maps API
  axios.get(url)
    .then(response => {
      res.send(response.data);
    })
    .catch(error => {
      console.error(error);
      res.status(500).send('Error proxying Google Maps API');
    });
});

// Handle POST requests for tracking rankings
app.post('/track', async (req, res) => {
  const { place_id, query, lat, lng, grid_size, radius, radius_units, grid_points } = req.body;

  if (!query || !lat || !lng || !grid_size || !radius) {
    return res.status(400).json({ error: { message: 'All required fields must be provided' } });
  }

  try {
    // Array to hold rank tracking results
    let results = [];

    // For each grid point, perform a Text Search using Google Places API
    for (let point of grid_points) {
      const options = {
        method: 'GET',
        url: 'https://maps.googleapis.com/maps/api/place/textsearch/json',
        params: {
          query: query,
          location: `${point.lat},${point.lng}`,
          key: process.env.GOOGLE_API_KEY
        }
      };

      const response = await axios.request(options);
      if (response.data && response.data.results) {
        // Collect the rank and places data
        const places = response.data.results.slice(0, 20);
        let rank = -1;
        for (let i = 0; i < places.length; i++) {
          if (places[i].place_id === place_id) {
            rank = i + 1;
            break;
          }
        }
        results.push({ point, places, rank });
      }
    }

    res.json(results);
  } catch (error) {
    console.error('API request error:', error.response?.data || error.message);
    res.status(500).json({ error: { message: error.response?.data || error.message } });
  }
});

// Start the server on port 5000
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});