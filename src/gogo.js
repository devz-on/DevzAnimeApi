import { generateEncryptAjaxParameters, decryptEncryptAjaxResponse } from "./gogo_extractor.js";
import * as cheerio from 'cheerio';

const BaseURL = "https://gogoanime3.co";
const USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.71 Safari/537.36";

// Function to perform a search query on GogoAnime
async function getSearch(name, page = 1) {
    const response = await fetch(
        BaseURL + "/search.html?keyword=" + name + "&page=" + page
    );
    let html = await response.text();
    let $ = cheerio.load(html);
    const searchResults = [];

    $("ul.items li").each(function (i, elem) {
        let anime = {};
        $ = cheerio.load($(elem).html());
        anime.title = $("p.name a").text() || null;
        anime.img = $("div.img a img").attr("src") || null;
        anime.link = $("div.img a").attr("href") || null;
        anime.id = anime.link.split("/category/")[1] || null;
        anime.releaseDate = $("p.released").text().trim() || null;
        if (anime.link) anime.link = BaseURL + anime.link;

        searchResults.push(anime);
    });

    return searchResults;
}

// Function to get detailed anime information by ID
async function getAnime(id) {
    let response = await fetch(BaseURL + "/category/" + id);
    let html = await response.text();
    let $ = cheerio.load(html);
    let animeData = {
        name: $("div.anime_info_body_bg h1").text(),
        image: $("div.anime_info_body_bg img").attr("src"),
        id: id,
    };

    $("div.anime_info_body_bg p.type").each(function (i, elem) {
        const $x = cheerio.load($(elem).html());
        let keyName = $x("span")
            .text()
            .toLowerCase()
            .replace(":", "")
            .trim()
            .replace(/ /g, "_");
        if (/released/g.test(keyName))
            animeData[keyName] = $(elem)
                .html()
                .replace(`<span>${$x("span").text()}</span>`, "");
        else animeData[keyName] = $x("a").text().trim() || null;
    });

    animeData.plot_summary = $("div.description").text().trim();

    const animeid = $("input#movie_id").attr("value");
    response = await fetch(
        "https://ajax.gogocdn.net/ajax/load-list-episode?ep_start=0&ep_end=1000000&id=" +
        animeid
    );
    html = await response.text();
    $ = cheerio.load(html);

    let episodes = [];
    for (const element of $("ul#episode_related a")) {
        const name = $(element)
            .find("div")
            .text()
            .trim()
            .split(" ")[1]
            .slice(0, -3);
        const link = $(element).attr("href").trim().slice(1);
        episodes.push([name, link]);
    }
    episodes = episodes.reverse();
    animeData.episodes = episodes;

    return animeData;
}

// Function to get recent anime
async function getRecentAnime(page = 1) {
    const response = await fetch(BaseURL + "/?page=" + page);
    let html = await response.text();
    let $ = cheerio.load(html);
    const recentAnime = [];

    $("ul.items li").each(function (i, elem) {
        $ = cheerio.load($(elem).html());
        const anime = {
            title: $("p.name a").text() || null,
            episode: $("p.episode").text() || null,
            image: $("div.img img").attr("src") || null,
            link: BaseURL + $("div.img a").attr("href") || null,
            id: $("div.img a").attr("href").split("/")[1] || null,
        };
        recentAnime.push(anime);
    });
    return recentAnime;
}

// Function to get popular anime
async function getPopularAnime(page = 1, max = 10) {
    const response = await fetch(BaseURL + "/popular.html?page=" + page.toString());
    let html = await response.text();
    let $ = cheerio.load(html);
    const popularAnime = [];

    $("ul.items li").each(function (i, elem) {
        $ = cheerio.load($(elem).html());
        const anime = {
            title: $("p.name a").text() || null,
            releaseDate:
                $("p.released").text().replace("Released:", "").trim() || null,
            image: $("div.img img").attr("src") || null,
            link: BaseURL + $("div.img a").attr("href") || null,
            id: $("div.img a").attr("href").split("/category/")[1] || null,
        };
        popularAnime.push(anime);
    });
    return popularAnime.slice(0, max);
}

