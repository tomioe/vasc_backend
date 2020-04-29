const MongoClient = require("mongodb").MongoClient;
const ObjectId = require("mongodb").ObjectID;

const CONNECTION_URL = "mongodb://127.0.0.1:27017/";
//const DATABASE_NAME = "vape_scrape";
const DATABASE_NAME = "vape_scrape_dummy";
//const COLLECTION_NAME = "products";
const COLLECTION_NAME = "dummy_data";
var database, collection;

var stringSimilarity = require('string-similarity');


module.exports = {
    start: () => {
        MongoClient.connect(CONNECTION_URL, { useNewUrlParser: true, useUnifiedTopology: true }, (error, client) => {
            if(error) {
                console.error(error);
                throw error;
            }
            database = client.db(DATABASE_NAME);
            collection = database.collection(COLLECTION_NAME);
            console.log("[DB Handler] Connected to `" + DATABASE_NAME + "`!");
        });
    },
    search: query => {
        return new Promise( (resolve, reject) => {
            collection
                .find(
                    {"name": { $regex: new RegExp(query,"i") }},
                    { projection: { _id: 0 } }
                )
                .toArray(function (err, result) {
                    if (err) throw reject(err);
                    resolve(result);
                });
        })
    },
    add: productObject => {
        // search all db items
        // compare string-similarity on each result to projetObject["name"]
        // if >90%, add price to this item otherwise add new product
        var currentProducts = [];
        const productVendor = productObject.vendor;
        const productPrice = productObject.vendor;
        const productLink = productObject.vendor;
        const productPriceObject = {productPrice: productLink};
        collection
            .find(
                {},
                { projection: { _id: 0 } }
            )
            .toArray(function (err, results) {
                if (err) throw err;
                
                results.forEach( item => { 
                    currentProducts.push(item.name)
                    
                    /*
                        var myquery = { address: "Valley 345" };
                        var newvalues = { $set: {name: "Mickey", address: "Canyon 123" } };
                        dbo.collection("customers").updateOne(myquery, newvalues, function(err, res) {
                            if (err) throw err;
                            console.log("1 document updated");
                            db.close();
                        });
                    */
                });
            });
        let similarity = stringSimilarity.findBestMatch(productObject.name, currentProducts)
        if(similarity.bestMatch.rating > 0.8) {
            // update price for matched product
            const priceVendorIndex = "prices["+productObject.vendor+"]";
            console.log("Found match with '"+similarity.bestMatchIndex+"', updating price.");
            db.collection.updateOne(
                {name: currentProducts[similarity.bestMatchIndex]},
                {
                    $set: { priceVendorIndex: productPriceObject }
                },
                (err, res) => {
                    if(error) {
                        console.error(error);
                        return;
                    }
                    console.log("Updated product prices.")
                }
            )
        } else {
            console.log("No match in DB, adding new product.")
            const newProductObject = {
                name: productObject.name,
                prices: {
                    productVendor: productPriceObject
                }
            }
            db.collection.insertOne(newProductObject, (err, res) => {
                if(error) {
                    console.error(error);
                    return;
                }
                console.log("")
            })
        }
    }
};