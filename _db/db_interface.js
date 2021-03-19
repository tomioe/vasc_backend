const stringSimilarity = require("string-similarity");
const MongoClient = require("mongodb").MongoClient;
const ObjectId = require("mongodb").ObjectID;

const util = require("util")

const sikRegister = require("../_sik-register/sik-register")


let CONNECTION_URL,
    DATABASE_NAME,
    COLLECTION_CLICK,
    COLLECTION_PRODUCT,
    COLLECTION_MATCHING_QUEUE,
    COLLECTION_MATCHING_LINK,
    COLLECTION_METADATA 

if(process.env.MONGODB_URI) {
    CONNECTION_URL = process.env.MONGODB_URI;
    DATABASE_NAME = "vape_scrape";
    COLLECTION_CLICK = "clicks";
    COLLECTION_PRODUCT = "products";
    COLLECTION_MATCHING_QUEUE = "matching_queue";
    COLLECTION_MATCHING_LINK = "matching_link";
    COLLECTION_METADATA = "meta_data"
} else {
    CONNECTION_URL = "mongodb://127.0.0.1:27017/";
    DATABASE_NAME = "vape_scrape_dummy";
    COLLECTION_CLICK = "dummy_clicks";
    COLLECTION_PRODUCT = "dummy_products";
    COLLECTION_MATCHING_QUEUE = "dummy_matching_queue";
    COLLECTION_MATCHING_LINK = "dummy_matching_link";
    COLLECTION_METADATA = "dummy_meta_data"
}

const _NAME_MATCH_THRESHOLD = 0.90;     // % certainty before matching a name with another
const _NAME_SIMILAR_MATCHES = 6;        // Number of matches to compare with

let database, 
    productCollection,
    clickCollection,
    matchingQueueCollection,
    matchingLinkCollection,
    metaCollection;


// helper function to insert a new product in the DB
async function insertNewProduct(productObject) {
    const productPriceObject = {
        "vendor": productObject["vendor"],
        "price": productObject["price"],
        "link": productObject["link"]
    }
    const newProductObject = {
        name: productObject["name"],
        prices: [
            productPriceObject
        ],
        imageName: productObject["imageName"]
    };
    if (productObject["sik"]) {
        newProductObject["sik"] = productObject["sik"];
    }
    await productCollection.insertOne(newProductObject, (err, res) => {
        if (err) {
            throw (err);
        }
    })
    return productObject;
}


// Matching Queue Helper functions
function insertMatchingQueueObject(matchingObject) {
    matchingQueueCollection.insertOne(matchingObject, (err, res) => {
        if (err && err.code != 11000) { // ignore for error code 11000, since this is a "duplicate key" error
            throw (err);
        }
    })
}
function insertMatchingLinkObject(linkObject) {
    matchingLinkCollection.insertOne(linkObject, (err, res) => {
        if (err && err.code != 11000) { // ignore for error code 11000, since this is a "duplicate key" error
            throw (err);
        }
    })
}

async function findLinkEntry(scrapedName) {
    return await matchingLinkCollection.findOne({ "scrapedName": scrapedName });
}

// Helper function to update the "prices" object
// Done by finding the index of the old price and updating it with the new
const updatePrices = (productPrices, newPricesObject) => {
    // TODO: What if the "old" prices is less than "new"? 

    let updatedPrices = productPrices;

    // Find the index in price array matching the current product"s vendor
    let updateIndex = productPrices.findIndex(priceEntry => {
        return priceEntry["vendor"] === newPricesObject["vendor"];
    })

    if (updateIndex === -1) {
        // Product is present in DB, but lacks the new vendor 
        updatedPrices.push(newPricesObject);
    } else {
        // Product is present in DB, update the specific vendor"s previous price
        updatedPrices[updateIndex] = newPricesObject;
    }
    return updatedPrices;
}

