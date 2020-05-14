const axios = require("axios");
const crypto = require('crypto')
const cheerio = require("cheerio");
const fileDownload = require('js-file-download');

const util = require("util");

const databaseInterface = require("../db/db_interface");
const IMAGE_STORE_PATH = "../../store/";

const PAGINATION_VAPE_SHOPS = {
    "damphuen-ecig": {
        //"base_url": "https://www.damphuen.dk/e-cigaret?limit=all",  // we can get all the products in a single page
        "base_url": "https://www.damphuen.dk/e-cigaret",
        "init_append": "?p=1",
        "page_element": ".pages > ol > li",
        "page_element_exclude": [
            "current",
            "next"
        ],
        "cat_list_element": ".category-products > .listProduct",
        "cat_link_element": ".listProductContent > .listProductName > a",
        "prod_name_element": ".product-name > *[itemprop='name']",
        "prod_sik_element": ".product-name > .viewProductSikCon",
        "prod_price_element": ".price.salePrice",
        "prod_img_element": ".product-image > a > img"
    }
    // TODO: Tanks fra damphuen
};

function excludeElement(listOfElements, element, cheerio) {
    const $ = cheerio;
    var retVal = false;
    // TODO: Change to "some"/"every" - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/forEach#Description
    listOfElements.forEach(exclude => {
        // some sites store it in the "li" element, others in the "a" element
        if ($(element).hasClass(exclude)) {
            retVal = true;
        } else if($(element).find("a").hasClass(exclude)) {
            retVal = true;
        }
    })
    return retVal;
}

async function paginationScrape(processCallback) {
    const activeSite = "damphuen-ecig";
    const siteData = PAGINATION_VAPE_SHOPS[activeSite];
    
    /* (1) Initial Scrape - Determine catalog pages */
    const initResponse = await axios.get(siteData["base_url"]);
    const initHtml = initResponse.data;
    const $ = cheerio.load(initHtml);

    // store the links in a set, incase we get duplicates
    let catPageLinks = new Set();
    // add the initial page to the set as well
    catPageLinks.add(siteData["base_url"] + siteData["init_append"]);

    const catPageElems = $(siteData["page_element"]);
    catPageElems.each((i, catElem) => {
        const pageLink = $(catElem).find("a");
        if(excludeElement(siteData["page_element_exclude"], catElem, $)) {
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

    
    /* (2) From each category page, we must now extract a product link  */
    catPageLinks = Array.from(catPageLinks).map( (catPage) => axios.get(catPage));
    let productLinks = [];
    try {
        let catalogResponses = await axios.all(catPageLinks);
        console.log(`${productLinks.length}`);
        catalogResponses.forEach( catResp => {
            const $$ = cheerio.load(catResp.data);
            const productElems = $$(siteData["cat_list_element"]);
            productElems.each((i, productElem) => {
                const productLink = $$(productElem).find(siteData["cat_link_element"]).attr("href");
                productLinks.push(productLink);
            });
        });

    } catch (error) {
        console.error("error during catalog page scrape");
    }
    
    /* (3) Using the product link, we now extract the Product Name, SIK ID, Price and Image from each page  */
    // RegEx for SIK ID: /\d{5}-\d{2}-\d{5}/g
    // If regex matches more than one group, then discard the result
    // TODO: Images: https://stackoverflow.com/questions/41938718/how-to-download-files-using-axios

    let products = []
    let sikRe = /\d{5}-\d{2}-\d{5}/g
    productLinks = productLinks.map( prodLink => axios.get(prodLink));
    try {
        let productResults = await axios.all(productLinks);
        productResults.forEach( prodRes => {
            const $$ = cheerio.load(prodRes.data);
            let productPrice =  $$(siteData["prod_price_element"]);
            if(productPrice.length > 0) {
                let productName = $$(siteData["prod_name_element"]).text().trim();
                let productSik = $$(siteData["prod_sik_element"]).text().trim();
                productSik = sikRe.exec(productSik);
                // Ignore if more than one SIK on a page
                if(productSik && productSik.length != 1){
                    productSik = "";
                }
                let productImageElem = $$(siteData["prod_img_element"]);
                
                // create helper function
                // https://futurestud.io/tutorials/download-files-images-with-axios-in-node-js
                // https://stackoverflow.com/questions/55374755/node-js-axios-download-file-and-writefile
                // const productImageHash = getImageHash(url);
                let productImageHash = "none";
                if (productImageElem && productImageElem.length == 1) {
                    let productImageUrl = productImageElem.attr("src");
                    const hashFunction = crypto.createHash('sha256')
                    productImageHash = hashFunction.update(productImageUrl);
                }

                products.push(
                    {
                        name: productName,
                        price: productPrice,
                        sik: productSik,
                        link: prodRes.config.url,
                        imageFile: productImageHash,
                        vendor: activeSite
                    }
                )
            }
        })
        console.log(`we have ${productResults.length} results`);
    } catch (error) {
        console.error("error during product page scrape: " + error)
    }
    
    console.log("...it!")
};

function processProducts(products) {
    console.log(`Mined ${products.length} products in total.`);
    console.log(`\tFirst: "${products[0]["name"]}"`);
    console.log(`\tLast: "${products[products.length-1]["name"]}"`);

    databaseInterface
        .open()
        .then((client_db) => {
            products.forEach( item => {
                item.vendor = vendor; 
                databaseInterface.add(item);
            })
            setTimeout( () => {
                console.log("[Scraper] Closing DB connection.")
                client_db.close();
            }, 5000);
        })
        .catch( e => {
            console.error(e);
        });

    console.log("[Scraper] Stored products in DB.")
}

paginationScrape(processProducts);      // parse pagination and extract products from these [damphuen, justvape, damperen, smoke-it(using 200 products pr page in url), eclshop (similar to prev), pandacig]
// singlePageScrape(processProducts);   // variation of paginationScrape() (or vice-versa) [dansk damp, pink-mule, esug]


// jsonScrape(processProducts);         // parse information directly from JSON [1-life]


// scrollScrape(processProducts);       // items are loaded when scrolling down [dampexperten] 
// interactiveScrape(processProducts);  // i.e. click a button to load more [din-ecigaret]
// activePagination(processProducts);   // items are dynamically loaded, and follow pagination afterwards [numeddamp]


/* SIK Oversigt:
    DampHuset: https://www.damphuen.dk/smok-rha85-tfv8-baby-beast-kit [multiple]
    Damperen: https://www.justvape.dk/produkt/geekvape-aegis-x-200w-tc-mod/
*/