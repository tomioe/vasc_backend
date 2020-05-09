const db_interface = require('./db_interface')

const testData = [
    {
        "name": "Mod1",
        "price": "333",
        "link": "http://test1.com/product1",
        "vendor": "Test1 Vendor"
    },
    {
        "name": "Mod2",
        "price": "222",
        "link": "http://test1.com/productX",
        "vendor": "Test1 Vendor"
    }
]
db_interface
    .open()
    .then((client_db) => {
        testData.forEach( product => {
            db_interface.add(product)
        })
        return client_db;
    })
    .catch( e => {
        console.error(e);
    });