module.exports = {
    open: () => {
        return new Promise((resolve, reject) => {
            MongoClient.connect(CONNECTION_URL, { useNewUrlParser: true, useUnifiedTopology: true }, (error, client) => {
                if (error) {
                    console.error(error);
                    reject(error);
                }
                database = client.db(DATABASE_NAME);

                matchingQueueCollection = database.collection(COLLECTION_MATCHING_QUEUE);
                matchingLinkCollection = database.collection(COLLECTION_MATCHING_LINK);
                productCollection = database.collection(COLLECTION_PRODUCT);
                clickCollection = database.collection(COLLECTION_CLICK);

                metaCollection = database.collection(COLLECTION_METADATA);

                // set the matching queue and link to only accept unique entries 
                matchingQueueCollection.createIndex({ "productName": 1 }, { unique: true });
                matchingLinkCollection.createIndex({ "scrapedName": 1 }, { unique: true });
                console.log("[DB Interface] Connected to `" + DATABASE_NAME + "`!");
                resolve(client);
            });
        })
    },
    search: (query, searchByName) => {
        return new Promise((resolve, reject) => {
            let findQuery = searchByName ? { "name": { $regex: new RegExp(query, "i") } } : ObjectId(query)

            productCollection
                .find(
                    findQuery
                )
                .limit(20)
                .toArray(function (err, result) {
                    if (err) reject(err);
                    //console.log(result.length)
                    resolve(result);
                });
        })
    },
    add: productObject => {
        /*
            A product is added and:   
        
            Scenario 1.
                * It has SIK scraped
                * Case 1: It has a single SIK
                    * An item in the DB has the same SIK
                    => Update the price (either add new price or update vendor"s old price)
                * Case 2: It has several SIK's
                    * TODO: Figure this out
            
            Scenario 2. 
                * It has SIK scraped
                * No item in DB with same SIK
                => Add new product

            Scenario 3.
                * No SIK has been scraped
                * First check if we have a link-entry. if so, we have a SIK (...but what then?)
                * Look up in DB, find _NAME_MATCH_THRESHOLD matches
                * Look up in the SIK-Register, find _NAME_MATCH_THRESHOLD matches 
                * Add "match-entry" 
        */

        return new Promise((resolve, reject) => {
            console.log(`[DB Interface] "Add" called, searching for matches...`);
            const productSIK = productObject["sik"];
            const productPriceObject = {
                vendor: productObject["vendor"],
                price: productObject["price"],
                link: productObject["link"]
            };
            if (productSIK && productSIK.length > 0) {
                //console.log("[DB] we have a SIK")
                productCollection
                    .find(
                        { "sik": productSIK }
                    )
                    .toArray((err, matchingSIKProduct) => {
                        if (err) throw err;
                        if (matchingSIKProduct.length == 1) {
                            console.log("[DB Interface] Scenario 1, We found an item in the database")
                            let databaseUpdate = {};
                            let foundProduct = matchingSIKProduct[0];

                            // Use a helper function to determine the new "prices" object
                            let oldPrices = foundProduct["prices"];
                            databaseUpdate["prices"] = updatePrices(oldPrices, productPriceObject);

                            // if matching product does not have an image, and new one does, then update with new
                            // TODO: Move to helper function 
                            if (foundProduct["imageName"] === "none" && productObject["imageName"] != "none") {
                                databaseUpdate["imageName"] = productObject["imageName"];
                            }

                            // If there"s a SIK match, we should use the SIK Register's name for the object 
                            // if(sikTable.hasOwnProperty(productSIK)) {
                            //     databaseUpdate["name"] = sikTable[productSIK];
                            // }
                            productCollection.updateOne(
                                { sik: productSIK },
                                {
                                    $set: databaseUpdate,
                                    $currentDate: { lastModified: true }
                                },
                                (err, res) => {
                                    if (err) {
                                        console.error(err);
                                        reject(err);
                                    }
                                    console.log(`[DB Interface] Product price updated for "${matchingSIKProduct[0]["name"]}" (sik=${productSIK})`)
                                    resolve(res);
                                }
                            );

                        } else {
                            console.log("[DB Interface] Scenario 2, No items with SIK in the database")
                            let updatedObject = insertNewProduct(productObject);
                            console.log(`[DB Interface] Added new product "${productObject["name"]}" (sik=${productSIK})`)
                            resolve(updatedObject);
                        }
                    });
            } else {
                console.log("[DB Interface] No SIK, follow scenario 3")
                let linkEntry = {
                    "scrapedName": productObject["name"]
                };
                let queueEntry = {
                    "productName": productObject["name"],
                    "productLink": productObject["link"]
                };
                // TODO: Clean this up, by adding support for await!
                // await is needed because we need to do "const linkObj = await matchingLinkCollection.findOne({"
                // otherwise we end up in callback hell (see below!)
                // See: https://stackoverflow.com/a/20239667
                matchingLinkCollection.findOne({ "scrapedName": productObject["name"] }, (err, dbLinkEntry) => {
                    if (err) reject(err);
                    // if(dbLinkEntry["scrapedName"] && dbLinkEntry["scrapedName"] === productObject["name"]) {
                    //     console.log("we have a link entry!...")
                    //     // todo: figure out what to do with this!!!
                    //     // ... probably we'll just format a product object and insert that...?
                    //     // but: usually, a link will be made from "frontend" as an add on the link-entry SIK
                    //     //   - but here, we need to call "add", and calling "add" from within "add"...? 
                    //     resolve();
                    // } else {
                        productCollection
                        .find(
                            {},
                            { projection: { _id: 0 } }
                        )
                        .toArray(function (err, allCurrentProducts) {
                            if (err) reject(err);
                            if (allCurrentProducts.length > 0) {
                                // **** NEW METHOD ****
                                /*
                                    Step 1.1. Check if there's a "link-entry" in comparison-db.
                                    Step 1.2.   If yes: great, we got sik!
                                    Step 1.3:   But if not:
    
                                    -> Extracted allCurrentProducts in DB
                                    Step 1. Compre current "add" object to all products, find top 6 matches
                                    Step 2.1.   If there's 100% match in name, we got a sik! Make a "link-entry"
                                    Step 1.2.   If not, add this to queue-entry in comparison-db
                                    Step 2. Compre current "add" object to SIK register look-up
                                    Step 2.1    If we get a 100% match, we got a sik! Make a "link-entry"
                                    Step 2.2    If not, add this to queue-entry in comparison-db
                                    Step 3. Wait for user to make manual link
                                */
                                const currentProductNames = allCurrentProducts.map(product => product.name);
                                // first prepare a map that links { productName: productSIK }
                                const currentProductToSik = {};
                                allCurrentProducts.forEach((dbItem) => {
                                    const keyProductName = dbItem["name"]
                                    currentProductToSik[keyProductName] = dbItem["sik"]
                                });
                                // find the similarities to extracted product compared to DB entries
                                const similarProductNames = stringSimilarity.findBestMatch(productObject.name, currentProductNames);
                                // format the list, so that we get the highest rating at the start of array
                                let similarProductNameList = sikRegister.formatSimilarityObject(similarProductNames, currentProductToSik);
                                similarProductNamesList = similarProductNameList.slice(0, _NAME_SIMILAR_MATCHES + 4)
                                // lookup in the SIK register if there's a match
                                let sikRegisterMatches = sikRegister.findMatches(productObject["name"], _NAME_SIMILAR_MATCHES);
                                // check if we get a 100% match on DB lookup
                                if (similarProductNameList[0].rating === 1) {
                                    console.log('[DB Interface] DB full match for "'+productObject["name"]+'"!!!');
                                    //console.log(similarProductNameList[0])
                                    linkEntry["matchSource"] = "db";
                                } else {
                                    //console.log('db matches for "'+productObject["name"]+'", to be queued: ')
                                    // similarProductNameList.forEach(entry => console.log(entry))
                                    queueEntry["dbMatches"] = similarProductNamesList;
                                }
                                // check if we get a 100% match on SIK register lookup
                                if (sikRegisterMatches[0].rating === 1) {
                                    console.log('[DB Interface] Register full match for "'+productObject["name"]+'"!!!');
                                    linkEntry["matchSource"] = "register";
                                } else {
                                    // console.log('sik register matches for "' + productObject["name"] + '", to be queued: ')
                                    // sikRegisterMatches.forEach(entry => console.log(entry))
                                    queueEntry["registerMatches"] = sikRegisterMatches;
                                }
                                if (linkEntry["matchSource"]) {
                                    linkEntry["matchedName"] = linkEntry["matchSource"] === "db" ? similarProductNamesList[0]["productName"] : sikRegisterMatches[0]["productName"];
                                    linkEntry["matchedDate"] = new Date();
                                    if (linkEntry["matchSource"] === "register") {
                                        linkEntry["matchedSik"] = sikRegisterMatches[0]["sikID"];
                                    } else if (similarProductNamesList[0]["sikID"]) {
                                        linkEntry["matchedSik"] = similarProductNamesList[0]["sikID"];
                                    }
                                    console.log(`[DB Interface] Inserting link-entry.`);
                                    insertMatchingLinkObject(linkEntry);
                                } else if (queueEntry["dbMatches"] || queueEntry["registerMatches"]) {
                                    // this collection has a unique ID, so no need to worry about queueing up same obj
                                    console.log(`[DB Interface] Inserting queue-entry for ${queueEntry["productName"]}.`);
                                    insertMatchingQueueObject(queueEntry);
                                } else {
                                    // We got no matches in DB or in SIK, and also no source... WTF!
                                    // This should never happen ...
                                    throw ("[DB Interface] WTF Scenario 3 panic!")
                                }
                            } else {
                                // TODO: We've no items in database, but also no sik on scarped item.
                                // We should just add this to matching queue
                                insertMatchingQueueObject(queueEntry);
                            }
                            resolve();
                        });
                    // }
                })
                return;
            }
        })
    },
    click: (clickObject) => {
        return new Promise((resolve, reject) => {
            const currentIpAddress = clickObject.ipAddress;
            let newSitesEntry = {
                "site": clickObject["site"],
                "date": clickObject["date"],
                "deviceData": clickObject["deviceData"]
            }
            if (clickObject.geoLocationData) {
                newSitesEntry["geoLocationData"] = clickObject["geoLocationData"];
            }
            let x = clickCollection
                .updateOne(
                    { "ipAddress": currentIpAddress },
                    { $push: { sitesClicked: newSitesEntry } },
                    { upsert: true },
                    function (err, doc) {
                        if(err) {
                            console.log(`[DB Interface] Error while inserting 'click' entry`);
                            reject(err);
                        }
                        resolve(doc);
                    }
                )
            resolve(x);
        })
    },
    addMeta: metaObject => {
        return new Promise( (resolve, reject) => {
            metaCollection.insertOne( {metaObject} , (err, res) => {
                if (err) {
                    throw (err);
                }
                resolve(res);
            })
        })
    },
    statsUsers: () => {
        return new Promise((resolve, reject) => {
            let returnStats = {};

            let browserDistribution = {};
            let countryDistribution = [];
            let allSiteClicks = [];
            let totalClicks = {};
            let uniqueIPs = 0;
            clickCollection
                .find({})
                .toArray((err, allClicksIP) => {
                    if (err) reject(err);
                    if (allClicksIP.length > 0) {
                        allClicksIP.map((clickEntry) => {
                            clickEntry["sitesClicked"].map((siteClickEntry) => {
                                allSiteClicks.push(siteClickEntry)
                            })
                            uniqueIPs++;
                        });
                        allSiteClicks.map((siteClickEntry) => {
                            const siteUrl = siteClickEntry["site"];
                            if (totalClicks[siteUrl]) {
                                totalClicks[siteUrl] += 1;
                            } else {
                                totalClicks[siteUrl] = 1;
                            }
                            const userBrowser = siteClickEntry["deviceData"]["userAgent"] || siteClickEntry["deviceData"]["ua"];
                            if (browserDistribution[userBrowser]) {
                                browserDistribution[userBrowser] += 1;
                            } else {
                                browserDistribution[userBrowser] = 1;
                            }
                            if (siteClickEntry["geoLocationData"]) {
                                const userGeoLocData = siteClickEntry["geoLocationData"]["country"];
                                countryDistribution.push(userGeoLocData);
                            }
                            returnStats["uniqueIPs"] = uniqueIPs;
                            returnStats["totalClicks"] = allSiteClicks.length;
                            returnStats["allClicks"] = totalClicks;
                            returnStats["browserDistribution"] = browserDistribution;
                            returnStats["countryDistribution"] = countryDistribution;
                            resolve(returnStats);
                        })
                    }
                });
        });
    },
    statsProducts: () => {
        return new Promise((resolve, reject) => {
            let returnStats = {};
            let lastScrapeDate = 0;
            productCollection.count({}, (err, cnt) => {
                if (err || !cnt)
                    reject(err);
                returnStats["productCount"] = cnt;
                returnStats["lastScrapeDate"] = lastScrapeDate;
                resolve(returnStats);
            });
        });
    },
    statsMeta: () => {
        return new Promise((resolve, reject) => {
            // https://www.tutorialspoint.com/mongodb-query-to-find-last-object-in-collection
            // 
        });
    }
};