const stringSimilarity = require("string-similarity");
const MongoClient = require("mongodb").MongoClient;
const ObjectId = require("mongodb").ObjectID;

const util = require("util")

const sikRegister = require("../_sik-register/sik-register")

const CONNECTION_URL = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/";
const DATABASE_NAME = "vape_scrape";
const PRODUCT_COLLECTION_NAME = "products";
const CLICK_COLLECTION_NAME = "clicks";
//const DATABASE_NAME = "vape_scrape_dummy";
//const COLLECTION_NAME = "dummy_data";
const _NAME_MATCH_THRESHOLD = 0.90;     // % certainty before matching a name with another
const _NAME_SIMILAR_MATCHES = 10;        // Number of matches to compare with

let database, productCollection, clickCollection;


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
            throw(err);
        }
    })
    return productObject;
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
                productCollection = database.collection(PRODUCT_COLLECTION_NAME);
                clickCollection = database.collection(CLICK_COLLECTION_NAME);
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
                * Look up in the SIK-Register, find 6 matches with 80% match on name
                * Add to "match" database
                ( * Old scenario 3:
                * Look up, can we get a 80% match on name?
                * Yes (over 80%): Same as scenario 1    
                * No (under 80%): 
                    * Search the whole DB for 80% match on string name:
                        * Over 80%: Scenario 1
                        * Under 80% Scenario 2 
                * )  
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
                // console.log("[DB] we have a SIK")
                productCollection
                    .find(
                        { "sik": productSIK }
                    )
                    .toArray((err, matchingSIKProduct) => {
                        if (err) throw err;
                        if (matchingSIKProduct.length == 1) {
                            console.log("\tScenario 1, We found an item in the database")
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

                            // If there"s a SIK match, we should use the SIK List"s name for the object 
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
                            console.log("\tScenario 2, No items with SIK in the database")
                            let updatedObject = insertNewProduct(productObject);
                            console.log(`[DB Interface] Added new product "${productObject["name"]}" (sik=${productSIK})`)
                            resolve(updatedObject);
                        }
                    });
            } else {
                // console.log("[DB] No SIK, follow scenario 3")
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
                                Step 1. We"ve extracted allCurrentProducts in DB
                                Step 1.1. Check if there"s a "link-entry" in comparison-db.
                                Step 1.2. If yes: great, we got sik!
                                Step 1.3: But if not:
                                Step 2. Compre current "add" object to all products, find top 6 matches
                                Step 3. Compare this list to SIK register look-up and see if we can get a full match
                                Step 4. If we get a full match (Rating=1), auto-assign the SIK and make an link-entry in comparison-db  
                                Step 5. If no full matches, push the 6 matches from SIK and DB into a queue-entry in comparison-db
                                Step 6. Wait for user to make manual link, converting queue-entry to link-entry
                            */
                            // const currentProductNames = allCurrentProducts.map(product => product.name);
                            // const currentProductToSik = {};
                            // allCurrentProducts.forEach( (dbItem) => {
                            //     const keyProductName = dbItem["name"]
                            //     currentProductToSik[keyProductName] = dbItem["sik"] 
                            // });
                            // const similarProductNames = stringSimilarity(productObject.name, currentProductNames);
                            // let similarProductNameList = sikRegister.formatSimilarityObject(similarProductNames, currentProductToSik);
                            // let sikRegisterMatches = sikRegister.findMatches("SMOK - ", _NAME_SIMILAR_MATCHES)
                            
                            // **** OLD METHOD ****

                            // console.log("\tSearching for name match...");
                            let currentProductNames = currentProducts.map(product => product.name);
                            let similarity = stringSimilarity.findBestMatch(productObject.name, currentProductNames);
                            let matchInDB = false;
                            if (similarity.bestMatch.rating > _NAME_MATCH_THRESHOLD) {
                                matchInDB = true;
                                console.log("[DB Interface] Found name match with DB item '" + currentProducts[similarity.bestMatchIndex]["name"] + "' and '" + productObject["name"] + "', updating price.");
                                let databaseUpdate = {};
                                let foundProduct = currentProducts[similarity.bestMatchIndex];
                                // Use helper function to generate the new "prices" object
                                let newPrices = updatePrices(foundProduct["prices"], productPriceObject);
                                databaseUpdate["prices"] = newPrices;

                                // if matching product does not have an image, and new one does, then update with new
                                // TODO: Move to helper function 
                                if (foundProduct["imageName"] === "none" && productObject["imageName"] != "none") {
                                    databaseUpdate["imageName"] = productObject["imageName"];
                                }
                                // update databases" matched product with the updated price list
                                // TODO: maybe we can do it better?: https://stackoverflow.com/questions/31120111/mongodb-find-and-then-update
                                // TODO: Check if price is the same? Is update then necessary?
                                productCollection.updateOne(
                                    { name: currentProducts[similarity.bestMatchIndex].name },
                                    {
                                        $set: databaseUpdate,
                                        $currentDate: { lastModified: true }
                                    },
                                    (err, res) => {
                                        if (err) {
                                            console.error("[DB Interface] Error during string-match update.")
                                            //console.error(err);
                                            reject(err);
                                        }
                                        resolve(res);
                                    }
                                )
                                console.log(`[DB Interface] Product price updated for "${productObject["name"]}".`);
                                productObject["prices"] = newPrices;
                                resolve(productObject);
                            };
                            if (matchInDB) return;
                        }
                        // TODO: If no match, but SIK number in scraped data then add by SIK
                        // either there"s no match, or we have no items in DB, either way...
                        // console.log("\tNo item or match in DB, adding new product...")
                        let newProudct = insertNewProduct(productObject);
                        resolve(newProudct);
                    });
            }
        })
    },
    click: (clickObject) => {
        return new Promise( (resolve, reject) => {
            const currentIpAddress = clickObject.ipAddress;
            let newSitesEntry = {
                "site": clickObject["site"],
                "date": clickObject["date"],
                "deviceData": clickObject["deviceData"]
            }
            if(clickObject.geoLocationData) {
                newSitesEntry["geoLocationData"] = clickObject["geoLocationData"];
            }
            let x = clickCollection
                .updateOne(
                    {"ipAddress": currentIpAddress},
                    { $push : {sitesClicked: newSitesEntry} },
                    { upsert: true }
                )
            resolve(x)
        })
    },
    statsUsers: () => {
        return new Promise( (resolve, reject) => {
            let returnStats = [];

            let browserDistribution = {};
            let countryDistribution = [];
            let allSiteClicks = [];
            let totalClicks = {};
            let uniqueIPs = 0;
            clickCollection
                    .find({})
                    .toArray( (err, allClicksIP) => {
                        if (err) reject(err);
                        if (allClicksIP.length > 0) {
                            allClicksIP.map( (clickEntry) => {
                                clickEntry["sitesClicked"].map( (siteClickEntry) => {
                                    allSiteClicks.push(siteClickEntry)
                                })
                                uniqueIPs++;
                            });
                            allSiteClicks.forEach( (siteClickEntry) => {
                                const siteUrl = siteClickEntry["site"];
                                if(totalClicks[siteUrl]) {
                                    totalClicks[siteUrl] += 1;
                                } else {
                                    totalClicks[siteUrl] = 1;
                                }
                                const userBrowser = siteClickEntry["deviceData"]["userAgent"];
                                if(browserDistribution[userBrowser]) {
                                    browserDistribution[userBrowser] += 1;
                                } else {
                                    browserDistribution[userBrowser] = 1;
                                }
                                if(siteClickEntry["geoLocationData"]) {
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
        return new Promise( (resolve, reject) => {
            let returnStats = [];
            let productCount = 0;
            let lastScrapeDate = 0;
            
            productCount = productCollection.find({}).count();

            returnStats["productCount"] = productCount;
            returnStats["lastScrapeDate"] = lastScrapeDate;
            resolve(returnStats);
        });
    }
};