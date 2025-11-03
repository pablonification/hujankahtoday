const DEFAULT_CITY = 'Bandung';
const FORCE_DEFAULT_CITY = false;

async function getCoordinatesFromCity(cityName) {
    try {
        const originalCityName = cityName.trim();
        const encodedCityName = encodeURIComponent(originalCityName);
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodedCityName}&limit=10&language=id`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
            const cityNameLower = originalCityName.toLowerCase();
            let bestMatch = data.results[0];
            
            for (const result of data.results) {
                const resultNameLower = (result.name || '').toLowerCase();
                if (resultNameLower === cityNameLower || resultNameLower.includes(cityNameLower)) {
                    bestMatch = result;
                    break;
                }
            }
            
            return {
                lat: bestMatch.latitude,
                lon: bestMatch.longitude,
                name: originalCityName
            };
        }
        return null;
    } catch (error) {
        console.error('Error geocoding:', error);
        return null;
    }
}

async function getLocationNameFromCoords(lat, lon) {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=id&zoom=10`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'WeatherApp/1.0'
            }
        });
        const data = await response.json();
        
        if (data.address) {
            const address = data.address;
            const locationParts = [];
            
            if (address.city || address.town || address.village) {
                locationParts.push(address.city || address.town || address.village);
            }
            if (address.state || address.region) {
                const state = address.state || address.region;
                if (!locationParts.includes(state)) {
                    locationParts.push(state);
                }
            }
            
            if (locationParts.length > 0) {
                return locationParts.join(', ');
            }
            
            if (data.display_name) {
                const parts = data.display_name.split(',');
                return parts[0] + (parts[1] ? ', ' + parts[1] : '');
            }
        }
        return `Lokasi Anda (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
    } catch (error) {
        console.error('Error reverse geocoding:', error);
        return `Lokasi Anda (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
    }
}

function getLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            resolve(null);
            return;
        }
        
        const options = {
            timeout: 5000,
            maximumAge: 600000,
            enableHighAccuracy: false
        };
        
        const timeoutId = setTimeout(() => {
            resolve(null);
        }, 6000);
        
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                clearTimeout(timeoutId);
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                const locationName = await getLocationNameFromCoords(lat, lon);
                
                resolve({
                    lat: lat,
                    lon: lon,
                    name: locationName
                });
            },
            (error) => {
                clearTimeout(timeoutId);
                resolve(null);
            },
            options
        );
    });
}

function getUserTimezone() {
    try {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return encodeURIComponent(timezone);
    } catch (error) {
        return 'Asia%2FJakarta';
    }
}

