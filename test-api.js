// Test script to understand Open-Meteo API response structure
const LOCATIONS = [
    { name: 'Texel', lat: 53.06, lon: 4.78 },
    { name: 'Callantsoog', lat: 52.86, lon: 4.69 },
    { name: 'Wijk aan Zee', lat: 52.52, lon: 4.60 }
];

async function testAPI() {
    const latitudes = LOCATIONS.map(loc => loc.lat).join(',');
    const longitudes = LOCATIONS.map(loc => loc.lon).join(',');
    const apiUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${latitudes}&longitude=${longitudes}&hourly=swell_wave_height,swell_wave_period,swell_wave_direction&timezone=auto`;
    
    console.log('API URL:', apiUrl);
    
    try {
        const response = await fetch(apiUrl);
        const data = await response.json();
        
        console.log('Full API Response Structure:');
        console.log(JSON.stringify(data, null, 2));
        
        console.log('\nArray lengths:');
        console.log('Time array length:', data.hourly?.time?.length);
        console.log('Wave height array length:', data.hourly?.swell_wave_height?.length);
        console.log('Wave period array length:', data.hourly?.swell_wave_period?.length);
        console.log('Wave direction array length:', data.hourly?.swell_wave_direction?.length);
        
        console.log('\nFirst 5 wave height values:', data.hourly?.swell_wave_height?.slice(0, 5));
        
    } catch (error) {
        console.error('API test failed:', error);
    }
}

testAPI();
