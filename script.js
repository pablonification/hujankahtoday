const fallbackLocation = {
  name: "Bandung, Indonesia",
  latitude: -6.9175,
  longitude: 107.6191,
  reason: "Menggunakan lokasi default Bandung."
};

const statusContainer = document.getElementById("status-message");
const statusDetail = document.getElementById("status-detail");
const locationLabel = document.getElementById("location");
const statusSection = document.querySelector(".status");

const yearEl = document.getElementById("year");
if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}

const PROBABILITY_THRESHOLD = 50;
const PRECIP_THRESHOLD = 0.2; // mm

init();

async function init() {
  try {
    renderStatus({
      summary: "Meminta lokasi…",
      detail: ""
    });

    const userLocation = await resolveLocation();
    await updateLocationLabel(userLocation);

    renderStatus({
      summary: "Mengambil ramalan cuaca…",
      detail: "Menganalisis data dari Open-Meteo."
    });

    const weather = await fetchWeather(userLocation.coords);
    const advice = analyzeWeather(weather);

    const detail = [advice.detail, userLocation.message]
      .filter(Boolean)
      .join(" ");

    renderStatus({ ...advice, detail });
  } catch (error) {
    console.error(error);
    renderStatus({
      summary: "Gagal memuat data cuaca",
      detail: error.message || "Silakan coba lagi nanti.",
      variant: "rain"
    });
  }
}

function renderStatus({ summary, detail, variant = "neutral" }) {
  const variants = ["status--rain", "status--clear"];
  variants.forEach((cls) => statusSection.classList.remove(cls));

  if (variant === "rain") {
    statusSection.classList.add("status--rain");
  } else if (variant === "clear") {
    statusSection.classList.add("status--clear");
  }

  statusContainer.textContent = summary;
  statusDetail.textContent = detail;
}

async function resolveLocation() {
  if (!("geolocation" in navigator)) {
    return {
      coords: {
        latitude: fallbackLocation.latitude,
        longitude: fallbackLocation.longitude
      },
      message: "Peramban tidak mendukung geolokasi."
    };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          coords: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          }
        });
      },
      (error) => {
        let reason = "";
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reason = "Izin lokasi ditolak.";
            break;
          case error.POSITION_UNAVAILABLE:
            reason = "Lokasi tidak tersedia.";
            break;
          case error.TIMEOUT:
            reason = "Permintaan lokasi melebihi batas waktu.";
            break;
          default:
            reason = "Tidak dapat memperoleh lokasi.";
        }
        resolve({
          coords: {
            latitude: fallbackLocation.latitude,
            longitude: fallbackLocation.longitude
          },
          message: `${reason} Menggunakan data Bandung.`
        });
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  });
}

async function updateLocationLabel(locationResult) {
  if (locationResult.message) {
    statusDetail.textContent = locationResult.message;
  }

  const { latitude, longitude } = locationResult.coords;

  try {
    const placeName = await fetchLocationName(latitude, longitude);
    locationLabel.textContent = placeName;
  } catch (error) {
    console.warn("Gagal mendapatkan nama lokasi:", error);
    const rounded = `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
    locationLabel.textContent = `Koordinat ${rounded}`;
  }
}

async function fetchLocationName(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    count: "1",
    language: "id"
  });

  const response = await fetch(
    `https://geocoding-api.open-meteo.com/v1/reverse?${params.toString()}`
  );

  if (!response.ok) {
    throw new Error("Tidak dapat memuat nama lokasi.");
  }

  const data = await response.json();
  const entry = data.results?.[0];

  if (!entry) {
    throw new Error("Nama lokasi tidak ditemukan.");
  }

  const parts = [entry.name, entry.admin1, entry.country_code]
    .filter(Boolean)
    .join(", ");

  return parts;
}

