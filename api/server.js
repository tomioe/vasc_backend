const express = require("express");
const bodyParser = require("body-parser");
const port = 3000;

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


const db_handler = require("../db/db_handler")

//Catches requests made to localhost:3000/search
app.get('/search', (req, res) => {
    let urlQuery = req.query.q;
    if(urlQuery) {
        db_handler
        .search(urlQuery)
        .then(items => {
            //console.log(util.inspect(items));
            res.json(items);
        })
        .catch(e => {
            console.error(e);
            res.status(500).send("Database error!");
        });
    } else {
        res.status(400).send("Invalid query.");
    }
});

//Catches requests made to localhost:3000/
app.get('/', (req, res) => res.send("Hello API!"));

//Initialises the express server on the port 30000
app.listen(port, () => {
    db_handler.start();
    console.log(`[API] Example app listening on port ${port}!`)
});
