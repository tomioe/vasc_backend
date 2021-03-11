const db_interface = require('./db_interface')

const testData = {
    "ipAddress": "1234",
    "time": new Date(),
    "site": "http://www.test1234.com",
    "deviceData": { "browser": "123", "agent": "test" }
};


(async () => {
    let db_client = await db_interface.open();
    let x = await db_interface.click(testData); 
    console.log(x);
    setTimeout( () => {
        db_client.close();
    }, 1500);
})();