async function fetchWeather({ latitude, longitude }) {
  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    hourly: "precipitation_probability,precipitation",
    timezone: "auto"
  });

  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?${params.toString()}`
  );

  if (!response.ok) {
    throw new Error("Tidak dapat memuat data cuaca.");
  }

  return response.json();
}

function analyzeWeather(weather) {
  const {
    hourly,
    utc_offset_seconds: offsetSeconds = 0,
    timezone = "UTC"
  } = weather;
  if (!hourly || !hourly.time || hourly.time.length === 0) {
    throw new Error("Data cuaca tidak tersedia.");
  }

  const nowUtcMs = Date.now();
  const offsetMs = offsetSeconds * 1000;
  const nowLocal = new Date(nowUtcMs + offsetMs);
  const currentHourKey = buildHourKey(nowLocal);

  const times = hourly.time;
  const precipitation = hourly.precipitation || [];
  const probability = hourly.precipitation_probability || [];

  let currentIndex = times.findIndex((t) => t === currentHourKey);
  if (currentIndex === -1) {
    currentIndex = times.findIndex((t) => t > currentHourKey);
  }
  if (currentIndex === -1) {
    currentIndex = 0;
  }

  const rainInfo = findRainWindow({
    startIndex: currentIndex,
    times,
    precipitation,
    probability,
    offsetMs,
    timezone
  });

  if (rainInfo.isRainingNow) {
    return {
      summary: "Bawa payung sekarang!",
      detail: rainInfo.detail,
      variant: "rain"
    };
  }

  if (rainInfo.nextRain) {
    return {
      summary: "Disarankan bawa payung hari ini.",
      detail: rainInfo.detail,
      variant: "rain"
    };
  }

  return {
    summary: "Sepertinya aman tanpa payung.",
    detail:
      "Tidak ada hujan signifikan yang diperkirakan dalam beberapa jam ke depan.",
    variant: "clear"
  };
}

function findRainWindow({
  startIndex,
  times,
  precipitation,
  probability,
  offsetMs,
  timezone
}) {
  let isRainingNow = false;
  let nextRain = null;

  for (let i = startIndex; i < times.length; i += 1) {
    const prob = probability[i] ?? null;
    const precip = precipitation[i] ?? 0;
    const willRain = isRainExpected(prob, precip);

    if (!nextRain && willRain) {
      nextRain = {
        index: i,
        timeUtc: parseUtcDate(times[i], offsetMs),
        prob,
        precip,
        timezone
      };
      if (i === startIndex) {
        isRainingNow = true;
        break;
      }
    }

    if (i === startIndex && willRain) {
      isRainingNow = true;
      break;
    }

    if (nextRain) {
      break;
    }
  }

  const detail = buildDetailText({ isRainingNow, nextRain });

  return { isRainingNow, nextRain, detail };
}

function isRainExpected(probability, precipitation) {
  if (probability != null && probability >= PROBABILITY_THRESHOLD) {
    return true;
  }
  return precipitation >= PRECIP_THRESHOLD;
}

function buildDetailText({ isRainingNow, nextRain }) {
  if (isRainingNow && nextRain) {
    return formatRainDetail(nextRain, "Sedang diperkirakan hujan sekarang.");
  }

  if (nextRain) {
    return formatRainDetail(
      nextRain,
      "Hujan diperkirakan datang sekitar"
    );
  }

  return "Pantau cuaca secara berkala untuk perubahan mendadak.";
}

function formatRainDetail(rainEvent, prefix) {
  const timeLabel = new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: rainEvent.timezone
  }).format(rainEvent.timeUtc);

  const probText =
    rainEvent.prob != null ? `Probabilitas ${rainEvent.prob}%` : null;
  const intensityText = `Intensitas sekitar ${rainEvent.precip.toFixed(1)} mm/jam`;

  return [
    `${prefix} ${timeLabel}.`,
    [probText, intensityText].filter(Boolean).join(" · ")
  ]
    .filter(Boolean)
    .join(" ");
}

function buildHourKey(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:00`;
}

function parseUtcDate(timeString, offsetMs) {
  const utcMs = Date.parse(`${timeString}Z`) - offsetMs;
  return new Date(utcMs);
}

