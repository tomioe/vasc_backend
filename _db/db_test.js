const stringSimilarity = require('string-similarity')

const db_interface = require('./db_interface')

const testData = [
    // {
    //     "name": "Mod1",
    //     "price": "333",
    //     "link": "http://test1.com/product1",
    //     "vendor": "Test1 Vendor",
    //     "imageName": "D4735E3A265E16EEE03F59718B9B5D03019C07D8B6C51F90DA3A666EEC13AB35.jpg"
    // },
    {
        "name": "Mod2",
        "price": "222",
        "sik": "00274-17-02001",
        "link": "http://test1.com/productX",
        "vendor": "Test1 Y",
        "imageName": "none"
    },
    {
        "name": "Mod2",   // should trigger update to product above
        "price": "333",     // price is different
                            // no defined SIK
        "link": "http://test2.com/?product=Z",    // link is different
        "vendor": "Test2 X",    // vendor also differs
        "imageName": "CA978112CA1BBDCAFAC231B39A23DC4DA786EFF8147C4E72B9807785AFEE48BB.jpg"
    },
    // {
    //     "name": "VendorName Mod2",
    //     "price": "1800",
    //     "sik": "00274-17-02001",
    //     "link": "http://test3.com/WELOVEURLS",
    //     "vendor": "Test3 Vendor",
    //     "imageName": "none"
    // },
];


(async () => {
    let db_client = await db_interface.open();
    for(const productIndex in testData) {
        const x = await db_interface.add(testData[productIndex]);
    }
    setTimeout( () => {
        db_client.close();
    }, 1500);
})();