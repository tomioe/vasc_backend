const db_handler = require('./db_handler')

const testData = [
    {
        "name": "Mod1",
        "price": "150",
        "link": "http://test1.com/product1",
        "vendor": "Test1 Vendor"
    },
    {
        "name": "Mod2",
        "price": "300",
        "link": "http://test1.com/productX",
        "vendor": "Test1 Vendor"
    }
]
db_handler.start()
    .then((client_db) => {
        testData.forEach( product => {
            db_handler.add(product)
        })
        return client_db;
    })
    .catch( e => {
        console.error(e);
    });