// Function to get anime episode details
async function getEpisode(id) {
    const link = `${BaseURL}/${id}`;

    const response = await fetch(link);
    let html = await response.text();
    let $ = cheerio.load(html);
    const episodeCount = $("ul#episode_page li a.active").attr("ep_end");
    const iframe = $("div.play-video iframe").attr("src");
    const serverList = $("div.anime_muti_link ul li");
    const servers = {};
    serverList.each(function (i, elem) {
        elem = $(elem);
        if (elem.attr("class") != "anime") {
            servers[elem.attr("class")] = elem.find("a").attr("data-video");
        }
    });

    let m3u8;
    try { m3u8 = await getM3U8(iframe); }
    catch (e) { console.log(e); m3u8 = null; }

    const ScrapedAnime = {
        name:
            $("div.anime_video_body h1")
                .text()
                .replace("at gogoanime", "")
                .trim() || null,
        episodes: episodeCount,
        stream: m3u8,
        servers,
    };

    return ScrapedAnime;
}

// Helper function to fetch M3U8 stream URL from iframe
async function getM3U8(iframe_url) {
    let sources = [];
    let sources_bk = [];
    let serverUrl = new URL(iframe_url);
    const goGoServerPage = await fetch(serverUrl.href, {
        headers: { "User-Agent": USER_AGENT },
    });
    const $$ = cheerio.load(await goGoServerPage.text());

    const params = await generateEncryptAjaxParameters(
        $$,
        serverUrl.searchParams.get("id")
    );

    const fetchRes = await fetch(
        `${serverUrl.protocol}//${serverUrl.hostname}/encrypt-ajax.php?${params}`,
        {
            headers: {
                "User-Agent": USER_AGENT,
                "X-Requested-With": "XMLHttpRequest",
            },
        }
    );

    const res = decryptEncryptAjaxResponse(await fetchRes.json());
    res.source.forEach((source) => sources.push(source));
    res.source_bk.forEach((source) => sources_bk.push(source));

    return {
        Referer: serverUrl.href,
        sources: sources,
        sources_bk: sources_bk,
    };
}

// Helper function to change domain of download links
async function GogoDLScrapper(animeid, cookie) {
    try {
        cookie = atob(cookie);
        const response = await fetch(`${BaseURL}/${animeid}`, {
            headers: {
                Cookie: `auth=${cookie}`,
            },
        });
        const html = await response.text();
        const body = cheerio.load(html);
        let data = {};
        const links = body("div.cf-download").find("a");

        // Function to change the domain
        function changeDownloadDomain(originalLink) {
            const oldDomain = "https://gredirect.info/";
            const newDomain = "https://ggredi.info/";

            if (originalLink.startsWith(oldDomain)) {
                return originalLink.replace(oldDomain, newDomain);
            }
            return originalLink;
        }

        links.each((i, link) => {
            const a = body(link);
            let downloadLink = a.attr("href").trim();

            // Change the domain of the download link
            downloadLink = changeDownloadDomain(downloadLink);

            data[a.text().trim()] = downloadLink;
        });

        return data;
    } catch (e) {
        return e;
    }
}

// Helper function to fetch GogoAnime authentication cookie
async function getGogoAuthKey() {
    const response = await fetch(
        "https://api.github.com/repos/TechShreyash/TechShreyash/contents/gogoCookie.txt",
        {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Linux; Android 9; vivo 1916) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Mobile Safari/537.36",
            },
        }
    );
    const data = await response.json();
    const cookie = data["content"].replaceAll("\n", "");
    return cookie;
}

// Exporting functions
export {
    getSearch,
    getAnime,
    getRecentAnime,
    getPopularAnime,
    getEpisode,
    GogoDLScrapper,
    getGogoAuthKey,
};
