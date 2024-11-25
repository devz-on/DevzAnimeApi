import CryptoJS from 'crypto-js';

// Key and IV used for encryption/decryption
const keys = {
    key: CryptoJS.enc.Utf8.parse('37911490979715163134003223491201'),
    second_key: CryptoJS.enc.Utf8.parse('54674138327930866480207815084989'),
    iv: CryptoJS.enc.Utf8.parse('3134003223491201'),
};

/**
 * Parses the embedded video URL to encrypt-ajax.php parameters
 * @param {cheerio} $ Cheerio object of the embedded video page
 * @param {string} id Id of the embedded video URL
 */
async function generateEncryptAjaxParameters($, id) {
    // Encrypt the key with AES
    const encrypted_key = CryptoJS.AES.encrypt(id, keys.key, {
        iv: keys.iv,
    });

    // Decrypt the token from the script
    const script = $("script[data-name='episode']").data().value;
    const token = CryptoJS.AES.decrypt(script, keys.key, {
        iv: keys.iv,
    }).toString(CryptoJS.enc.Utf8);

    // Return the generated parameters for AJAX request
    return 'id=' + encrypted_key + '&alias=' + id + '&' + token;
}

/**
 * Decrypts the encrypted-ajax.php response
 * @param {object} obj Response from the server
 */
function decryptEncryptAjaxResponse(obj) {
    const decrypted = CryptoJS.enc.Utf8.stringify(
        CryptoJS.AES.decrypt(obj.data, keys.second_key, {
            iv: keys.iv,
        })
    );
    return JSON.parse(decrypted);
}

/**
 * Function to extract the m3u8 streamable link from the iframe URL
 * @param {string} iframe_url The iframe source URL where the m3u8 link is embedded
 * @returns {Object} Contains the streamable m3u8 links and backup links
 */
async function getM3U8(iframe_url) {
    let sources = [];
    let sources_bk = [];
    let serverUrl = new URL(iframe_url);
    
    // Fetch the content of the iframe page
    const goGoServerPage = await fetch(serverUrl.href, {
        headers: { "User-Agent": "Mozilla/5.0" },
    });
    const $$ = cheerio.load(await goGoServerPage.text());

    // Generate the parameters required for the encrypted AJAX request
    const params = await generateEncryptAjaxParameters($$, serverUrl.searchParams.get("id"));

    // Make the encrypted AJAX request to get m3u8 links
    const fetchRes = await fetch(
        `${serverUrl.protocol}//${serverUrl.hostname}/encrypt-ajax.php?${params}`,
        {
            headers: {
                "User-Agent": "Mozilla/5.0",
                "X-Requested-With": "XMLHttpRequest",
            },
        }
    );

    // Decrypt the AJAX response to get the m3u8 sources
    const res = decryptEncryptAjaxResponse(await fetchRes.json());
    
    // Extract m3u8 sources and backup sources from the response
    res.source.forEach((source) => sources.push(source));
    res.source_bk.forEach((source) => sources_bk.push(source));

    // Return the streamable sources
    return {
        Referer: serverUrl.href,
        sources: sources,
        sources_bk: sources_bk,
    };
}

/**
 * Function to change the domain for download links if required
 * @param {string} originalLink The original download link
 * @returns {string} The updated download link
 */
function changeDownloadDomain(originalLink) {
    const oldDomain = "https://gredirect.info/";
    const newDomain = "https://ggredi.info/";

    // If the download link uses the old domain, update it to the new domain
    if (originalLink.startsWith(oldDomain)) {
        return originalLink.replace(oldDomain, newDomain);
    }
    return originalLink;
}

// Final export block to export all functions
export {
    generateEncryptAjaxParameters,
    decryptEncryptAjaxResponse,
    changeDownloadDomain,
    getM3U8,
};
