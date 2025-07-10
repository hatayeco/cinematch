import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs/promises'; // Node.js promises tabanlı dosya sistemi modülü
import * as path from 'path'; // Dizin yolları için
import puppeteer from 'puppeteer'; // Tarayıcı otomasyonu için

// TMDB API Anahtarınızı buraya girin!
const TMDB_API_KEY = "b9d3d6608dd737fe6ec082ca465925db"; // Kendi anahtarınızla DEĞİŞTİRİN!
const TMDB_API_BASE_URL = "https://api.themoviedb.org/3";

interface MovieData {
    ad: string;
    yil?: string;
    critics_score?: string;
    critics_consensus?: string | null;
    synopsis?: string | null;
    oyuncular?: string[] | null;
    yonetmenler?: string[] | null;
    tmdb_id?: number | null;
}

/**
 * TMDB API'de bir film adı arar ve ilk sonucun ID'sini döndürür.
 * @param filmAdi Aranacak filmin adı.
 * @param apiKey TMDB API anahtarı.
 * @returns Filmin TMDB ID'si veya null.
 */
async function tmdbFilmAra(filmAdi: string, apiKey: string): Promise<number | null> {
    const searchUrl = `${TMDB_API_BASE_URL}/search/movie`;
    const params = {
        api_key: apiKey,
        query: filmAdi,
        language: "tr-TR"
    };

    try {
        const response = await axios.get(searchUrl, { params });
        // Explicitly type the response data
        const data = response.data as { results?: { id: number }[] };
        if (data && data.results && data.results.length > 0) {
            return data.results[0].id;
        }
        return null;
    } catch (error: any) {
        console.error(`TMDB API isteği sırasında hata oluştu (${filmAdi}): ${error.message}`);
        return null;
    }
}

/**
 * Verilen veriyi belirtilen klasör altına JSON formatında kaydeder.
 * @param data Kaydedilecek veri.
 * @param klasorYolu Kaydedilecek klasör yolu.
 * @param dosyaAdi Dosya adı.
 */
async function veriyiKaydet(data: MovieData[], klasorYolu: string, dosyaAdi: string): Promise<void> {
    const scriptDir = __dirname; // Current directory of the script (dist klasöründe)
    // 'src/features/content/data' path'ine gitmek için:
    // scriptDir -> /path/to/your/project/dist/src
    // path.join(scriptDir, '..', '..', 'src', 'features', 'content', 'data')
    // Veya proje kök dizininden referans alarak:
    const projectRoot = path.resolve(scriptDir, '..', '..'); // dist/src'den projenin köküne git
    const hedefKlasor = path.join(projectRoot, klasorYolu);
    const filePath = path.join(hedefKlasor, dosyaAdi);

    try {
        await fs.mkdir(hedefKlasor, { recursive: true }); // Klasörü oluştur, varsa sorun çıkarma
        await fs.writeFile(filePath, JSON.stringify(data, null, 4), { encoding: 'utf-8' });
        console.log(`\n${data.length} adet benzersiz film verisi başarıyla '${filePath}' dosyasına kaydedildi.`);
    } catch (error: any) {
        console.error(`Veri '${filePath}' dosyasına kaydedilirken hata oluştu: ${error.message}`);
    }
}

/**
 * Rotten Tomatoes'un 'Best Movies of All Time' editoryal rehberinin sayfalandırılmış versiyonunu çeker.
 * Puppeteer kullanarak dinamik içeriği de işler.
 * @param baseUrl Ana URL (örn: "https://editorial.rottentomatoes.com/guide/best-movies-of-all-time/").
 * @param startPage Başlangıç sayfa numarası.
 * @param endPage Bitiş sayfa numarası.
 * @param tmdbApiKey TMDB API anahtarı.
 * @param dosyaAdi Kaydedilecek JSON dosyasının adı.
 */
