import axios from 'axios';
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const TMDB_API_KEY = "b9d3d6608dd737fe6ec082ca465925db";
const TMDB_API_BASE_URL = "https://api.themoviedb.org/3";

async function tmdbFilmAra(filmAdi: string, apiKey: string) {
    const searchUrl = `${TMDB_API_BASE_URL}/search/movie`;
    const params = {
        api_key: apiKey,
        query: filmAdi,
        language: "tr-TR"
    };
    try {
        const response = await axios.get(searchUrl, { params });
        const data = response.data as { results?: any[] };
        if (data.results && data.results.length > 0) {
            return data.results[0].id;
        }
        return null;
    } catch (error: unknown) {
        if (error instanceof Error) {
            console.error(`TMDB API isteği sırasında hata oluştu (${filmAdi}):`, error.message);
        } else {
            console.error(`TMDB API isteği sırasında hata oluştu (${filmAdi}):`, error);
        }
        return null;
    }
}

async function bfiDirectorsFilmsToJson(url: string, tmdbApiKey: string, dosyaAdi = "bfiDirectors.json") {
    const filmlerTamListe = [];
    try {
        const response = await axios.get(url);
        const htmlContent = response.data as string;
        const $ = cheerio.load(htmlContent);

        // Film başlıklarını bulmak için uygun selector (ör: h3, h2, .film-title vs.)
        const filmBasliklari: any[] = [];
        $('h3, h2').each((_: any, el: any) => {
            const text = $(el).text().trim();
            if (text && text.length > 2 && !/\d{4}/.test(text)) {
                filmBasliklari.push(text);
            }
        });
        const uniqueFilms = Array.from(new Set(filmBasliklari));
        if (uniqueFilms.length === 0) {
            console.log("BFI Directors sayfasından hiç film adı çekilemedi.");
            return;
        }
        console.log(`BFI Directors sayfasından ${uniqueFilms.length} film adı çekildi. TMDB ID'leri aranıyor...`);

        let lastPercent = -1;
        const total = uniqueFilms.length;
        for (let i = 0; i < total; i++) {
            const filmAdi = uniqueFilms[i];
            const tmdbId = await tmdbFilmAra(filmAdi, tmdbApiKey);
            filmlerTamListe.push({ ad: filmAdi, tmdb_id: tmdbId });
            console.log(`${i + 1}. ${filmAdi}: TMDB ID = ${tmdbId !== null ? tmdbId : 'Bulunamadı'}`);
            const percent = Math.floor((i / total) * 100);
            if (percent > lastPercent) {
                lastPercent = percent;
                console.log(`${percent}%`);
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        console.log('100%');
        const filePath = path.join(__dirname, '..', dosyaAdi);
        fs.writeFileSync(filePath, JSON.stringify(filmlerTamListe, null, 4), 'utf-8');
        console.log(`\nFilm adları ve TMDB ID'leri başarıyla '${dosyaAdi}' dosyasına kaydedildi.`);
    } catch (error: unknown) {
        if (error instanceof Error) {
            console.error(`BFI Directors sayfası çekilirken hata:`, error.message);
        } else {
            console.error(`BFI Directors sayfası çekilirken hata:`, error);
        }
    }
}

const bfiDirectorsUrl = "https://www.bfi.org.uk/sight-and-sound/directors-100-greatest-films-all-time";
bfiDirectorsFilmsToJson(bfiDirectorsUrl, TMDB_API_KEY, "bfiDirectors.json"); 