async function getWeatherData(location) {
    let lat, lon, locationName;
    
    try {
        if (location && location.lat && location.lon) {
            lat = location.lat;
            lon = location.lon;
            locationName = location.name || DEFAULT_CITY;
        } else {
            console.log('Mencari koordinat untuk:', DEFAULT_CITY);
            const coords = await getCoordinatesFromCity(DEFAULT_CITY);
            if (!coords || !coords.lat || !coords.lon) {
                throw new Error(`Gagal mendapatkan koordinat kota ${DEFAULT_CITY}`);
            }
            lat = coords.lat;
            lon = coords.lon;
            locationName = coords.name || DEFAULT_CITY;
            console.log('Koordinat ditemukan:', lat, lon, 'Nama lokasi:', locationName);
        }
        
        const timezone = getUserTimezone();
        console.log('Timezone:', timezone);
        
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=weathercode,precipitation_probability,precipitation&current_weather=true&timezone=${timezone}`;
        console.log('Fetching weather from:', url);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        try {
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('API Error:', response.status, errorText);
                throw new Error(`API Error: ${response.status} - ${errorText.substring(0, 100)}`);
            }
            
            const data = await response.json();
            console.log('Weather data received:', data);
            
            if (!data.current_weather || !data.hourly) {
                console.error('Data tidak lengkap:', { 
                    hasCurrentWeather: !!data.current_weather, 
                    hasHourly: !!data.hourly,
                    dataKeys: Object.keys(data)
                });
                throw new Error('Data cuaca tidak lengkap dari API');
            }
            
            return {
                ...data,
                locationName: locationName
            };
        } catch (fetchError) {
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') {
                throw new Error('Request timeout - API tidak merespon dalam 15 detik');
            }
            throw fetchError;
        }
    } catch (error) {
        console.error('Error fetching weather:', error);
        throw error;
    }
}

function isRainyWeathercode(code) {
    return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99);
}

function checkRain(weatherData) {
    const now = new Date();
    const currentHour = now.getHours();
    
    const currentWeathercode = weatherData.current_weather.weathercode;
    const isRainingNow = isRainyWeathercode(currentWeathercode);
    
    const rainPredictions = [];
    const hourly = weatherData.hourly;
    
    for (let i = 0; i < Math.min(24, hourly.time.length); i++) {
        const forecastTime = new Date(hourly.time[i]);
        const forecastHour = forecastTime.getHours();
        const weathercode = hourly.weathercode[i];
        const precipitation = hourly.precipitation[i];
        const precipitationProb = hourly.precipitation_probability[i];
        
        if (isRainyWeathercode(weathercode) || (precipitationProb > 50 && precipitation > 0.1)) {
            rainPredictions.push({
                time: forecastHour,
                datetime: forecastTime,
                precipitation: precipitation,
                probability: precipitationProb
            });
        }
    }
    
    return {
        isRainingNow,
        rainPredictions,
        location: weatherData.locationName
    };
}

function formatTime(hour) {
    if (hour < 10) {
        return `0${hour}:00`;
    }
    return `${hour}:00`;
}

function formatDate(date) {
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 
                   'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    
    const dayName = days[date.getDay()];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    
    return `${dayName}, ${day} ${month} ${year}`;
}

function formatTimeRange(hours) {
    if (hours.length === 0) return '';
    if (hours.length === 1) return formatTime(hours[0]);
    
    const sortedHours = [...hours].sort((a, b) => a - b);
    const ranges = [];
    let start = sortedHours[0];
    let end = sortedHours[0];
    
    for (let i = 1; i < sortedHours.length; i++) {
        if (sortedHours[i] === end + 1) {
            end = sortedHours[i];
        } else {
            if (start === end) {
                ranges.push(formatTime(start));
            } else {
                ranges.push(`${formatTime(start)}-${formatTime(end)}`);
            }
            start = sortedHours[i];
            end = sortedHours[i];
        }
    }
    
    if (start === end) {
        ranges.push(formatTime(start));
    } else {
        ranges.push(`${formatTime(start)}-${formatTime(end)}`);
    }
    
    return ranges.join(', ');
}

async function init() {
    const statusEl = document.getElementById('status');
    const messageEl = document.getElementById('message');
    const locationEl = document.getElementById('location');
    
    try {
        let location = null;
        
        if (FORCE_DEFAULT_CITY) {
            console.log('DEBUG: FORCE_DEFAULT_CITY aktif, skip geolocation');
            statusEl.textContent = `DEBUG: Menggunakan lokasi default: ${DEFAULT_CITY}...`;
        } else {
            statusEl.textContent = 'mengambil lokasi...';
            location = await getLocation();
            
            if (!location) {
                statusEl.textContent = 'menggunakan lokasi default: Bandung...';
            }
        }
        
        statusEl.textContent = 'mengambil data cuaca...';
        console.log('Memanggil getWeatherData...');
        
        let weatherData;
        try {
            weatherData = await getWeatherData(location);
            console.log('getWeatherData selesai, data diterima');
        } catch (weatherError) {
            console.error('Error di getWeatherData:', weatherError);
            throw weatherError;
        }
        
        console.log('Validating weather data...');
        if (!weatherData || !weatherData.current_weather || !weatherData.hourly) {
            console.error('Data tidak valid:', weatherData);
            throw new Error('Data cuaca tidak valid');
        }
        console.log('Data valid, analyzing...');
        
        const rainInfo = checkRain(weatherData);
        console.log('Analysis complete:', rainInfo);
        
        const memeImageEl = document.getElementById('meme-image');
        const answerEl = document.getElementById('answer');
        const dateEl = document.getElementById('date');
        statusEl.textContent = '';
        
        const today = new Date();
        dateEl.textContent = formatDate(today);
        
        locationEl.textContent = `lokasi: ${rainInfo.location}`;
        
        if (rainInfo.isRainingNow) {
            document.body.classList.add('raining');
            answerEl.textContent = 'YA';
            answerEl.className = 'rain';
            messageEl.textContent = 'bawa payung/jas hujan sekarang woy, ujan nih!';
            messageEl.className = 'rain';
            
            memeImageEl.src = '/public/meme-hujan-sekarang.jpg';
            memeImageEl.alt = 'Meme hujan sekarang';
            memeImageEl.style.display = 'block';
            
            if (rainInfo.rainPredictions.length > 1) {
                const nextRainHours = rainInfo.rainPredictions
                    .slice(1)
                    .map(p => p.time);
                const nextRainTimes = formatTimeRange(nextRainHours);
                if (nextRainTimes) {
                    statusEl.innerHTML = `<br>hujan bakal lanjut sekitar jam ${nextRainTimes}`;
                }
            }
        } else if (rainInfo.rainPredictions.length > 0) {
            document.body.classList.remove('raining');
            const rainHours = rainInfo.rainPredictions.map(p => p.time);
            const rainTimes = formatTimeRange(rainHours);
            answerEl.textContent = 'YA';
            answerEl.className = 'rain';
            messageEl.textContent = 'bawa payung/jas hujan nya bang!';
            messageEl.className = 'rain';
            statusEl.textContent = `hujan diperkirakan mulai sekitar jam ${rainTimes}`;
            
            memeImageEl.src = '/public/meme-akan-hujan.gif';
            memeImageEl.alt = 'Meme akan hujan';
            memeImageEl.style.display = 'block';
        } else {
            document.body.classList.remove('raining');
            answerEl.textContent = 'NGGA';
            answerEl.className = 'no-rain';
            messageEl.textContent = 'ga perlu bawa payung hari ini!';
            messageEl.className = 'no-rain';
            statusEl.textContent = 'cuaca cerah, tidak ada prediksi hujan.';
            
            memeImageEl.src = '/public/meme-tidak-hujan.jpg';
            memeImageEl.alt = 'Meme tidak hujan';
            memeImageEl.style.display = 'block';
        }
        
    } catch (error) {
        const memeImageEl = document.getElementById('meme-image');
        const answerEl = document.getElementById('answer');
        document.body.classList.remove('raining');
        statusEl.textContent = `error: ${error.message || 'gagal mengambil data cuaca'}`;
        messageEl.textContent = 'coba lagi nanti ya atau cek koneksi internet kamu';
        messageEl.className = 'rain';
        answerEl.textContent = '';
        memeImageEl.style.display = 'none';
        console.error('Error details:', error);
    }
}

init();
