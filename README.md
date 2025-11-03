# Perlu Bawa Payung?

Website simple buat cek apakah perlu bawa payung berdasarkan cuaca di lokasi kamu.

## Fitur

- Cek cuaca berdasarkan lokasi user (geolocation)
- Prediksi hujan dalam 24 jam ke depan
- Menampilkan waktu perkiraan hujan
- Animasi dan efek visual saat hujan
- Meme sesuai kondisi cuaca

## Tech Stack

- Pure HTML, CSS, JavaScript
- Open-Meteo API (gratis, tanpa API key)
- Nominatim API untuk reverse geocoding

## Deploy ke Vercel

### Via CLI

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Deploy:
```bash
vercel
```

### Via GitHub

1. Push code ke GitHub repository
2. Import project di [Vercel Dashboard](https://vercel.com/dashboard)
3. Connect ke GitHub repository
4. Deploy (tidak perlu build command, Vercel akan otomatis detect static site)

### Via Vercel Dashboard

1. Login ke [Vercel Dashboard](https://vercel.com/dashboard)
2. Klik "Add New Project"
3. Import dari Git repository atau drag & drop folder
4. Deploy!

## Catatan

- Website ini adalah static site, jadi tidak perlu build command
- Pastikan semua file di folder `public/` sudah ada sebelum deploy
- Ganti URL di meta tags (index.html) dengan domain Vercel kamu setelah deploy

