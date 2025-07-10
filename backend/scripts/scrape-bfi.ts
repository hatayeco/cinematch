import axios from 'axios';
import * as cheerio from 'cheerio'; // cheerio'yu bu şekilde import ediyoruz
import * as fs from 'fs'; // Dosya işlemleri için
import * as path from 'path'; // Dosya yolları için
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// TMDB API Anahtarınız. Kendi anahtarınızla DEĞİŞTİRİN!
const TMDB_API_KEY: string = "b9d3d6608dd737fe6ec082ca465925db";
const TMDB_API_BASE_URL: string = "https://api.themoviedb.org/3";

interface FilmVerisi {
    ad: string;
    tmdb_id: number | null;
}

/**
 * TMDB API'de bir film adı arar ve ilk sonucun ID'sini döndürür.
 * @param filmAdi Aranacak film adı.
 * @param apiKey TMDB API anahtarı.
 * @returns Filmin TMDB ID'si veya bulunamazsa null.
 */
async function tmdbFilmAra(filmAdi: string, apiKey: string): Promise<number | null> {
    const searchUrl = `${TMDB_API_BASE_URL}/search/movie`;
    const params = {
        api_key: apiKey,
        query: filmAdi,
        language: "tr-TR" // Türkçe sonuçlar tercih edilebilir
    };

    try {
        const response = await axios.get(searchUrl, { params });
        const data = response.data as any;

        if (data.results && data.results.length > 0) {
            return data.results[0].id;
        }
        return null;
    } catch (error: unknown) {
        if ((axios as any).isAxiosError && (axios as any).isAxiosError(error)) {
            console.error(`TMDB API isteği sırasında hata oluştu (${filmAdi}): ${(error as Error).message}`);
        } else {
            console.error(`TMDB API yanıtı işlenirken hata oluştu (${filmAdi}):`, error);
        }
        return null;
    }
}

/**
 * BFI'ın 'Greatest Films of All Time' sayfasından film adlarını çeker,
 * TMDB API'den ID'lerini alır ve JSON formatında kaydeder.
 * @param url BFI sayfasının URL'si.
 * @param tmdbApiKey TMDB API anahtarı.
 * @param dosyaAdi Kaydedilecek JSON dosyasının adı.
 */
async function bfiFilmleriniCekTmdbIdIle(url: string, tmdbApiKey: string, dosyaAdi: string = "bfi_filmleri_tmdb_id_ile.json"): Promise<void> {
    const filmlerTamListe: FilmVerisi[] = [];

    try {
        // BFI sayfasını çek
        const response = await axios.get(url);
        const htmlContent = response.data as string;

        // Cheerio ile HTML içeriğini ayrıştır
        const $ = cheerio.load(htmlContent);

        // Film başlıklarını içeren <h1> etiketlerini buluyoruz.
        // Bu <h1> etiketlerinin bir <a> etiketi içinde olması gerekiyor.
        const baslikElementleri = $('h1');
        
        if (baslikElementleri.length === 0) {
            console.warn("Uyarı: 'h1' etiketleri bulunamadı. Lütfen BFI HTML yapısını tekrar kontrol edin.");
            return;
        }

        const cekilenBfiFilmAdlari: string[] = [];
        baslikElementleri.each((_, element) => {
            const parentA = $(element).parent('a');
            if (parentA.length > 0) {
                cekilenBfiFilmAdlari.push($(element).text().trim());
            }
        });

        if (cekilenBfiFilmAdlari.length === 0) {
            console.log("BFI sayfasından hiç film adı çekilemedi.");
            return;
        }

        console.log(`BFI sayfasından ${cekilenBfiFilmAdlari.length} film adı çekildi. TMDB ID'leri aranıyor...`);

        // Her bir film için TMDB ID'sini ara
        let lastPercent = -1;
        const total = cekilenBfiFilmAdlari.length;
        for (let i = 0; i < total; i++) {
            const filmAdi = cekilenBfiFilmAdlari[i];
            const tmdbId = await tmdbFilmAra(filmAdi, tmdbApiKey);
            
            const filmObjesi: FilmVerisi = {
                ad: filmAdi,
                tmdb_id: tmdbId
            };
            filmlerTamListe.push(filmObjesi);
            console.log(`${i + 1}. ${filmAdi}: TMDB ID = ${tmdbId !== null ? tmdbId : 'Bulunamadı'}`);
            
            // %1'lik adımlarla ilerleme çıktısı
            const percent = Math.floor((i / total) * 100);
            if (percent > lastPercent) {
                lastPercent = percent;
                console.log(`${percent}%`);
            }
            // API'ye aşırı yük bindirmemek için kısa bir gecikme ekleyelim
            await new Promise(resolve => setTimeout(resolve, 100)); // 100 milisaniye
        }
        // Sonunda 100% yazdır
        console.log('100%');

        // Film adlarını ve ID'lerini JSON dosyasına kaydet
        const filePath = path.join(__dirname, '..', dosyaAdi);
        fs.writeFileSync(filePath, JSON.stringify(filmlerTamListe, null, 4), 'utf-8');
        console.log(`\nFilm adları ve TMDB ID'leri başarıyla '${dosyaAdi}' dosyasına kaydedildi.`);

    } catch (error: unknown) {
        if ((axios as any).isAxiosError && (axios as any).isAxiosError(error)) {
            console.error(`BFI sayfası çekilirken axios hatası: ${(error as Error).message}`);
        } else {
            console.error(`BFI sayfası çekilirken hata:`, error);
        }
    }
}

// BFI'ın "Tüm Zamanların En Harika Filmleri" sayfasının URL'si
const bfiUrl: string = "https://www.bfi.org.uk/sight-and-sound/greatest-films-all-time";

// Ana fonksiyonu çalıştır
bfiFilmleriniCekTmdbIdIle(bfiUrl, TMDB_API_KEY, "bfi_filmleri_tmdb_id_ile.json");