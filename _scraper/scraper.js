const fs = require('fs')  
const path = require('path')  
const axios = require("axios");
const crypto = require('crypto')
const cheerio = require("cheerio");
const { TaskQueue } = require('cwait');
const fileExtension = require('file-extension'); 


const util = require("util");

const DB_PATH = "../_db";
const databaseInterface = require(path.join(DB_PATH, "db_interface"))

const IMAGE_STORE_PATH = "../_store";
const MAX_SIMULTANEOUS_DOWNLOADS = 5;
const SIK_REGEXP = /\d{5}-\d{2}-\d{5}/g

/**
 * TODO:
 *      * Implement so that BASE_URL can be an array of pages (allows for different categories)
 *      * 
 */

const PAGINATION_VAPE_SHOPS = {
    "damphuen-ecig": {
        //"base_url": "https://www.damphuen.dk/e-cigaret?limit=all",  // we can get all the products in a single page
        "base_url": "https://www.damphuen.dk/e-cigaret",
        "init_append": "?p=1",
        //"init_append": "",
        "page_element": ".pages > ol > li",
        "page_element_exclude": [
            "current",
            "next"
        ],
        "cat_list_element": ".category-products > .listProduct",
        "cat_link_element": ".listProductContent > .listProductName > a",
        "prod_name_element": ".product-name > *[itemprop='name']",
        "prod_price_element": ".price.salePrice",
        "prod_sik_element": ".product-name > .viewProductSikCon",
        "prod_img_element": ".product-image > a > img",
        "scrape_images": false
    },
    "dindamp-ecig": {
        "base_url": "https://dindamp.dk/da/452-e-cigaretter",
        "init_append": "",
        "page_element": ".pagination > .row > .col-12 > ul > li",
        "page_element_exclude": [
            "next",
            "previous"
        ],
        "cat_list_element": ".product-list > .products > .product-miniature > .product-container",
        "cat_link_element": ".second-block > .product-name > a",
        "prod_name_element": ".product-right-content >  *[itemprop='name']",
        "prod_price_element": ".price.product-price",
        "prod_sik_element": "",
        "prod_img_element": "",
        "scrape_images": false
    }
    // TODO: Implement nemsug
};


// TODO: Figure out which of these scraping methods is the most generic
// singlePageScrape(processProducts);   // variation of paginationScrape() (or vice-versa) [dansk damp, pink-mule, esug]

// jsonScrape(processProducts);         // parse information directly from JSON [1-life]

// scrollScrape(processProducts);       // items are loaded when scrolling down [dampexperten] 
// interactiveScrape(processProducts);  // i.e. click a button to load more [din-ecigaret]
// activePagination(processProducts);   // items are dynamically loaded, and follow pagination afterwards [numeddamp]


/* 
    SIK Oversigt:
        DampHuset: https://www.damphuen.dk/smok-rha85-tfv8-baby-beast-kit [multiple]
        Damperen: https://www.justvape.dk/produkt/geekvape-aegis-x-200w-tc-mod/
*/

