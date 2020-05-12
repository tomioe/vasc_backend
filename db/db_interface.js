const MongoClient = require("mongodb").MongoClient;
const ObjectId = require("mongodb").ObjectID;

const CONNECTION_URL = "mongodb://127.0.0.1:27017/";
const DATABASE_NAME = "vape_scrape";
//const DATABASE_NAME = "vape_scrape_dummy";
const COLLECTION_NAME = "products";
//const COLLECTION_NAME = "dummy_data";
var database, collection;

const util = require('util')

const stringSimilarity = require('string-similarity');

/*
    search(:string)
        return all products matching the string

    product(:id)
        return single product matching the ID
            see 'structure.product'

        TODO: copy of search
    
*/

module.exports = {
    open: () => {
        return new Promise((resolve, reject) => {
            MongoClient.connect(CONNECTION_URL, { useNewUrlParser: true, useUnifiedTopology: true }, (error, client) => {
                if (error) {
                    console.error(error);
                    reject(error);
                }
                database = client.db(DATABASE_NAME);
                collection = database.collection(COLLECTION_NAME);
                console.log("[DB Handler] Connected to `" + DATABASE_NAME + "`!");
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
                    if (err) throw reject(err);
                    console.log(result.length)
                    resolve(result);
                });
        })
    },
    add: productObject => {
        // New SIK method:
        /*
            A product is added...    
        
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
                * No (under 80%): Same as scenario 2    [GeekVape Frenzy from Damphuen]
        */

        // Old method:
        // 1. Search all db items
        // 2. Compare string-similarity on each result to projetObject["name"]
        // 3. If >90%, add price to this item
        // 4. Otherwise, add new product

        console.log(`Searching DB for matches...`);
        collection
            .find(
                {},
                { projection: { _id: 0 } }
            )
            .toArray(function (err, currentProducts) {
                if (err) throw err;
                var productPriceObject = {
                    vendor: productObject["vendor"],
                    price: productObject["price"],
                    link: productObject["link"]
                };
                // TODO: Read SIK raw-data in a key-value structure

                // TODO: When adding, compare to SIK in DB already
                if (currentProducts.length > 0) {
                    console.log('Searching for match...');
                    let currentProductNames = currentProducts.map(product => product.name);
                    let similarity = stringSimilarity.findBestMatch(productObject.name, currentProductNames);
                    let matchInDB = false;
                    // TODO: Tune rating threshold
                    if (similarity.bestMatch.rating > 0.9) {
                        matchInDB = true;
                        console.log("Found match with DB item '" + currentProducts[similarity.bestMatchIndex].name + "' and '"+  productObject.name +"', updating price.");
                        // extract the matched product's prices
                        let dbPricesToBeUpdated = currentProducts[similarity.bestMatchIndex].prices;

                        // Find the index in price array matching the current product's vendor
                        let updateIndex = dbPricesToBeUpdated.findIndex(priceObject => {
                            return priceObject.vendor === productObject.vendor;
                        })
                        
                        if(updateIndex === -1) {
                            // Product is present in DB, but lacks the new vendor 
                            dbPricesToBeUpdated.push(productPriceObject);
                        } else {
                            // Product is present in DB, update the specific vendor's previous price
                            dbPricesToBeUpdated[updateIndex] = productPriceObject;
                        }
                        
                        // TODO: Check if price is the same? Is update then necessary?

                        
                        
                        // update databases' matched product with the updated price list
                        // TODO: maybe we can do it better?
                        // https://stackoverflow.com/questions/31120111/mongodb-find-and-then-update
                        collection.updateOne(
                            { name: currentProducts[similarity.bestMatchIndex].name },
                            {
                                $set: { prices: dbPricesToBeUpdated },
                                $currentDate: { lastModified: true }
                            },
                            (err, res) => {
                                if (err) {
                                    console.error(err);
                                    return;
                                }
                                console.log("Updated product price.")
                            }
                        )
                    }
                    if(matchInDB) return;
                }
                // TODO: If no match, but SIK number in scraped data then add by SIK
                // either there's no match, or we have no items in DB, either way...
                console.log("No item or match in DB, adding new product...")
                const newProductObject = {
                    name: productObject["name"],
                    prices: [
                        productPriceObject
                    ]
                };
                collection.insertOne(newProductObject, (err, res) => {
                    if (err) {
                        console.error(error);
                        return;
                    }
                    console.log("Inserted new product.");
                })
            });
    }
};