async function scrapePaginatedEditorialGuide(
    baseUrl: string,
    startPage: number,
    endPage: number,
    tmdbApiKey: string,
    dosyaAdi: string // Bu artık isteğe bağlı değil, doğrudan alınacak
): Promise<void> {
    const filmlerTamListe: MovieData[] = [];
    const uniqueMovieTitlesSet: Set<string> = new Set();

    console.log(`\nEditoryal rehber sayfaları Puppeteer ile çekiliyor: ${baseUrl} [Sayfa ${startPage} - ${endPage}]`);

    let browser: import('puppeteer').Browser | undefined;
    try {
        browser = await puppeteer.launch({
            headless: true, // Tarayıcı UI'sini gösterme
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080'],
            defaultViewport: null // Varsayılan viewport'u kapatarak tam sayfa genişliği kullan
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36');

        for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
            const currentUrl = `${baseUrl}${pageNum}/`;
            console.log(`\nSayfa çekiliyor: ${currentUrl}`);
            await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }); // Sayfa yüklensin
            
            // Film öğelerinin görünmesini bekleyin
            try {
                await page.waitForSelector('div.countdown-item', { timeout: 10000 });
                console.log("Film öğeleri yüklendi.");
            } catch (error) {
                console.warn(`Uyarı: Sayfa ${currentUrl} üzerinde film öğeleri yüklenmedi veya bulunamadı. Bu sayfa atlanıyor.`);
                continue; // Bu sayfayı atla
            }

            // Sayfanın HTML içeriğini al
            const htmlContent = await page.content();
            const $ = cheerio.load(htmlContent); // Cheerio ile HTML'i ayrıştır

            // Film öğelerini seçmek için seçiciler (Python'daki ile aynı olmalı)
            const movieElements = $('div.countdown-item');

            if (movieElements.length === 0) {
                console.warn(`Uyarı: Sayfa "${currentUrl}" üzerinde hiç film öğesi bulunamadı. Seçicileri kontrol edin.`);
                continue;
            }

            console.log(`Sayfada ${movieElements.length} film öğesi bulundu. İşleniyor...`);

            movieElements.each((_, element) => {
                const item = $(element);
                let movieTitle: string | undefined;

                // Film Başlığı
                const titleTag = item.find('.article_movie_title h2 a');
                if (titleTag.length) {
                    movieTitle = titleTag.text().trim();
                }

                if (movieTitle && !uniqueMovieTitlesSet.has(movieTitle)) {
                    uniqueMovieTitlesSet.add(movieTitle);

                    const movieData: MovieData = { ad: movieTitle };

                    // Yıl
                    const yearTag = item.find('.article_movie_title h2 .subtle.start-year');
                    if (yearTag.length) {
                        movieData.yil = yearTag.text().trim().replace('(', '').replace(')', '');
                    }

                    // Eleştirmen Puanı
                    const criticsScoreTag = item.find('.article_movie_title h2 .tMeterScore');
                    if (criticsScoreTag.length) {
                        movieData.critics_score = criticsScoreTag.text().trim();
                    }

                    // Eleştirmen Görüşü
                    const consensusTag = item.find('.info.critics-consensus');
                    if (consensusTag.length) {
                        const consensusText = consensusTag.text().trim();
                        movieData.critics_consensus = consensusText.replace('Critics Consensus:', '').trim();
                    }

                    // Özet
                    const synopsisTag = item.find('.info.synopsis');
                    if (synopsisTag.length) {
                        let synopsisText = '';
                        synopsisTag.contents().each((_, content) => {
                            if (content.type === 'text') {
                                synopsisText += $(content).text().trim() + ' ';
                            }
                        });
                        movieData.synopsis = synopsisText.replace('Synopsis:', '').replace('[More]', '').trim();
                    }

                    // Oyuncular
                    const castTags = item.find('.info.cast a');
                    if (castTags.length) {
                        movieData.oyuncular = castTags.map((_, el) => $(el).text().trim()).get();
                    }

                    // Yönetmenler
                    const directorTags = item.find('.info.director a');
                    if (directorTags.length) {
                        movieData.yonetmenler = directorTags.map((_, el) => $(el).text().trim()).get();
                    }

                    filmlerTamListe.push(movieData);
                    console.log(`  - Film eklendi: ${movieData.ad} (${movieData.yil || 'Yıl Yok'})`);
                } else if (movieTitle) {
                    console.log(`  - Zaten mevcut olan film atlandı: ${movieTitle}`);
                }
            });

            await new Promise(res => setTimeout(res, 1000));
        }

        console.log("\nTMDB ID'leri aranıyor...");
        const finalMoviesWithTmdbIds: MovieData[] = [];
        const totalUniqueMovies = filmlerTamListe.length;

        for (let i = 0; i < filmlerTamListe.length; i++) {
            const movie = filmlerTamListe[i];
            if (movie.ad) {
                const tmdbId = await tmdbFilmAra(movie.ad, tmdbApiKey);
                movie.tmdb_id = tmdbId;
                finalMoviesWithTmdbIds.push(movie);
                process.stdout.write(`\r(${i + 1}/${totalUniqueMovies}) ${movie.ad}: TMDB ID = ${tmdbId !== null ? tmdbId : 'Bulunamadı'} `);
            } else {
                finalMoviesWithTmdbIds.push(movie);
                process.stdout.write(`\r(${i + 1}/${totalUniqueMovies}) Başlığı olmayan film atlandı. `);
            }
            await new Promise(resolve => setTimeout(resolve, 50)); // TMDB API için gecikme
        }
        console.log('\n');

        // Hedef klasör yolu ve dosya adı güncellendi
        const hedefKlasorPath = 'src/features/content/data'; 
        await veriyiKaydet(finalMoviesWithTmdbIds, hedefKlasorPath, dosyaAdi); // dosyaAdi parametresi doğrudan kullanılacak

    } catch (error: any) {
        console.error(`Kazıma sırasında hata oluştu: ${error.message}`);
    } finally {
        if (browser) {
            await browser.close(); // Tarayıcıyı kapat
        }
    }
}

// --- Ana Çalıştırma Bloğu ---
(async () => {
    const BASE_URL = "https://editorial.rottentomatoes.com/guide/best-movies-of-all-time/";
    const START_PAGE = 1;
    const END_PAGE = 2; // Sadece 1. ve 2. sayfalar olduğu için

    // Dosya adı artık doğrudan 'rtn.json'
    const OUTPUT_FILE_NAME = "rtn.json";

    await scrapePaginatedEditorialGuide(BASE_URL, START_PAGE, END_PAGE, TMDB_API_KEY, OUTPUT_FILE_NAME);

    console.log("\nTüm kazıma işlemleri tamamlandı.");
})();