paginationScrape("dindamp-ecig");      // parse pagination and extract products from these [damphuen, justvape, damperen, smoke-it(using 200 products pr page in url), eclshop (similar to prev), pandacig]
async function paginationScrape(activeSite) {
    let siteStructure;
    try {
        siteStructure = PAGINATION_VAPE_SHOPS[activeSite];
    } catch (e) {
        console.log(`[Scraper] Site '${activeSite}' not defined, exiting...`);
        return;
    }
    
    console.log("[Scraper] Determining catalog link style")
    /* (1) Initial Scrape - Determine catalog pages */
    const initResponse = await axios.get(siteStructure["base_url"]);
    const initHtml = initResponse.data;
    const $ = cheerio.load(initHtml);

    // store the links in a set, incase we get duplicates
    let catPageLinks = new Set();
    // add the initial page to the set as well
    catPageLinks.add(siteStructure["base_url"] + siteStructure["init_append"]);

    console.log("[Scraper] Extracting catalog page links")
    // extract the category page links
    const catPageElems = $(siteStructure["page_element"]);
    catPageElems.each((i, catElem) => {
        const pageLink = $(catElem).find("a");
        if(excludeElement(siteStructure["page_element_exclude"], catElem, $)) {
            return;
        }
        const pageLinkHref = pageLink.attr("href").trim();
        if (pageLinkHref) {
            const pageNum = $(catElem).text().trim();
            if(pageNum.length > 0) {
                //console.log(pageNum + " - " + pageLinkHref);
                catPageLinks.add(pageLinkHref);
            }
        }
    });
    //TODO: What if page shows pagination as "1, 2, 3 ... 10"?
    
    console.log("[Scraper] Extracting product links from category pages")
    /* (2) From each category page, we must now extract a product link  */
    // first queue up an axios request for each category page
    catPageLinks = Array.from(catPageLinks).map( (catPage) => axios.get(catPage));
    console.log(`[Scraper] Got ${catPageLinks.length} category pages.`);
    let productLinks = new Set();
    try {
        // start all the axios requests for the category pages
        let catalogResponses = await axios.all(catPageLinks);
        catalogResponses.forEach( catResp => {
            const $$ = cheerio.load(catResp.data);
            const productElems = $$(siteStructure["cat_list_element"]);
            // for all the "product" elements on the category page, we now need the link to the product
            productElems.each((i, productElem) => {
                const productLink = $$(productElem).find(siteStructure["cat_link_element"]).attr("href");
                // productLinks.push(productLink);
                productLinks.add(productLink)
            });
        });
    } catch (error) {
        console.error("[Scraper] Error during catalog page scrape: " + error);
    }
    
    productLinks = Array.from(productLinks);
    console.log(`[Scraper] Got ${productLinks.length} product pages.`);

    // TEST:
    //productLinks = productLinks.slice(0,40);

    /* (3) Using the product link, we now extract the Product Name, SIK ID, Price and Image from each page  */
    // RegEx for SIK ID: /\d{5}-\d{2}-\d{5}/g
    
    // rate limit:  https://github.com/axios/axios/issues/1010#issuecomment-326172188
    // or: https://stackoverflow.com/questions/55374755/node-js-axios-download-file-and-writefile
    let products = []
    process.stdout.write("[Scraper] Downloading product pages and mining data")
    try {
        // form a task queue so that we don't DDoS the server, limiting to XXX number of page downloads
        const queue = new TaskQueue(Promise, MAX_SIMULTANEOUS_DOWNLOADS);

        // start the task queue, which executes an axios request on all the product links
        const productResults = await Promise.all(productLinks.map(queue.wrap(async url => await axios.get(url))));
        productResults.forEach( productPageResult => {
            const $$ = cheerio.load(productPageResult.data);
            let productPrice =  $$(siteStructure["prod_price_element"]).text().trim();
            if(productPrice.length > 0) {
                let productName = $$(siteStructure["prod_name_element"]).text().trim();
                let productSik = $$(siteStructure["prod_sik_element"]).text().trim();
                
                if(productSik && productSik.length != 1){
                    try {
                        // TODO: Figure out what to do if there's several matches!
                        productSik = productSik.match(SIK_REGEXP); // will return array of matches
                        if(productSik.length === 1) {
                            productSik = productSik[0];
                        }
                    } catch(err) {
                        console.error("error during SIK regex match.")
                        productSik = "";
                    }
                } else {
                    productSik = "";
                }

                let productImageElem = $$(siteStructure["prod_img_element"]);
                let productImageHash = "none";
                if(siteStructure["scrape_images"]) {
                    if (productImageElem && productImageElem.length == 1) {
                        const productImageUrl = productImageElem.attr("src");
                        productImageHash = storeImage(productImageUrl);
                    }
                }
                
                products.push(
                    {
                        name: productName,
                        price: productPrice,
                        sik: productSik,
                        link: productPageResult.config.url,
                        imageName: productImageHash,
                        vendor: activeSite
                    }
                );
            }
        });
    } catch (error) {
        console.error(`[Scraper] Error during product page scrape: ${error}` );
    }
    console.log(`\n[Scraper] Mined ${products.length} products in total.`);
    if(products[0]) {
        console.log(`\tFirst: "${products[0]["name"]}"`);
        console.log(`\tLast: "${products[products.length-1]["name"]}"`);
    }

    await updateDatabase(products);
    const metaData = {
        "activeSite": activeSite,
        "productsScraped": products.length,
        "scrapeDate": new Date()
    }
    insertMetaData(metaData);

};

async function updateDatabase(products) {
    try {
        let databaseClient = await databaseInterface.open();
        for(const productIndex in products) {
            let x = products[productIndex];
            await databaseInterface.add(x);
        }
        console.log(`[Scraper] Added ${products.length} to the database.`);
        setTimeout( () => {
            console.log("[Scraper] Closing DB connection.")
            databaseClient.close();
        }, 1500);
    } catch (error) {
        console.error(error);
    }
}

async function insertMetaData(metaObject) {
    try {
        const databaseClient = await databaseInterface.open();
        databaseInterface.addMeta(metaObject);
        setTimeout( () => {
            console.log("[Scraper] Closing DB connection.")
            databaseClient.close();
        }, 1500);
    } catch (exception) {

    }
}

function excludeElement(listOfElements, element, cheerio) {
    const $ = cheerio;
    var retVal = false;
    listOfElements.forEach(exclude => {
        // some sites store it in the "li" element, others in the "a" element
        if ($(element).hasClass(exclude)) {
            retVal = true;
        } else if($(element).find("a").hasClass(exclude)) {
            retVal = true;
        }
    });
    return retVal;
}

function storeImage(imageUrl) {
    const ext = fileExtension(imageUrl); // use a library to determine file extension (defaults to blank)
    const hashFunction = crypto.createHash('sha256')
    const hashFileName = hashFunction.update(imageUrl).digest("hex") + "." + ext;
    if(!fs.existsSync(IMAGE_STORE_PATH)) {
        fs.mkdirSync(IMAGE_STORE_PATH);
    }

    const output_path = path.resolve(IMAGE_STORE_PATH, hashFileName);
    // TODO: If that file name already exists, generate a new hash 
    if(!fs.existsSync(output_path)) {
        try {
            const writer = fs.createWriteStream(output_path);
            axios(imageUrl, {
                method: 'GET',
                responseType: 'stream'
            }).then( res => {
                res.data.pipe(writer);
            }).catch( err => {
                console.error("[Scraper] Error during image download: " + err);
            })
        } catch (e) {
            console.log("[Scraper] I/O Error during Product Image Write: " + e)
        }
    }
    return hashFileName;
}



