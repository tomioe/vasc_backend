const stringSimilarity = require('string-similarity');
const MongoClient = require("mongodb").MongoClient;
const ObjectId = require("mongodb").ObjectID;

const util = require('util')

const csvParser = require('../parser/parse_csv')

const CONNECTION_URL = "mongodb://127.0.0.1:27017/";
const DATABASE_NAME = "vape_scrape";
//const DATABASE_NAME = "vape_scrape_dummy";
const COLLECTION_NAME = "products";
//const COLLECTION_NAME = "dummy_data";
const _RATING_THRESHOLD = 0.85;

var database, collection, sikTable;

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
    await collection.insertOne(newProductObject, (err, res) => {
        if (err) {
            throw(err);
        }
    })
    return productObject;
}

// helper function to update the "prices" object
function updatePrices(productPrices, newPricesObject) {
    let updatedPrices = productPrices;

    // Find the index in price array matching the current product's vendor
    let updateIndex = productPrices.findIndex(priceEntry => {
        return priceEntry["vendor"] === newPricesObject["vendor"];
    })

    if (updateIndex === -1) {
        // Product is present in DB, but lacks the new vendor 
        updatedPrices.push(newPricesObject);
    } else {
        // Product is present in DB, update the specific vendor's previous price
        updatedPrices[updateIndex] = newPricesObject;
    }
    return updatedPrices;
}

module.exports = {
    open: () => {
        return new Promise((resolve, reject) => {
            sikTable = csvParser.parseSIK();
            MongoClient.connect(CONNECTION_URL, { useNewUrlParser: true, useUnifiedTopology: true }, (error, client) => {
                if (error) {
                    console.error(error);
                    reject(error);
                }
                database = client.db(DATABASE_NAME);
                collection = database.collection(COLLECTION_NAME);
                console.log("[DB Interface] Connected to `" + DATABASE_NAME + "`!");
                resolve(client);
            });
        })
    },
    search: (query, searchByName) => {
        return new Promise((resolve, reject) => {
            let findQuery = searchByName ? { "name": { $regex: new RegExp(query, "i") } } : ObjectId(query)

            collection
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
                * An item in the DB has the same SIK
                => Update the price (either add or update by vendor ID)
            
            Scenario 2. 
                * It has SIK scraped
                * No item in DB with same SIK
                => Add new product

            Scenario 3.
                * No SIK has been scraped
                * Look up in the Raw Data (CSV), can we get a 80% match on name?
                * Yes (over 80%): Same as scenario 1    
                * No (under 80%): 
                    * Search the whole DB for 80% match on string name:
                        * Over 80%: Scenario 1
                        * Under 80% Scenario 2    
        */

        return new Promise((resolve, reject) => {
            console.log(`[DB Interface] 'Add' called, searching for matches...`);
            const productSIK = productObject["sik"];
            const productPriceObject = {
                vendor: productObject["vendor"],
                price: productObject["price"],
                link: productObject["link"]
            };
            if (productSIK && productSIK.length > 0) {
                // we have a SIK
                collection
                    .find(
                        { "sik": productSIK }
                    )
                    .toArray((err, matchingSIKProduct) => {
                        if (err) throw err;
                        if (matchingSIKProduct.length == 1) {
                            // console.log("\tScenario 1, We found an item in the database")
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

                            // If there's a SIK match, we should use the SIK List's name for the object 
                            // if(sikTable.hasOwnProperty(productSIK)) {
                            //     databaseUpdate["name"] = sikTable[productSIK];
                            // }
                            collection.updateOne(
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
                            // console.log("\tScenario 2, No items with SIK in the database")
                            let updatedObject = insertNewProduct(productObject);
                            console.log(`[DB Interface] Added new product "${productObject["name"]}" (sik=${productSIK})`)
                            resolve(updatedObject);
                        }
                    });
            } else {
                // console.log("\tNo SIK, follow scenario 3")
                collection
                    .find(
                        {},
                        { projection: { _id: 0 } }
                    )
                    .toArray(function (err, currentProducts) {
                        if (err) reject(err);
                        if (currentProducts.length > 0) {
                            // console.log('\tSearching for name match...');
                            let currentProductNames = currentProducts.map(product => product.name);
                            let similarity = stringSimilarity.findBestMatch(productObject.name, currentProductNames);
                            let matchInDB = false;
                            // TODO: Tune rating threshold
                            if (similarity.bestMatch.rating > _RATING_THRESHOLD) {
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
                                // update databases' matched product with the updated price list
                                // TODO: maybe we can do it better?: https://stackoverflow.com/questions/31120111/mongodb-find-and-then-update
                                // TODO: Check if price is the same? Is update then necessary?
                                collection.updateOne(
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
                        // either there's no match, or we have no items in DB, either way...
                        // console.log("\tNo item or match in DB, adding new product...")
                        let newProudct = insertNewProduct(productObject);
                        resolve(newProudct);
                    });
            }
        })
    }
};