const axios = require("axios");
const cheerio = require("cheerio");
const util = require("util");

const db_handler = require('../db/db_handler')

const PAGINATION_VAPE_SHOPS = {
    "damphuen-ecig": {
        "base_url": "https://www.damphuen.dk/e-cigaret",
        "init_append": "?p=1",
        "cat_element": ".pages > ol > li",
        "cat_element_exclude": [
            "current",
            "next"
        ],
        "prod_list_element": ".category-products > .listProduct",
        "prod_name_element": ".listProductContent > .listProductName",
        "prod_price_element": ".listProductContent > .listProductPrice",
        "prod_link_element": ".listProductContent > .listProductName > a"
    }
};

function excludeElement(listOfElements, element, cheerio) {
    const $ = cheerio;
    var retVal = false;
    // TODO: Change to 'some'/'every' - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/forEach#Description
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
    const initResponse = await axios(siteData["base_url"]);
    const initHtml = initResponse.data;
    const $ = cheerio.load(initHtml);

    // store the links in a set, incase we get duplicates
    const catPageLinks = new Set();
    // add the initial page to the set as well
    catPageLinks.add(siteData["base_url"] + siteData["init_append"]);

    const catPageElems = $(siteData["cat_element"]);
    catPageElems.each((i, catElem) => {
        const pageLink = $(catElem).find("a");
        if(excludeElement(siteData["cat_element_exclude"], catElem, $)) {
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

    let products = [];
    var catPagesProcessed = 0;
    /* (2) Product Scrape - Mine product data */
    catPageLinks.forEach(catPageLink => {
        axios(catPageLink)
            .then(catResponse => {
                const catHtml = catResponse.data;
                const $$ = cheerio.load(catHtml);
                
                const productElems = $$(siteData["prod_list_element"]);
                productElems.each((i, productElem) => {
                    const productName = $$(productElem).find(siteData["prod_name_element"]).text().trim();
                    const productPrice = $$(productElem).find(siteData["prod_price_element"]).text().trim();
                    const productLink = $$(productElem).find(siteData["prod_link_element"]).attr("href");
                    products.push( {name: productName, price: productPrice, link: productLink} )
                });
                if(catPagesProcessed++ == catPageLinks.size-1) {
                    /* (3) Storage / Return */
                    processCallback(activeSite, products);
                }
            })
            .catch(console.error);
    });  
};

function processProducts(vendor, products) {
    console.log(`Mined ${products.length} products in total.`);
    console.log(`\tFirst: "${products[0]["name"]}"`);
    console.log(`\tLast: "${products[products.length-1]["name"]}"`);
    
    /*
    rework to structure:
        {
            ..,
            prices: [
                {vendor: 'asdf', price: '1234', link: 'http'}
            ]
        }
    */
    products.forEach( item => {
        //item.vendor = vendor;
        //db_handler.add(item);
    })

    console.log("stored in db")
}

paginationScrape(processProducts);      // parse pagination and extract products from these [damphuen, justvape, damperen, smoke-it(using 200 products pr page in url), eclshop (similar to prev), pandacig]
// singlePageScrape(processProducts);   // variation of paginationScrape() (or vice-versa) [dansk damp, pink-mule, esug]


// jsonScrape(processProducts);         // parse information directly from JSON [1-life]


// scrollScrape(processProducts);       // items are loaded when scrolling down [dampexperten] 
// interactiveScrape(processProducts);  // i.e. click a button to load more [din-ecigaret]
// activePagination(processProducts);   // items are dynamically loaded, and follow pagination afterwards [numeddamp]
