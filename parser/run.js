const x = require('../db/db_interface')

x.open()
.then((client_db) => {
    setTimeout( () => {
        client_db.close();
    }, 4000);
})
.catch( e => {
    console.error(e);
});