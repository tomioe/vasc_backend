const MongoClient = require("mongodb").MongoClient;
const ObjectId = require("mongodb").ObjectID;
const CONNECTION_URL = "mongodb://127.0.0.1:27017/";
const DUMMY_DATABASE_NAME = "vape_scrape_dummy";

const dummy_data = [
    {
        name: "Mod1",
        prices: {
            "vendor1": {"100": "http://url1.com/product1"},
            "vendor2": {"125": "http://url2.com/product1"}
        }
    },
    {
        name: "Mod2",
        prices: {
            "vendor1": {"300": "http://url1.com/product2"},
            "vendor2": {"200": "http://url2.com/product2"}
        }
    }
]

var database, collection;

MongoClient.connect(CONNECTION_URL, { useNewUrlParser: true, useUnifiedTopology: true }, (error, client) => {
    if(error) {
        throw error;
    }
    database = client.db(DUMMY_DATABASE_NAME);
    collection = database.collection("dummy_data");
    console.log("Connected to `" + DUMMY_DATABASE_NAME + "`!");
    collection.insertMany(dummy_data, (error, result) => {
        if(error) {
            console.error(error);
            return;
        }
        console.log("Dummy data inserted.")
        client.close();
    });
});
