const db_interface = require('./db_interface')

const testData = {
    "ipAddress": "1234",
    "time": new Date(),
    "site": "http://www.test1234.com",
    "deviceData": { "browser": "123", "agent": "test" }
};


(async () => {
    let db_client = await db_interface.open();
    //let x = await db_interface.click(testData); 
    let y = await db_interface.statsUsers();
    console.log("Return stats:")
    console.log(y);
    console.log("------")
    setTimeout( () => {
        db_client.close();
    }, 1500);
})();