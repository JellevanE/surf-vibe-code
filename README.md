# Surf Vibe - North Sea Wave Charts

A retro-styled, terminal-like web application that visualizes real-time wave data for the Dutch coast. This project aims to provide a quick and intuitive overview of surf conditions, reminiscent of classic command-line interfaces.

## Features

*   **Retro CLI Design:** A clean, monospace, and muted color scheme for a nostalgic feel.
*   **Dynamic North Sea Map:** An interactive grid-based map of the North Sea, focused on the Dutch coastline, generated using GeoJSON data and D3.js.
*   **Wave Height Heatmap:** Visualizes wave height across the sea using a color gradient, providing an immediate understanding of conditions.
*   **Location Markers:** Specific coastal towns are marked with wave direction symbols.
*   **Detailed Tooltips:** Hover over a location marker to see current swell height, period, direction, and wind information.
*   **Real-time Data:** Fetches up-to-date marine weather data from the Open-Meteo API.

## Setup

To get this project running locally, follow these steps:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/JellevanE/surf-vibe-code.git
    ```
2.  **Navigate into the project directory:**
    ```bash
    cd surf-vibe-code
    ```

## Running the Application

Since this is a client-side web application that fetches data from an external API and local GeoJSON files, it needs to be served from a web server to avoid Cross-Origin Resource Sharing (CORS) issues.

The easiest way to do this is using Python's built-in HTTP server:

1.  **Ensure you are in the `surf-vibe-code` directory.**
2.  **Start the server:**
    ```bash
    python3 -m http.server
    ```
    You should see output similar to: `Serving HTTP on :: port 8000 (http://[::]:8000/) ...`
3.  **Open your web browser** and go to:
    ```
    http://localhost:8000
    ```

The application should now load and display the wave chart.

## Technologies Used

*   **HTML5:** For the basic structure of the web page.
*   **CSS3:** For styling and creating the retro CLI aesthetic.
*   **JavaScript (ES6+):** For all dynamic functionality, API calls, and map rendering.
*   **D3.js (d3-geo):** A powerful JavaScript library used for geographic projections and handling GeoJSON data to draw the map.
*   **Open-Meteo Marine API:** Provides real-time and forecast wave data.

---
